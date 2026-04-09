"""
find_and_track_movies.py — Tìm phim yêu cầu trên TẤT CẢ các nguồn và theo dõi cập nhật hàng ngày.

Luồng hoạt động:
  1. Lấy danh sách phim từ TRACKED_MOVIES (keyword search)
  2. Tìm kiếm song song trên OPhim, KKPhim, NguonPhim (và AI-discovered sources từ DB)
  3. Nếu phim KHÔNG tìm thấy trên các nguồn trên → dùng AI (DuckDuckGo + Gemini)
     để tìm website bất kỳ nào có phim đó, phát hiện API endpoint, crawl từ đó
  4. Merge episodes/servers vào cùng 1 movie record trong DB
  5. Lưu tracked_movies.json để cronjob hàng ngày biết phim nào cần check update

Usage:
    python find_and_track_movies.py import   # Tìm & import lần đầu từ TẤT CẢ nguồn + AI
    python find_and_track_movies.py update   # Cập nhật hàng ngày (gọi bởi cronjob)
"""
import asyncio
import json
import re
import sys
import httpx
from pathlib import Path
from datetime import datetime
from rich.console import Console
from rich.table import Table

from database import db
from sources.ophim_source import OPhimSource
from sources.kkphim_source import KKPhimSource
from sources.nguonphim_source import NguonPhimSource

console = Console()

# ─────────────────────────────────────────────────────────────────────────────
# DANH SÁCH PHIM CẦN THEO DÕI ĐẶC BIỆT
# ─────────────────────────────────────────────────────────────────────────────
TRACKED_MOVIES = [
    "Tết ở làng địa ngục",          # Vietnamese original
    "Ouran high school host club",   # Ouran hot culb
    "Kiss him not me",
    "Dance with devils",
    "Fairy Tail",                    # Fairytail
    "Yona of the Dawn",              # Akatsuki no Yona
    "Kamigami no Asobi",             # Trò Đùa Của Thần Linh
    "The Wallflower",                # Bức Tường Hoa / Yamato Nadeshiko Shichi Henge
    "Romantic Killer",               # Kẻ Giết Người Lãng Mạn 2022
    "The Promised Neverland",        # Yakusoku no Neverland / Địa Ngục Hẹn Ước 2019
    "Death Parade",                  # Sân Khấu Chết Chóc 2015
    "Durarara",                      # Những Cuộc Phiêu Lưu Kì Bí Ở Ikebukuro 2010
]

TRACKED_FILE = Path(__file__).parent / "tracked_movies.json"

# Nguồn cố định
FIXED_SOURCES = {
    "ophim":     {"base_url": "https://ophim1.com",          "cls": OPhimSource},
    "kkphim":    {"base_url": "https://phimapi.com",          "cls": KKPhimSource},
    "nguonphim": {"base_url": "https://phim.nguonc.com/api",  "cls": NguonPhimSource},
}


# ─────────────────────────────────────────────────────────────────────────────
# AI helpers (dùng OPENROUTER_API_KEY trong env)
# ─────────────────────────────────────────────────────────────────────────────
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


async def _ai_find_movie_source(keyword: str, ai_client) -> list[dict]:
    """
    Dùng AI để tìm website phim nào có keyword, trả về list:
    [{"site_name": ..., "base_url": ..., "slug": ..., "detail_url": ...}, ...]
    """
    if not ai_client:
        console.print(f"  [yellow]⚠ AI client unavailable, skipping AI search[/yellow]")
        return []

    # Bước 1: DuckDuckGo tìm website có phim đó
    ddgs = _get_ddgs()
    search_results = []
    if ddgs:
        queries = [
            f"xem phim \"{keyword}\" vietsub online",
            f"\"{keyword}\" vietsub full tập",
            f"watch \"{keyword}\" vietsub phim",
        ]
        seen_urls = set()
        for q in queries:
            try:
                results = ddgs.text(q, max_results=10)
                for r in results:
                    url = r.get("href") or r.get("link", "")
                    if url and url not in seen_urls:
                        # Lọc các trang chắc chắn không phải movie site
                        skip = ["google.", "youtube.", "facebook.", "tiktok.", "twitter.",
                                "wikipedia.", "reddit.", "amazon.", "netflix.com", "apple.",
                                "fptplay.", "vieon.", "instagram.", "zalo."]
                        if not any(s in url.lower() for s in skip):
                            search_results.append({"url": url, "title": r.get("title", ""), "body": r.get("body", "")})
                            seen_urls.add(url)
            except Exception as e:
                console.print(f"  [dim]DuckDuckGo error: {e}[/dim]")
            await asyncio.sleep(0.5)
    else:
        console.print(f"  [yellow]⚠ DuckDuckGo not available[/yellow]")

    if not search_results:
        return []

    console.print(f"  [dim]🔍 AI analyzing {len(search_results)} search results for '{keyword}'...[/dim]")

    # Bước 2: Dùng AI phân tích list URL → tìm trang có phim + slug
    results_text = "\n".join(
        f"- URL: {r['url']}\n  Title: {r['title']}\n  Snippet: {r['body'][:200]}"
        for r in search_results[:15]
    )

    prompt = f"""I need to find the anime/movie "{keyword}" on Vietnamese movie streaming websites.

Here are search results from DuckDuckGo:
{results_text}

Task:
1. Identify which URLs are actual Vietnamese movie/anime streaming websites (not blogs, forums, or news)
2. For each valid streaming site found, determine the movie slug in their URL pattern
3. Check if the site likely uses an OPhim-compatible API (ophim, kkphim, nguonc, phimapi patterns)

Respond ONLY with valid JSON array (no markdown fences):
[
  {{
    "site_name": "short name of site",
    "base_url": "https://example.com",
    "slug": "movie-slug-in-their-url",
    "detail_page_url": "full URL to the movie detail page",
    "has_ophim_api": true or false,
    "api_base_url": "https://api.example.com if has_ophim_api is true, else null",
    "confidence": "high/medium/low"
  }}
]

If no valid streaming sites found, return empty array: []"""

    try:
        response = await ai_client.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {"role": "system", "content": "You are a JSON-only responder. Never use markdown fences. Always return raw JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        text = response.choices[0].message.content.strip()

        # Strip markdown fences if model disobeys
        if "```" in text:
            match = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
            text = match.group(1) if match else re.sub(r"```[a-z]*", "", text).replace("```", "").strip()

        results = json.loads(text)
        console.print(f"  [green]🤖 AI found {len(results)} potential source(s) for '{keyword}'[/green]")
        return results if isinstance(results, list) else []

    except Exception as e:
        console.print(f"  [red]AI analysis error: {e}[/red]")
        return []


async def _ai_normalize_to_schema(raw_data: str, source_url: str, ai_client, keyword: str) -> dict | None:
    """
    Nhờ AI map BẤT KỲ JSON/HTML response nào về schema movie của chúng ta.
    raw_data: chuỗi JSON hoặc HTML (cắt ngắn 8000 ký tự)
    """
    if not ai_client:
        return None

    prompt = f"""I scraped this data from a Vietnamese movie website for the movie/anime "{keyword}".
Source URL: {source_url}

Raw data (first 8000 chars):
{raw_data[:8000]}

Extract all available information and return ONLY a valid JSON object with this schema (no markdown):
{{
  "title": "Vietnamese title",
  "original_title": "Original/Japanese/English title",
  "slug": "url-slug of the movie on this site",
  "description": "plot summary",
  "poster_url": "full URL to poster image",
  "thumb_url": "full URL to thumbnail image",
  "movie_type": "phim-le OR phim-bo OR hoathinh OR tvshows",
  "status": "ongoing OR completed OR full OR hoàn tất",
  "quality": "HD or FHD or CAM etc",
  "language": "Vietsub or Thuyết Minh etc",
  "year": 2023,
  "total_episodes": 12,
  "current_episode": "Tập 8 or Full etc",
  "director": "name",
  "actors": "comma separated names",
  "genres": [{{"name": "Hành Động", "slug": "hanh-dong"}}],
  "countries": [{{"name": "Nhật Bản", "slug": "nhat-ban"}}],
  "episodes": [
    {{
      "episode_number": 1,
      "name": "Tập 1",
      "slug": "tap-1",
      "servers": [
        {{
          "server_name": "Server 1",
          "server_type": "vietsub",
          "embed_url": "https://...",
          "m3u8_url": "https://... or null",
          "quality": "HD"
        }}
      ]
    }}
  ]
}}

Rules:
- If field data is missing, use null (not empty string)
- For episodes, extract as many as visible in the data
- embed_url should be an actual streaming embed link if visible
- Return null if this is clearly not a movie data page"""

    try:
        response = await ai_client.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {"role": "system", "content": "You are a JSON-only data extractor. Never use markdown. Return raw JSON or the word null."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        text = response.choices[0].message.content.strip()
        if text.lower() == "null" or not text:
            return None
        if "```" in text:
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
            text = match.group(1) if match else re.sub(r"```[a-z]*", "", text).replace("```", "").strip()
        return json.loads(text)
    except Exception as e:
        console.print(f"  [dim]AI normalize error: {e}[/dim]")
        return None


async def _crawl_from_ai_discovered(keyword: str, ai_results: list[dict], _cache: dict) -> bool:
    """
    Thử crawl phim từ các nguồn do AI tìm ra.
    Chiến lược theo thứ tự:
      1. OPhim-compatible API  → DynamicOPhimSource
      2. Probe nhiều URL pattern → nếu có JSON data → AI normalize về schema
      3. Fetch HTML page trực tiếp → AI normalize
    Trả về True nếu import thành công ít nhất 1 nguồn.
    """
    from sources.dynamic_source import DynamicOPhimSource
    ai_client = _get_ai_client()
    success = False

    async with httpx.AsyncClient(timeout=25, follow_redirects=True,
                                  headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}) as client:
        for result in ai_results:
            if result.get("confidence") == "low":
                continue

            site_name  = result.get("site_name", "unknown")
            base_url   = result.get("base_url", "").rstrip("/")
            slug       = result.get("slug", "")
            api_base   = result.get("api_base_url")
            has_api    = result.get("has_ophim_api", False)
            detail_url = result.get("detail_page_url", "")

            if not base_url:
                continue

            console.print(f"  🌐 Attempting [{site_name}] slug='{slug}'")

            # ── Strategy 1: OPhim-compatible API ────────────────────────────
            if has_api and api_base and slug:
                try:
                    src = DynamicOPhimSource(site_name, api_base)
                    detail = await src.get_movie_detail(slug)
                    if detail and (detail.get("episodes") or detail.get("title")):
                        src_id = await db.get_or_create_source(site_name, api_base, "ai-discovered")
                        detail["source_id"] = src_id
                        detail["source_name"] = site_name
                        movie_id = await db.upsert_movie(detail)
                        if detail.get("episodes"):
                            await db.upsert_episodes(movie_id, detail["episodes"], source_name=site_name)
                        console.print(f"  [green]✅ [Strategy 1 - OPhim API] Imported from [{site_name}][/green]")
                        success = True
                        continue
                except Exception as e:
                    console.print(f"  [dim]Strategy 1 failed: {e}[/dim]")

            # ── Strategy 2: Probe API patterns → bất kỳ JSON có data ───────
            probe_urls = []
            if slug:
                probe_urls = [
                    f"{base_url}/phim/{slug}",
                    f"{base_url}/api/phim/{slug}",
                    f"{base_url}/v1/api/phim/{slug}",
                    f"{base_url}/api/film/{slug}",
                    f"{base_url}/api/v1/film/{slug}",
                    f"{base_url}/api/movies/{slug}",
                ]
            if detail_url:
                probe_urls.insert(0, detail_url.replace("/xem-phim/", "/phim/"))
                probe_urls.insert(1, detail_url)

            for probe_url in probe_urls:
                if not probe_url:
                    continue
                try:
                    resp = await client.get(probe_url)
                    if resp.status_code != 200:
                        continue

                    content_type = resp.headers.get("content-type", "")
                    raw = resp.text

                    # Kiểm tra nếu JSON
                    if "json" in content_type or raw.strip().startswith("{") or raw.strip().startswith("["):
                        try:
                            data = resp.json()
                        except Exception:
                            data = None

                        # Kiểm tra OPhim format trước
                        movie_raw = None
                        if isinstance(data, dict):
                            movie_raw = data.get("movie") or data.get("item") or data.get("data")
                            if movie_raw and (movie_raw.get("name") or movie_raw.get("title")):
                                # OPhim-like → DynamicOPhimSource
                                try:
                                    src = DynamicOPhimSource(site_name, base_url)
                                    s_slug = slug or movie_raw.get("slug", "")
                                    if s_slug:
                                        detail = await src.get_movie_detail(s_slug)
                                        if detail:
                                            src_id = await db.get_or_create_source(site_name, base_url, "ai-discovered")
                                            detail["source_id"] = src_id
                                            detail["source_name"] = site_name
                                            movie_id = await db.upsert_movie(detail)
                                            if detail.get("episodes"):
                                                await db.upsert_episodes(movie_id, detail["episodes"], source_name=site_name)
                                            console.print(f"  [green]✅ [Strategy 2a - OPhim-like JSON] Imported from [{site_name}][/green]")
                                            success = True
                                            break
                                except Exception:
                                    pass

                        # Không phải OPhim → nhờ AI normalize BẤT KỲ data nào
                        # (chỉ cần response có gì đó giống dữ liệu phim)
                        has_movie_signal = any(kw in raw.lower() for kw in
                            ["episode", "tập", "vietsub", "phim", "anime", "embed", "m3u8", "player", "stream"])
                        if has_movie_signal and ai_client:
                            console.print(f"  [dim]🤖 Non-OPhim data found at {probe_url}, asking AI to normalize...[/dim]")
                            normalized = await _ai_normalize_to_schema(raw, probe_url, ai_client, keyword)
                            if normalized and (normalized.get("title") or normalized.get("original_title")):
                                normalized["source_url"] = probe_url
                                normalized.setdefault("slug", slug or keyword.lower().replace(" ", "-"))
                                src_id = await db.get_or_create_source(site_name, base_url, "ai-discovered")
                                normalized["source_id"] = src_id
                                normalized["source_name"] = site_name
                                movie_id = await db.upsert_movie(normalized)
                                if normalized.get("episodes"):
                                    await db.upsert_episodes(movie_id, normalized["episodes"], source_name=site_name)
                                console.print(f"  [green]✅ [Strategy 2b - AI normalized JSON] Imported from [{site_name}][/green]")
                                success = True
                                break

                    # HTML page → AI extract
                    elif "html" in content_type and ai_client:
                        has_movie_signal = any(kw in raw.lower() for kw in
                            ["player", "embed", "m3u8", "vietsub", "tập", "episode"])
                        if has_movie_signal:
                            console.print(f"  [dim]🤖 HTML page at {probe_url}, asking AI to extract data...[/dim]")
                            normalized = await _ai_normalize_to_schema(raw, probe_url, ai_client, keyword)
                            if normalized and (normalized.get("title") or normalized.get("original_title")):
                                normalized["source_url"] = probe_url
                                normalized.setdefault("slug", slug or keyword.lower().replace(" ", "-"))
                                src_id = await db.get_or_create_source(site_name, base_url, "ai-discovered")
                                normalized["source_id"] = src_id
                                normalized["source_name"] = site_name
                                movie_id = await db.upsert_movie(normalized)
                                if normalized.get("episodes"):
                                    await db.upsert_episodes(movie_id, normalized["episodes"], source_name=site_name)
                                console.print(f"  [green]✅ [Strategy 2c - AI extracted HTML] Imported from [{site_name}][/green]")
                                success = True
                                break

                except Exception as e:
                    console.print(f"  [dim]Probe {probe_url} failed: {e}[/dim]")
                    continue

            if success:
                break

    if ai_client:
        await ai_client.close()
    return success




# ─────────────────────────────────────────────────────────────────────────────
# Helpers: Tìm kiếm trên các nguồn cố định
# ─────────────────────────────────────────────────────────────────────────────
async def _search_source(source_name: str, keyword: str, client: httpx.AsyncClient) -> list[dict]:
    search_urls = {
        "ophim":     f"https://ophim1.com/tim-kiem?keyword={keyword}&page=1",
        "kkphim":    f"https://phimapi.com/tim-kiem?keyword={keyword}&page=1",
        "nguonphim": f"https://phim.nguonc.com/api/films/search?keyword={keyword}&page=1",
    }
    url = search_urls.get(source_name)
    if not url:
        return []
    try:
        resp = await client.get(url, timeout=20)
        data = resp.json()
        items = data.get("items", [])
        return [{"title": i.get("name", ""), "slug": i.get("slug", ""), "source": source_name}
                for i in items if i.get("slug")]
    except Exception as e:
        console.print(f"  [yellow]{source_name} search error: {e}[/yellow]")
        return []


def _pick_best_match(keyword: str, candidates: list[dict]) -> dict | None:
    kw_lower = keyword.lower()
    for c in candidates:
        if kw_lower in c["title"].lower():
            return c
    return candidates[0] if candidates else None


async def _crawl_and_save(source_name: str, slug: str, source_id: int) -> dict | None:
    src_cls = FIXED_SOURCES.get(source_name, {}).get("cls")
    if not src_cls:
        return None
    try:
        src = src_cls()
        detail = await src.get_movie_detail(slug)
        if not detail:
            return None
        detail["source_id"] = source_id
        detail["source_name"] = source_name
        movie_id = await db.upsert_movie(detail)
        if detail.get("episodes"):
            await db.upsert_episodes(movie_id, detail["episodes"], source_name=source_name)
        return detail
    except Exception as e:
        console.print(f"  [red]crawl_and_save error [{source_name}/{slug}]: {e}[/red]")
        return None


def _is_completed(detail: dict) -> bool:
    status = (detail.get("status") or "").lower()
    ep_current = (detail.get("episode_current") or detail.get("current_episode") or "").lower()
    return "full" in status or "hoàn tất" in status or "full" in ep_current or "complete" in status


# ─────────────────────────────────────────────────────────────────────────────
# Load / Save tracked_movies.json
# ─────────────────────────────────────────────────────────────────────────────
def load_tracked() -> dict:
    if TRACKED_FILE.exists():
        try:
            return json.loads(TRACKED_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_tracked(data: dict):
    TRACKED_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    console.print(f"[dim]💾 Saved: {TRACKED_FILE}[/dim]")


# ─────────────────────────────────────────────────────────────────────────────
# COMMAND: import — Tìm và import lần đầu
# ─────────────────────────────────────────────────────────────────────────────
async def cmd_import():
    await db.connect()
    tracked = load_tracked()
    ai_client = _get_ai_client()

    if ai_client:
        console.print("[green]✓ AI client (OpenRouter) available — will use AI for missing movies[/green]")
    else:
        console.print("[yellow]⚠ No OPENROUTER_API_KEY — AI fallback disabled[/yellow]")

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            for keyword in TRACKED_MOVIES:
                console.rule(f"[bold cyan]🔍 '{keyword}'[/bold cyan]")

                # Bước 1: Tìm song song trên 3 nguồn cố định
                results = await asyncio.gather(
                    _search_source("ophim", keyword, client),
                    _search_source("kkphim", keyword, client),
                    _search_source("nguonphim", keyword, client),
                )
                found_per_source: dict[str, dict] = {}
                for sname, hits in zip(["ophim", "kkphim", "nguonphim"], results):
                    best = _pick_best_match(keyword, hits)
                    if best:
                        found_per_source[sname] = best
                        console.print(f"  ✅ [{sname}] Found: {best['title']} ({best['slug']})")
                    else:
                        console.print(f"  ❌ [{sname}] Not found")

                keyword_entry = tracked.get(keyword, {"found": False, "sources": {}, "ai_sources": {}})
                keyword_entry["last_checked"] = datetime.utcnow().isoformat()

                # Bước 2: Import từ các nguồn tìm được
                for sname, match in found_per_source.items():
                    slug = match["slug"]
                    src_id = await db.get_or_create_source(sname, FIXED_SOURCES[sname]["base_url"], "api")
                    console.print(f"  📥 Importing [{sname}] slug='{slug}' ...")
                    detail = await _crawl_and_save(sname, slug, src_id)
                    se = keyword_entry["sources"].get(sname, {})
                    se["slug"] = slug
                    se["last_updated"] = datetime.utcnow().isoformat()
                    se["completed"] = _is_completed(detail) if detail else False
                    keyword_entry["sources"][sname] = se

                # Bước 3: Nếu KHÔNG có nguồn nào → dùng AI tìm web khác
                if not found_per_source:
                    console.print(f"  [yellow]⚠ Not found on any fixed source — activating AI search...[/yellow]")
                    ai_results = await _ai_find_movie_source(keyword, ai_client)
                    if ai_results:
                        success = await _crawl_from_ai_discovered(keyword, ai_results, {})
                        keyword_entry["found"] = success
                        keyword_entry["ai_sources"] = ai_results  # Lưu để update hàng ngày
                        if success:
                            console.print(f"  [bold green]🎉 AI successfully found and imported '{keyword}'[/bold green]")
                        else:
                            console.print(f"  [red]❌ AI found sites but crawl failed for '{keyword}'[/red]")
                    else:
                        keyword_entry["found"] = False
                        console.print(f"  [red]❌ AI could not find '{keyword}' on any site[/red]")
                else:
                    keyword_entry["found"] = True

                tracked[keyword] = keyword_entry
                save_tracked(tracked)

        # Summary
        table = Table(title="📋 Import Summary", show_header=True, header_style="bold magenta")
        table.add_column("Movie", style="cyan", max_width=40)
        table.add_column("Fixed Sources")
        table.add_column("AI Sources")
        table.add_column("Status")
        for kw, entry in tracked.items():
            fixed = ", ".join(entry.get("sources", {}).keys()) or "—"
            ai_srcs = str(len(entry.get("ai_sources", []))) if entry.get("ai_sources") else "—"
            status = "✅ Found" if entry.get("found") else "❌ Not found"
            table.add_row(kw[:40], fixed, ai_srcs, status)
        console.print(table)

    finally:
        if ai_client:
            await ai_client.close()
        await db.close()


# ─────────────────────────────────────────────────────────────────────────────
# COMMAND: update — Cập nhật hàng ngày
# ─────────────────────────────────────────────────────────────────────────────
async def cmd_update():
    await db.connect()
    tracked = load_tracked()
    # Dùng chung 1 client AI cho toàn bộ quá trình update
    ai_client = _get_ai_client()
    total_updated = 0

    if ai_client:
        console.print("[green]✓ AI client ready — will normalize any response format[/green]")
    else:
        console.print("[yellow]⚠ No OPENROUTER_API_KEY — AI normalize disabled[/yellow]")

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as http_client:
            for keyword, entry in tracked.items():
                sources    = entry.get("sources", {})
                ai_sources = entry.get("ai_sources", [])

                # ── Phim trước đó không tìm thấy → thử lại AI search ────────
                if not entry.get("found"):
                    console.rule(f"[bold yellow]🔁 Retry AI search for '{keyword}'[/bold yellow]")
                    ai_results = await _ai_find_movie_source(keyword, ai_client)
                    if ai_results:
                        success = await _crawl_from_ai_discovered(keyword, ai_results, {})
                        if success:
                            entry["found"] = True
                            entry["ai_sources"] = ai_results
                            entry["last_checked"] = datetime.utcnow().isoformat()
                            tracked[keyword] = entry
                            total_updated += 1
                            console.print(f"  [bold green]🎉 Now found '{keyword}' via AI![/bold green]")
                        else:
                            console.print(f"  [red]Still not found '{keyword}'[/red]")
                    else:
                        console.print(f"  [dim]AI still cannot find '{keyword}'[/dim]")
                    continue

                # Kiểm tra xem tất cả nguồn cố định đã complete chưa
                all_fixed_complete = (
                    all(v.get("completed") for v in sources.values()) if sources else True
                )
                if all_fixed_complete and not ai_sources:
                    console.print(f"[dim]⏩ Skip '{keyword}' — all sources completed[/dim]")
                    continue

                console.rule(f"[bold cyan]🔄 Update '{keyword}'[/bold cyan]")

                # ── Update fixed sources ──────────────────────────────────
                for sname, se in sources.items():
                    if se.get("completed"):
                        console.print(f"  [dim]⏩ [{sname}] completed[/dim]")
                        continue
                    slug = se.get("slug")
                    if not slug:
                        continue
                    src_id = await db.get_or_create_source(sname, FIXED_SOURCES[sname]["base_url"], "api")
                    detail = await _crawl_and_save(sname, slug, src_id)
                    if detail:
                        se["last_updated"] = datetime.utcnow().isoformat()
                        se["completed"] = _is_completed(detail)
                        status_str = "✅ Now complete!" if se["completed"] else "🔄 Ongoing"
                        console.print(f"  [{sname}] {status_str}")
                        total_updated += 1
                    sources[sname] = se

                # ── Update AI-discovered sources (dynamic, any format) ────
                # _crawl_from_ai_discovered xử lý mọi format: OPhim API,
                # JSON bất kỳ, HTML → AI normalize tất cả về schema của mình
                if ai_sources:
                    console.print(f"  [dim]🤖 Refreshing {len(ai_sources)} AI-discovered source(s)...[/dim]")
                    success = await _crawl_from_ai_discovered(keyword, ai_sources, {})
                    if success:
                        total_updated += 1
                        console.print(f"  [green]✅ AI sources updated[/green]")
                    else:
                        # Nếu AI discovered cũ không crawl được → thử tìm lại URL mới
                        console.print(f"  [yellow]⚠ AI sources stale, re-searching...[/yellow]")
                        new_results = await _ai_find_movie_source(keyword, ai_client)
                        if new_results:
                            success2 = await _crawl_from_ai_discovered(keyword, new_results, {})
                            if success2:
                                entry["ai_sources"] = new_results  # Cập nhật URL mới
                                total_updated += 1

                entry["sources"] = sources
                entry["last_checked"] = datetime.utcnow().isoformat()
                tracked[keyword] = entry

        save_tracked(tracked)
        console.print(f"\n[bold green]✓ Update done. {total_updated} source(s) refreshed.[/bold green]")

        # TRIGGER BACKEND CACHE CLEAR
        if total_updated > 0:
            console.print("[dim]🔄 Triggering backend cache invalidation...[/dim]")
            try:
                # Dùng http://backend:5000 do cùng nằm trong network docker-compose
                async with httpx.AsyncClient() as client:
                    await client.post('http://backend:5000/api/scraper/clear-cache', timeout=5.0)
                console.print("[bold green]✓ Backend cache cleared successfully[/bold green]")
            except Exception as e:
                console.print(f"[dim yellow]⚠ Could not clear backend cache automatically: {e}[/dim yellow]")

    finally:
        if ai_client:
            await ai_client.close()
        await db.close()



# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "import":
        console.print("[bold magenta]🎬 find_and_track_movies — IMPORT MODE[/bold magenta]")
        asyncio.run(cmd_import())
    elif cmd == "update":
        console.print("[bold magenta]🔄 find_and_track_movies — UPDATE MODE[/bold magenta]")
        asyncio.run(cmd_update())
    else:
        console.print("""
[yellow]Usage:[/yellow]
  python find_and_track_movies.py import   # Tìm & import lần đầu (fixed sources + AI fallback)
  python find_and_track_movies.py update   # Cập nhật hàng ngày (gọi bởi cronjob)
        """)
