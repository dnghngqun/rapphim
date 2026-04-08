from abc import ABC, abstractmethod
import asyncio
import os
from datetime import datetime
from pathlib import Path

# Thư mục log — mount từ host D:\Code\code\rapphim\scraper
LOG_DIR = Path(os.getenv('SCRAPER_LOG_DIR', '/app/scraper/logs'))


def _write_crawl_log(session_start: datetime, results: list[dict]):
    """Ghi file log crawl dạng txt vào thư mục logs."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Tên file theo session (1 lần chạy crawl all = 1 file)
    ts = session_start.strftime('%Y-%m-%d_%H-%M-%S')
    log_file = LOG_DIR / f"crawl_{ts}.txt"

    total_found  = sum(r['found']   for r in results)
    total_new    = sum(r['new']     for r in results)
    total_updated= sum(r['updated'] for r in results)
    duration     = (datetime.now() - session_start).seconds

    lines = [
        "=" * 60,
        f"  RAPPHIM CRAWL REPORT",
        f"  Started : {session_start.strftime('%Y-%m-%d %H:%M:%S')}",
        f"  Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"  Duration: {duration}s",
        "=" * 60,
        "",
        f"TỔNG KẾT: found={total_found} | new={total_new} | updated={total_updated}",
        "",
        f"{'Source':<15} {'URL':<40} {'Pages':>5} {'Found':>7} {'New':>7} {'Updated':>8} {'Status'}",
        "-" * 100,
    ]

    for r in results:
        lines.append(
            f"{r['source']:<15} {r['url']:<40} {r['pages']:>5} "
            f"{r['found']:>7} {r['new']:>7} {r['updated']:>8}  {r['status']}"
        )

    lines += ["", "=" * 60, ""]

    with open(log_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    return log_file


class BaseSource(ABC):
    """Abstract base class for all movie sources. Extend to add new source."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique source name, e.g. 'ophim'"""
        ...

    @property
    @abstractmethod
    def base_url(self) -> str:
        """Base URL, e.g. 'https://ophim1.com'"""
        ...

    @property
    def source_type(self) -> str:
        return 'api'  # 'api' or 'web'

    @abstractmethod
    async def get_total_pages(self) -> int:
        """Return total number of pages to crawl."""
        ...

    @abstractmethod
    async def get_movie_list(self, page: int) -> list[dict]:
        """Return list of movie summaries for a given page. Each dict must have at least 'slug'."""
        ...

    @abstractmethod
    async def get_movie_detail(self, slug: str) -> dict | None:
        """Return full movie detail with episodes. Return None if failed."""
        ...

    async def crawl(self, db, max_pages=None, mode='full'):
        """Crawl movies from this source and save to database."""
        from rich.console import Console
        from rich.progress import Progress
        console = Console()

        source_id = await db.get_or_create_source(self.name, self.base_url, self.source_type)
        log_id = await db.log_crawl(self.name, source_id, mode)

        total_pages = await self.get_total_pages()
        if max_pages:
            total_pages = min(total_pages, max_pages)

        console.print(f"[cyan]📡 {self.name}[/cyan]: {total_pages} pages — mode={mode}")

        total_found   = 0
        total_new     = 0
        total_updated = 0
        status        = 'success'

        try:
            for page in range(1, total_pages + 1):
                try:
                    movies = await self.get_movie_list(page)
                    total_found += len(movies)

                    for movie_summary in movies:
                        slug = movie_summary.get('slug')
                        if not slug:
                            continue

                        existing_id = await db.movie_exists(slug)
                        if mode == 'incremental' and existing_id:
                            total_updated += 1
                            continue

                        try:
                            detail = await self.get_movie_detail(slug)
                            if not detail:
                                continue

                            detail['source_id']   = source_id
                            detail['source_name'] = self.name
                            movie_id = await db.upsert_movie(detail)

                            if 'episodes' in detail and detail['episodes']:
                                await db.upsert_episodes(movie_id, detail['episodes'], source_name=self.name)

                            if existing_id:
                                total_updated += 1
                            else:
                                total_new += 1

                        except Exception as e:
                            console.print(f"  [red]Error detail {slug}: {e}[/red]")
                            
                    # Log interval progress
                    if page % 10 == 0 or page == 1 or page == total_pages:
                        console.print(f"  [cyan]➜ {self.name}[/cyan] Progress: Page [bold]{page}/{total_pages}[/bold] | Found: {total_found} | New: {total_new} | Updated: {total_updated}")

                except Exception as e:
                    console.print(f"  [red]Error page {page}: {e}[/red]")

            await db.update_crawl_log(log_id,
                status='success', finished_at='NOW()',
                total_found=total_found, total_new=total_new, total_updated=total_updated)
            await db.update_source_stats(source_id)

            console.print(f"[green]✓ {self.name}[/green]: found={total_found}, new={total_new}, updated={total_updated}")

        except Exception as e:
            status = f'failed: {e}'
            await db.update_crawl_log(log_id, status='failed', error_message=str(e), finished_at='NOW()')
            console.print(f"[red]✗ {self.name} failed: {e}[/red]")

        return {
            'source':  self.name,
            'url':     self.base_url,
            'pages':   total_pages,
            'found':   total_found,
            'new':     total_new,
            'updated': total_updated,
            'status':  status,
        }

    def parse_genres_and_types_dynamically(self, movie_raw: dict) -> tuple[str, list[dict]]:
        """
        Dynamically extracts primary movie_type and a normalized list of genres/tags 
        from any available categorization field in the API response.
        """
        raw_types = (
            movie_raw.get('type') or ''
        )
        # Determine primary type (single vs series vs hoathinh vs tvshows vs anime)
        raw_type_str = str(raw_types).lower()
        if 'series' in raw_type_str or 'phim-bo' in raw_type_str or 'phim bo' in raw_type_str:
            movie_type = 'phim-bo'
        elif 'single' in raw_type_str or 'phim-le' in raw_type_str or 'phim le' in raw_type_str:
            movie_type = 'phim-le'
        elif 'tvshows' in raw_type_str or 'tv-shows' in raw_type_str:
            movie_type = 'tvshows'
        elif 'hoathinh' in raw_type_str or 'hoạt hình' in raw_type_str:
            movie_type = 'hoathinh'
        elif 'anime' in raw_type_str:
            movie_type = 'hoathinh'
        else:
            movie_type = 'phim-le' # Default fallback

        # Collect raw genre tags from multiple possible keys
        genres = []
        collected_tags = []
        possible_keys = ['category', 'categories', 'genres', 'genre', 'the_loai', 'tags', 'type']
        
        for key in possible_keys:
            val = movie_raw.get(key)
            if not val:
                continue
            if isinstance(val, list):
                for item in val:
                    if isinstance(item, dict):
                        collected_tags.append(item.get('name') or item.get('title') or item.get('slug'))
                    elif isinstance(item, str):
                        collected_tags.append(item)
            elif isinstance(val, str):
                collected_tags.extend([v.strip() for v in val.split(',')])

        # Add explicit anime tag if identified via type string
        if 'anime' in raw_type_str and 'anime' not in str(collected_tags).lower():
            collected_tags.append('Anime')
        if 'hoạt hình' in raw_type_str and 'hoạt hình' not in str(collected_tags).lower():
            collected_tags.append('Hoạt Hình')
        if 'tvshows' in raw_type_str and 'tv shows' not in str(collected_tags).lower():
            collected_tags.append('TV Shows')

        # Normalize and filter out duplicates
        seen_slugs = set()
        for tag in collected_tags:
            if not tag:
                continue
            name = str(tag).strip()
            if not name:
                continue
                
            # Keep common standard genres clean, ignore messy long sentences
            if len(name) > 30:
                continue 
                
            slug = name.lower().replace(' ', '-').replace('/', '-').replace('+', '-')
            # Map weird names to standard
            if slug in ['action', 'hanh-dong']:
                name, slug = 'Hành Động', 'hanh-dong'
            elif slug in ['animation', 'hoat-hinh']:
                name, slug = 'Hoạt Hình', 'hoat-hinh'
            elif slug in ['sci-fi', 'vien-tuong']:
                name, slug = 'Viễn Tưởng', 'vien-tuong'
                
            if slug and slug not in seen_slugs and slug not in ['single', 'series', 'phim-le', 'phim-bo']:
                seen_slugs.add(slug)
                genres.append({'name': name, 'slug': slug})

        return movie_type, genres

