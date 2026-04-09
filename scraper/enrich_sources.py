"""
enrich_sources.py — Tự động tìm thêm nguồn dự phòng cho phim đã có trong DB.

Mục tiêu:
  - Với mỗi phim trong DB, tìm thêm nguồn mới (OPhim, KKPhim, NguonPhim, AI search)
  - Gộp server/episode từ nguồn mới vào movie record hiện có
  - User có thể chọn nguồn thứ 2, 3... nếu nguồn đầu bị lag/down

Chạy:
    python enrich_sources.py all           # Quét toàn bộ phim trong DB
    python enrich_sources.py tracked       # Chỉ quét phim trong TRACKED_MOVIES
    python enrich_sources.py slug <slug>   # Quét 1 phim cụ thể

Cron: mỗi tuần 1 lần (ví dụ Chủ Nhật 03:00 AM)
"""
import asyncio
import json
import re
import sys
import httpx
from datetime import datetime
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.progress import track

from database import db
from sources.ophim_source import OPhimSource
from sources.kkphim_source import KKPhimSource
from sources.nguonphim_source import NguonPhimSource
from sources.dynamic_source import DynamicOPhimSource

console = Console()

FIXED_SOURCES = {
    "ophim":     {"base_url": "https://ophim1.com",         "cls": OPhimSource},
    "kkphim":    {"base_url": "https://phimapi.com",         "cls": KKPhimSource},
    "nguonphim": {"base_url": "https://phim.nguonc.com/api", "cls": NguonPhimSource},
}

# ── AI client ──────────────────────────────────────────────────────────────
def _get_ai_client():
    import os
    try:
        from openai import AsyncOpenAI
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            return None
        return AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    except ImportError:
        return None


def _get_ddgs():
    try:
        from ddgs import DDGS
        return DDGS()
    except ImportError:
        try:
            from duckduckgo_search import DDGS
            return DDGS()
        except ImportError:
            return None


# ── Search trên từng nguồn cố định ────────────────────────────────────────
async def _search_fixed(source_name: str, keyword: str, http: httpx.AsyncClient) -> list[dict]:
    urls = {
        "ophim":     f"https://ophim1.com/tim-kiem?keyword={keyword}&page=1",
        "kkphim":    f"https://phimapi.com/tim-kiem?keyword={keyword}&page=1",
        "nguonphim": f"https://phim.nguonc.com/api/films/search?keyword={keyword}&page=1",
    }
    try:
        resp = await http.get(urls[source_name], timeout=15)
        data = resp.json()
        return [{"slug": i.get("slug", ""), "title": i.get("name", i.get("title", ""))}
                for i in data.get("items", []) if i.get("slug")]
    except Exception:
        return []


def _best_match(keyword: str, candidates: list[dict]) -> dict | None:
    kw = keyword.lower()
    for c in candidates:
        if kw in c["title"].lower():
            return c
    return candidates[0] if candidates else None


# ── Crawl + upsert 1 movie từ nguồn cố định ────────────────────────────────
async def _crawl_fixed(source_name: str, slug: str) -> dict | None:
    src_cls = FIXED_SOURCES[source_name]["cls"]
    try:
        src = src_cls()
        detail = await src.get_movie_detail(slug)
        if not detail:
            return None
        src_id = await db.get_or_create_source(
            source_name, FIXED_SOURCES[source_name]["base_url"], "api"
        )
        detail["source_id"] = src_id
        detail["source_name"] = source_name
        movie_id = await db.upsert_movie(detail)
        if detail.get("episodes"):
            await db.upsert_episodes(movie_id, detail["episodes"], source_name=source_name)
        return detail
    except Exception as e:
        console.print(f"    [dim]crawl fixed [{source_name}/{slug}]: {e}[/dim]")
        return None


# ── AI: tìm nguồn web bất kỳ và normalize mọi format ──────────────────────
async def _ai_search_sources(keyword: str, ai_client) -> list[dict]:
    """Dùng DuckDuckGo + AI để tìm website có phim, trả về danh sách nguồn."""
    if not ai_client:
        return []

    ddgs = _get_ddgs()
    if not ddgs:
        return []

    search_results = []
    seen = set()
    queries = [
        f"xem phim \"{keyword}\" vietsub",
        f"\"{keyword}\" anime vietsub full",
    ]
    for q in queries:
        try:
            for r in ddgs.text(q, max_results=8):
                url = r.get("href") or r.get("link", "")
                if url and url not in seen:
                    skip = ["google.", "youtube.", "facebook.", "tiktok.", "twitter.",
                            "wikipedia.", "reddit.", "amazon.", "netflix.", "apple.",
                            "fptplay.", "vieon.", "instagram.", "zalo."]
                    if not any(s in url.lower() for s in skip):
                        search_results.append({"url": url, "title": r.get("title", ""), "body": r.get("body", "")})
                        seen.add(url)
        except Exception:
            pass
        await asyncio.sleep(0.5)

    if not search_results:
        return []

    results_text = "\n".join(
        f"- URL: {r['url']}\n  Title: {r['title']}\n  Snippet: {r['body'][:150]}"
        for r in search_results[:12]
    )
    prompt = f"""Find streaming sources for "{keyword}" from these search results.

{results_text}

Return JSON array only (no markdown):
[{{
  "site_name": "name",
  "base_url": "https://...",
  "slug": "movie-slug",
  "detail_page_url": "full url",
  "has_ophim_api": true/false,
  "api_base_url": "https://api... or null",
  "confidence": "high/medium/low"
}}]
Return [] if none found."""

    try:
        resp = await ai_client.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {"role": "system", "content": "JSON-only. No markdown. Return raw JSON array."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        text = resp.choices[0].message.content.strip()
        if "```" in text:
            match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
            text = match.group(1) if match else re.sub(r"```[a-z]*", "", text).replace("```", "").strip()
        return json.loads(text) if isinstance(json.loads(text), list) else []
    except Exception:
        return []


async def _ai_normalize(raw: str, url: str, ai_client, keyword: str) -> dict | None:
    """Map bất kỳ JSON/HTML nào về schema movie của mình."""
    if not ai_client:
        return None
    prompt = f"""Extract movie data for "{keyword}" from this scraped content.
URL: {url}
Content (first 8000 chars):
{raw[:8000]}

Return ONLY this JSON schema (no markdown, null for missing fields):
{{
  "title": null, "original_title": null, "slug": null,
  "description": null, "poster_url": null, "thumb_url": null,
  "movie_type": "phim-le|phim-bo|hoathinh|tvshows",
  "status": null, "quality": null, "language": null, "year": null,
  "total_episodes": null, "current_episode": null,
  "director": null, "actors": null,
  "genres": [{{"name": "", "slug": ""}}],
  "countries": [{{"name": "", "slug": ""}}],
  "episodes": [{{
    "episode_number": 1, "name": "Tập 1", "slug": "tap-1",
    "servers": [{{"server_name": "Server 1", "server_type": "vietsub",
                  "embed_url": null, "m3u8_url": null, "quality": "HD"}}]
  }}]
}}
Return null if not a movie page."""
    try:
        resp = await ai_client.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {"role": "system", "content": "JSON-only extractor. Return raw JSON or null."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        text = resp.choices[0].message.content.strip()
        if text.lower() == "null" or not text:
            return None
        if "```" in text:
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
            text = match.group(1) if match else re.sub(r"```[a-z]*", "", text).replace("```", "").strip()
        return json.loads(text)
    except Exception:
        return None


async def _crawl_ai_source(result: dict, keyword: str, ai_client,
                            http: httpx.AsyncClient) -> bool:
    """Thử crawl 1 nguồn AI-discovered với mọi format (OPhim, JSON, HTML)."""
    site_name = result.get("site_name", "unknown")
    base_url  = result.get("base_url", "").rstrip("/")
    slug      = result.get("slug", "")
    api_base  = result.get("api_base_url")
    has_api   = result.get("has_ophim_api", False)
    detail_url = result.get("detail_page_url", "")

    if not base_url:
        return False

    # 1. OPhim-compatible API
    if has_api and api_base and slug:
        try:
            src = DynamicOPhimSource(site_name, api_base)
            detail = await src.get_movie_detail(slug)
            if detail and (detail.get("title") or detail.get("episodes")):
                src_id = await db.get_or_create_source(site_name, api_base, "ai-discovered")
                detail["source_id"] = src_id
                detail["source_name"] = site_name
                movie_id = await db.upsert_movie(detail)
                if detail.get("episodes"):
                    await db.upsert_episodes(movie_id, detail["episodes"], source_name=site_name)
                console.print(f"    [green]✅ [OPhim API] {site_name}[/green]")
                return True
        except Exception:
            pass

    # 2. Probe URLs → bất kỳ format nào
    probe_urls = []
    if slug:
        probe_urls = [
            f"{base_url}/phim/{slug}",
            f"{base_url}/api/phim/{slug}",
            f"{base_url}/v1/api/phim/{slug}",
            f"{base_url}/api/film/{slug}",
            f"{base_url}/api/movies/{slug}",
        ]
    if detail_url:
        probe_urls = [detail_url, detail_url.replace("/xem-phim/", "/phim/")] + probe_urls

    movie_signals = ["episode", "tập", "vietsub", "phim", "anime", "embed", "m3u8", "player", "stream"]

    for probe_url in probe_urls:
        if not probe_url:
            continue
        try:
            resp = await http.get(probe_url, timeout=20)
            if resp.status_code != 200:
                continue

            ct  = resp.headers.get("content-type", "")
            raw = resp.text

            # JSON
            if "json" in ct or raw.strip().startswith("{") or raw.strip().startswith("["):
                try:
                    data = resp.json()
                except Exception:
                    data = None
                # OPhim-like JSON
                if isinstance(data, dict):
                    movie_raw = data.get("movie") or data.get("item") or data.get("data")
                    if movie_raw and (movie_raw.get("name") or movie_raw.get("title")):
                        try:
                            s = slug or movie_raw.get("slug", "")
                            src = DynamicOPhimSource(site_name, base_url)
                            detail = await src.get_movie_detail(s)
                            if detail:
                                src_id = await db.get_or_create_source(site_name, base_url, "ai-discovered")
                                detail["source_id"] = src_id
                                detail["source_name"] = site_name
                                movie_id = await db.upsert_movie(detail)
                                if detail.get("episodes"):
                                    await db.upsert_episodes(movie_id, detail["episodes"], source_name=site_name)
                                console.print(f"    [green]✅ [OPhim-like JSON] {site_name}[/green]")
                                return True
                        except Exception:
                            pass
                # Bất kỳ JSON nào có tín hiệu phim → AI normalize
                if any(kw in raw.lower() for kw in movie_signals) and ai_client:
                    normalized = await _ai_normalize(raw, probe_url, ai_client, keyword)
                    if normalized and (normalized.get("title") or normalized.get("original_title")):
                        normalized.setdefault("slug", slug or keyword.lower().replace(" ", "-"))
                        src_id = await db.get_or_create_source(site_name, base_url, "ai-discovered")
                        normalized["source_id"] = src_id
                        normalized["source_name"] = site_name
                        movie_id = await db.upsert_movie(normalized)
                        if normalized.get("episodes"):
                            await db.upsert_episodes(movie_id, normalized["episodes"], source_name=site_name)
                        console.print(f"    [green]✅ [AI→JSON] {site_name}[/green]")
                        return True

            # HTML → AI extract
            elif "html" in ct and ai_client:
                if any(kw in raw.lower() for kw in ["player", "m3u8", "embed", "vietsub", "tập"]):
                    normalized = await _ai_normalize(raw, probe_url, ai_client, keyword)
                    if normalized and (normalized.get("title") or normalized.get("original_title")):
                        normalized.setdefault("slug", slug or keyword.lower().replace(" ", "-"))
                        src_id = await db.get_or_create_source(site_name, base_url, "ai-discovered")
                        normalized["source_id"] = src_id
                        normalized["source_name"] = site_name
                        movie_id = await db.upsert_movie(normalized)
                        if normalized.get("episodes"):
                            await db.upsert_episodes(movie_id, normalized["episodes"], source_name=site_name)
                        console.print(f"    [green]✅ [AI→HTML] {site_name}[/green]")
                        return True

        except Exception as e:
            console.print(f"    [dim]probe {probe_url}: {e}[/dim]")

    return False


# ── Core enrichment logic cho 1 movie ─────────────────────────────────────
async def enrich_one(movie: dict, ai_client, http: httpx.AsyncClient,
                     existing_source_names: set[str]) -> dict:
    """
    Tìm thêm nguồn cho 1 movie. Trả về dict kết quả.
    movie: {"id", "title", "slug", "source_names": [...]}
    """
    title = movie.get("title") or movie.get("slug", "")
    slug  = movie.get("slug", "")
    results = {"title": title, "slug": slug, "new_sources": [], "skipped": []}

    keyword = title  # dùng title làm keyword tìm kiếm

    # 1. Tìm trên 3 nguồn cố định chưa có
    for sname in FIXED_SOURCES:
        if sname in existing_source_names:
            results["skipped"].append(sname)
            continue
        hits = await _search_fixed(sname, keyword, http)
        best = _best_match(keyword, hits)
        if best:
            console.print(f"  [cyan]► Found on [{sname}]: {best['title']}[/cyan]")
            detail = await _crawl_fixed(sname, best["slug"])
            if detail:
                results["new_sources"].append(sname)
                existing_source_names.add(sname)
        await asyncio.sleep(0.3)

    # 2. AI search cho nguồn web bất kỳ chưa có
    ai_results = await _ai_search_sources(keyword, ai_client)
    if ai_results:
        console.print(f"  [dim]🤖 AI found {len(ai_results)} candidate(s)[/dim]")
        for r in ai_results:
            site = r.get("site_name", "")
            base = r.get("base_url", "")
            if any(base in s for s in existing_source_names):
                continue  # Đã có nguồn này
            ok = await _crawl_ai_source(r, keyword, ai_client, http)
            if ok:
                results["new_sources"].append(site)
                existing_source_names.add(base)

    return results


# ── Lấy danh sách movies từ DB ────────────────────────────────────────────
async def _get_movies_with_sources(limit: int = 500, offset: int = 0) -> list[dict]:
    """Lấy movies kèm list tên nguồn hiện tại."""
    async with db.pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT m.id, m.title, m.slug,
                   ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as source_names
            FROM movies m
            LEFT JOIN episodes e ON e.movie_id = m.id
            LEFT JOIN episode_servers es ON es.episode_id = e.id
            LEFT JOIN sources s ON s.id = es.source_id
            GROUP BY m.id, m.title, m.slug
            ORDER BY m.updated_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)
        return [dict(r) for r in rows]


async def _get_movies_by_slugs(slugs: list[str]) -> list[dict]:
    async with db.pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT m.id, m.title, m.slug,
                   ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as source_names
            FROM movies m
            LEFT JOIN episodes e ON e.movie_id = m.id
            LEFT JOIN episode_servers es ON es.episode_id = e.id
            LEFT JOIN sources s ON s.id = es.source_id
            WHERE m.slug = ANY($1::text[])
            GROUP BY m.id, m.title, m.slug
        """, slugs)
        return [dict(r) for r in rows]


# ── Commands ───────────────────────────────────────────────────────────────
async def cmd_enrich_all(limit: int = 200):
    """Quét toàn bộ phim trong DB (mới nhất trước)."""
    await db.connect()
    ai_client = _get_ai_client()
    if ai_client:
        console.print("[green]✓ AI client ready — any response format will be normalized[/green]")
    else:
        console.print("[yellow]⚠ No OPENROUTER_API_KEY — AI disabled, fixed sources only[/yellow]")

    summary = []
    try:
        movies = await _get_movies_with_sources(limit=limit)
        console.print(f"[bold cyan]🔍 Enriching {len(movies)} movies...[/bold cyan]\n")

        async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                      headers={"User-Agent": "Mozilla/5.0"}) as http:
            for movie in movies:
                existing = set(movie.get("source_names") or [])
                console.rule(f"[bold]{movie['title']} ({movie['slug']})[/bold] — Sources: {existing or '(none)'}")
                result = await enrich_one(movie, ai_client, http, existing)
                summary.append(result)
                if result["new_sources"]:
                    console.print(f"  [bold green]+{len(result['new_sources'])} new source(s): {result['new_sources']}[/bold green]")
                else:
                    console.print(f"  [dim]No new sources found[/dim]")
                await asyncio.sleep(1)  # rate limit

        _print_summary(summary)

    finally:
        if ai_client:
            await ai_client.close()
        await db.close()


async def cmd_enrich_tracked():
    """Chỉ enrich các phim trong TRACKED_MOVIES."""
    # Import TRACKED_MOVIES từ find_and_track_movies
    sys.path.insert(0, str(Path(__file__).parent))
    from find_and_track_movies import TRACKED_MOVIES

    await db.connect()
    ai_client = _get_ai_client()
    summary = []

    try:
        # Tìm slugs từ DB dựa trên title
        async with db.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, title, slug FROM movies
                WHERE LOWER(title) = ANY($1::text[]) OR LOWER(original_title) = ANY($1::text[])
            """, [t.lower() for t in TRACKED_MOVIES])

        movies_found = [dict(r) for r in rows]
        slugs = [m["slug"] for m in movies_found]
        movies_with_src = await _get_movies_by_slugs(slugs)

        console.print(f"[bold cyan]🔍 Enriching {len(movies_with_src)} tracked movies...[/bold cyan]\n")

        async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                      headers={"User-Agent": "Mozilla/5.0"}) as http:
            for movie in movies_with_src:
                existing = set(movie.get("source_names") or [])
                console.rule(f"[bold]{movie['title']}[/bold] — Current sources: {existing or '(none)'}")
                result = await enrich_one(movie, ai_client, http, existing)
                summary.append(result)
                if result["new_sources"]:
                    console.print(f"  [bold green]+{len(result['new_sources'])} new source(s)[/bold green]")
                await asyncio.sleep(1)

        _print_summary(summary)

    finally:
        if ai_client:
            await ai_client.close()
        await db.close()


async def cmd_enrich_slug(slug: str):
    """Enrich 1 phim cụ thể theo slug."""
    await db.connect()
    ai_client = _get_ai_client()

    try:
        movies = await _get_movies_by_slugs([slug])
        if not movies:
            console.print(f"[red]Movie with slug '{slug}' not found in DB[/red]")
            return

        movie = movies[0]
        existing = set(movie.get("source_names") or [])
        console.rule(f"[bold]{movie['title']}[/bold] — Existing: {existing or '(none)'}")

        async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                      headers={"User-Agent": "Mozilla/5.0"}) as http:
            result = await enrich_one(movie, ai_client, http, existing)

        if result["new_sources"]:
            console.print(f"\n[bold green]✅ Added {len(result['new_sources'])} new source(s): {result['new_sources']}[/bold green]")
        else:
            console.print(f"\n[yellow]No new sources found for '{movie['title']}'[/yellow]")

    finally:
        if ai_client:
            await ai_client.close()
        await db.close()


def _print_summary(summary: list[dict]):
    table = Table(title="📊 Enrichment Summary", header_style="bold magenta")
    table.add_column("Movie", style="cyan", max_width=35)
    table.add_column("New Sources", style="green")
    table.add_column("Skipped")

    enriched = sum(1 for r in summary if r["new_sources"])
    for r in summary:
        new = ", ".join(r["new_sources"]) or "—"
        skipped = ", ".join(r["skipped"]) or "—"
        table.add_row(r["title"][:35], new, skipped)

    console.print(table)
    console.print(f"\n[bold]Enriched: {enriched}/{len(summary)} movies[/bold]")


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "all":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200
        console.print(f"[bold magenta]🌐 Source Enricher — ALL ({limit} movies)[/bold magenta]")
        asyncio.run(cmd_enrich_all(limit=limit))

    elif cmd == "tracked":
        console.print("[bold magenta]🌐 Source Enricher — TRACKED MOVIES[/bold magenta]")
        asyncio.run(cmd_enrich_tracked())

    elif cmd == "slug" and len(sys.argv) > 2:
        console.print(f"[bold magenta]🌐 Source Enricher — slug: {sys.argv[2]}[/bold magenta]")
        asyncio.run(cmd_enrich_slug(sys.argv[2]))

    else:
        console.print("""
[yellow]Usage:[/yellow]
  python enrich_sources.py all [limit]      # Quét toàn bộ DB (default 200 phim)
  python enrich_sources.py tracked          # Chỉ quét TRACKED_MOVIES
  python enrich_sources.py slug <slug>      # Quét 1 phim cụ thể

[dim]Tác dụng: Tìm thêm nguồn dự phòng cho mỗi phim (OPhim/KKPhim/NguonPhim + AI web search)
Dùng khi: nguồn chính bị lag/down, user có thể chọn nguồn khác[/dim]
        """)
