"""
find_and_track_movies.py — Tìm phim yêu cầu trên TẤT CẢ các nguồn và theo dõi cập nhật hàng ngày.

Luồng hoạt động:
  1. Lấy danh sách phim từ TRACKED_MOVIES (keyword search)
  2. Tìm kiếm song song trên OPhim, KKPhim, NguonPhim (và AI-discovered sources từ DB)
  3. Với mỗi nguồn tìm được slug → crawl full detail + episodes
  4. Upsert tất cả vào DB (merge server từ nhiều nguồn vào 1 movie record)
  5. Lưu tracked_movies.json để cronjob hàng ngày biết phim nào cần check update

Usage:
    # Tìm và import lần đầu (chạy 1 lần):
    python find_and_track_movies.py import

    # Cập nhật hàng ngày (gọi bởi cronjob / cron trong Docker):
    python find_and_track_movies.py update
"""
import asyncio
import json
import sys
import httpx
from pathlib import Path
from datetime import datetime
from rich.console import Console
from rich.table import Table
from rich import print as rprint

from database import db
from sources.ophim_source import OPhimSource
from sources.kkphim_source import KKPhimSource
from sources.nguonphim_source import NguonPhimSource

console = Console()

# ─────────────────────────────────────────────────────────────────────────────
# DANH SÁCH PHIM CẦN THEO DÕI ĐẶC BIỆT
# Thêm tên (tiếng Việt hoặc tiếng Anh) vào đây để hệ thống tự tìm trên tất cả nguồn
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
    "Ikebukuro (2010)"
]

TRACKED_FILE = Path(__file__).parent / "tracked_movies.json"

# ─────────────────────────────────────────────────────────────────────────────
# Cấu hình nguồn tìm kiếm
# ─────────────────────────────────────────────────────────────────────────────
SOURCES = {
    "ophim": {
        "search_url": "https://ophim1.com/tim-kiem?keyword={keyword}&page=1",
        "detail_url": "https://ophim1.com/phim/{slug}",
        "image_base": "https://img.ophim.live/uploads/movies/",
        "source_cls": OPhimSource,
    },
    "kkphim": {
        "search_url": "https://phimapi.com/tim-kiem?keyword={keyword}&page=1",
        "detail_url": "https://phimapi.com/phim/{slug}",
        "image_base": "",
        "source_cls": KKPhimSource,
    },
    "nguonphim": {
        "search_url": "https://phim.nguonc.com/api/films/search?keyword={keyword}&page=1",
        "detail_url": "https://phim.nguonc.com/api/film/{slug}",
        "image_base": "",
        "source_cls": NguonPhimSource,
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers: search từng nguồn
# ─────────────────────────────────────────────────────────────────────────────
async def search_ophim(keyword: str, client: httpx.AsyncClient) -> list[dict]:
    """Tìm kiếm phim trên OPhim, trả về list {'title', 'slug'}"""
    try:
        resp = await client.get(
            f"https://ophim1.com/tim-kiem?keyword={keyword}&page=1",
            timeout=20,
        )
        data = resp.json()
        items = data.get("items", [])
        return [{"title": i.get("name", ""), "slug": i.get("slug", ""), "source": "ophim"} for i in items if i.get("slug")]
    except Exception as e:
        console.print(f"  [yellow]OPhim search error for '{keyword}': {e}[/yellow]")
        return []


async def search_kkphim(keyword: str, client: httpx.AsyncClient) -> list[dict]:
    """Tìm kiếm phim trên KKPhim"""
    try:
        resp = await client.get(
            f"https://phimapi.com/tim-kiem?keyword={keyword}&page=1",
            timeout=20,
        )
        data = resp.json()
        items = data.get("items", [])
        return [{"title": i.get("name", ""), "slug": i.get("slug", ""), "source": "kkphim"} for i in items if i.get("slug")]
    except Exception as e:
        console.print(f"  [yellow]KKPhim search error for '{keyword}': {e}[/yellow]")
        return []


async def search_nguonphim(keyword: str, client: httpx.AsyncClient) -> list[dict]:
    """Tìm kiếm phim trên NguonPhim"""
    try:
        resp = await client.get(
            f"https://phim.nguonc.com/api/films/search?keyword={keyword}&page=1",
            timeout=20,
        )
        data = resp.json()
        items = data.get("items", [])
        return [{"title": i.get("name", ""), "slug": i.get("slug", ""), "source": "nguonphim"} for i in items if i.get("slug")]
    except Exception as e:
        console.print(f"  [yellow]NguonPhim search error for '{keyword}': {e}[/yellow]")
        return []


def pick_best_match(keyword: str, candidates: list[dict]) -> dict | None:
    """Chọn kết quả tìm kiếm khớp nhất với từ khóa (đơn giản: tìm title có chứa keyword)."""
    kw_lower = keyword.lower()
    # Ưu tiên exact match trước
    for c in candidates:
        if kw_lower in c["title"].lower():
            return c
    # Không có exact match → lấy kết quả đầu tiên (nếu có)
    return candidates[0] if candidates else None


# ─────────────────────────────────────────────────────────────────────────────
# Load / Save tracked_movies.json
# ─────────────────────────────────────────────────────────────────────────────
def load_tracked() -> dict:
    """Đọc tracked_movies.json, trả về dict keyed by keyword."""
    if TRACKED_FILE.exists():
        try:
            return json.loads(TRACKED_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_tracked(data: dict):
    """Ghi tracked_movies.json."""
    TRACKED_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    console.print(f"[dim]💾 Saved: {TRACKED_FILE}[/dim]")


# ─────────────────────────────────────────────────────────────────────────────
# Crawl full detail từ một nguồn cụ thể và upsert vào DB
# ─────────────────────────────────────────────────────────────────────────────
async def crawl_and_save(source_name: str, slug: str, source_id: int) -> dict | None:
    """Gọi get_movie_detail() của nguồn tương ứng và upsert vào DB."""
    source_cfg = SOURCES.get(source_name)
    if not source_cfg:
        return None

    src_inst = source_cfg["source_cls"]()
    try:
        detail = await src_inst.get_movie_detail(slug)
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


# ─────────────────────────────────────────────────────────────────────────────
# Kiểm tra trạng thái phim trên một nguồn (đã full chưa)
# ─────────────────────────────────────────────────────────────────────────────
def is_completed(detail: dict) -> bool:
    """Trả về True nếu phim đã hoàn tất (không cần check update nữa)."""
    status = (detail.get("status") or "").lower()
    ep_current = (detail.get("episode_current") or detail.get("current_episode") or "").lower()
    return "full" in status or "hoàn tất" in status or "full" in ep_current or "complete" in status


# ─────────────────────────────────────────────────────────────────────────────
# COMMAND: import — Tìm và import lần đầu
# ─────────────────────────────────────────────────────────────────────────────
async def cmd_import():
    """Tìm tất cả phim trong TRACKED_MOVIES trên mọi nguồn và import vào DB."""
    await db.connect()
    tracked = load_tracked()

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            for keyword in TRACKED_MOVIES:
                console.rule(f"[bold cyan]🔍 '{keyword}'[/bold cyan]")

                # Tìm song song trên 3 nguồn
                results = await asyncio.gather(
                    search_ophim(keyword, client),
                    search_kkphim(keyword, client),
                    search_nguonphim(keyword, client),
                )
                ophim_hits, kkphim_hits, nguonphim_hits = results

                # Chọn kết quả khớp nhất từ mỗi nguồn
                found_per_source = {}
                for source_name, hits in [
                    ("ophim", ophim_hits),
                    ("kkphim", kkphim_hits),
                    ("nguonphim", nguonphim_hits),
                ]:
                    best = pick_best_match(keyword, hits)
                    if best:
                        found_per_source[source_name] = best
                        console.print(f"  ✅ [{source_name}] Found: {best['title']} ({best['slug']})")
                    else:
                        console.print(f"  ❌ [{source_name}] Not found")

                if not found_per_source:
                    console.print(f"  [red]⚠ No results for '{keyword}' across all sources[/red]")
                    tracked[keyword] = {"found": False, "sources": {}}
                    continue

                # Import từng nguồn tìm được
                keyword_entry = tracked.get(keyword, {"found": True, "sources": {}})
                keyword_entry["found"] = True
                keyword_entry["last_checked"] = datetime.utcnow().isoformat()

                for source_name, match in found_per_source.items():
                    slug = match["slug"]
                    source_id = await db.get_or_create_source(
                        source_name,
                        {"ophim": "https://ophim1.com", "kkphim": "https://phimapi.com", "nguonphim": "https://phim.nguonc.com/api"}[source_name],
                        "api",
                    )

                    console.print(f"  📥 Importing [{source_name}] slug='{slug}' ...")
                    detail = await crawl_and_save(source_name, slug, source_id)

                    source_entry = keyword_entry["sources"].get(source_name, {})
                    source_entry["slug"] = slug
                    source_entry["last_updated"] = datetime.utcnow().isoformat()
                    source_entry["completed"] = is_completed(detail) if detail else False
                    keyword_entry["sources"][source_name] = source_entry

                tracked[keyword] = keyword_entry
                save_tracked(tracked)

        # Summary table
        table = Table(title="📋 Import Summary", show_header=True, header_style="bold magenta")
        table.add_column("Movie", style="cyan")
        table.add_column("Sources Found")
        table.add_column("Completed?")
        for kw, entry in tracked.items():
            src_list = ", ".join(entry.get("sources", {}).keys()) or "—"
            completed = all(v.get("completed") for v in entry.get("sources", {}).values()) if entry.get("sources") else "❓"
            table.add_row(kw, src_list, "✅" if completed == True else "🔄")
        console.print(table)

    finally:
        await db.close()


# ─────────────────────────────────────────────────────────────────────────────
# COMMAND: update — Cập nhật hàng ngày
# ─────────────────────────────────────────────────────────────────────────────
async def cmd_update():
    """Cronjob hàng ngày: check update cho tất cả phim đang theo dõi chưa complete."""
    await db.connect()
    tracked = load_tracked()
    total_updated = 0

    try:
        for keyword, entry in tracked.items():
            if not entry.get("found"):
                continue

            sources = entry.get("sources", {})
            all_complete = all(v.get("completed") for v in sources.values()) if sources else False

            if all_complete:
                console.print(f"[dim]⏩ Skip '{keyword}' — already completed on all sources[/dim]")
                continue

            console.rule(f"[bold cyan]🔄 Update '{keyword}'[/bold cyan]")

            for source_name, source_entry in sources.items():
                if source_entry.get("completed"):
                    console.print(f"  [dim]⏩ [{source_name}] already completed[/dim]")
                    continue

                slug = source_entry.get("slug")
                if not slug:
                    continue

                source_id = await db.get_or_create_source(
                    source_name,
                    {"ophim": "https://ophim1.com", "kkphim": "https://phimapi.com", "nguonphim": "https://phim.nguonc.com/api"}.get(source_name, ""),
                    "api",
                )

                console.print(f"  🔁 [{source_name}] Checking slug='{slug}' ...")
                detail = await crawl_and_save(source_name, slug, source_id)

                if detail:
                    source_entry["last_updated"] = datetime.utcnow().isoformat()
                    if is_completed(detail):
                        source_entry["completed"] = True
                        console.print(f"  [green]✅ [{source_name}] Now complete! Will skip in future.[/green]")
                    else:
                        console.print(f"  [cyan]🔄 [{source_name}] Updated. Still ongoing.[/cyan]")
                    total_updated += 1
                else:
                    console.print(f"  [yellow]⚠ [{source_name}] No data returned[/yellow]")

                sources[source_name] = source_entry

            entry["last_checked"] = datetime.utcnow().isoformat()
            tracked[keyword] = entry

        save_tracked(tracked)
        console.print(f"\n[bold green]✓ Update done. {total_updated} source(s) refreshed.[/bold green]")

    finally:
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
  python find_and_track_movies.py import   # Tìm & import lần đầu TẤT CẢ nguồn
  python find_and_track_movies.py update   # Cập nhật hàng ngày (gọi bởi cronjob)
        """)
