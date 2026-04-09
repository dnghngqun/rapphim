"""RapPhim Scraper - CLI Entry Point
Usage:
    python main.py crawl --source all --mode incremental
    python main.py crawl --source ophim --pages 5
    python main.py verify --batch-size 200
    python main.py discover
    python main.py stats
"""
import asyncio
import sys
import click
import httpx
from rich.console import Console
from rich.table import Table

from datetime import datetime
from database import db
from sources.ophim_source import OPhimSource
from sources.kkphim_source import KKPhimSource
from sources.nguonphim_source import NguonPhimSource
from sources.base import _write_crawl_log
from sources.dynamic_source import DynamicOPhimSource
from ai_researcher import AIResearcher
from verifier import LinkVerifier
from find_and_track_movies import cmd_import as _track_import, cmd_update as _track_update
from enrich_sources import cmd_enrich_all, cmd_enrich_tracked, cmd_enrich_slug

console = Console()

# Registry of all available sources
ALL_SOURCES = {
    'ophim': OPhimSource,
    'kkphim': KKPhimSource,
    'nguonphim': NguonPhimSource,
}


@click.group()
def cli():
    """🎬 RapPhim Scraper - Multi-source movie data crawler"""
    pass


@cli.command()
@click.option('--source', '-s', default='all', help='Source name or "all"')
@click.option('--mode', '-m', default='incremental', type=click.Choice(['incremental', 'full']))
@click.option('--pages', '-p', default=None, type=int, help='Max pages to crawl per source')
def crawl(source, mode, pages):
    """Crawl movies from sources."""
    asyncio.run(_crawl(source, mode, pages))


async def _crawl(source_name, mode, max_pages):
    await db.connect()

    try:
        sources = []
        if source_name == 'all':
            sources = [cls() for cls in ALL_SOURCES.values()]
            
            # Load AI discovered sources from DB
            db_sources = await db.pool.fetch(
                "SELECT name, base_url FROM sources WHERE source_type = 'ai-discovered' AND is_active = true"
            )
            for row in db_sources:
                sources.append(DynamicOPhimSource(row['name'], row['base_url']))
                
        elif source_name in ALL_SOURCES:
            sources = [ALL_SOURCES[source_name]()]
        else:
            # Check if it matches a specific AI-discovered source DB entry
            row = await db.pool.fetchrow(
                "SELECT name, base_url FROM sources WHERE name = $1 AND source_type = 'ai-discovered' AND is_active = true",
                source_name
            )
            if row:
                sources = [DynamicOPhimSource(row['name'], row['base_url'])]
            else:
                console.print(f"[red]Unknown source: {source_name}[/red]")
                extra = await db.pool.fetch("SELECT name FROM sources WHERE source_type = 'ai-discovered' AND is_active = true")
                all_available = list(ALL_SOURCES.keys()) + [e['name'] for e in extra]
                console.print(f"Available: {', '.join(all_available)}")
                return

        console.print(f"\n[bold cyan]🎬 RapPhim Crawl[/bold cyan] - mode={mode}, sources={len(sources)}")
        console.print("=" * 60)

        session_start = datetime.now()
        all_results = []

        for src in sources:
            console.print(f"\n[bold]📡 Crawling: {src.name} ({src.base_url})[/bold]")
            try:
                result = await src.crawl(db, max_pages=max_pages, mode=mode)
                all_results.append(result)
            except Exception as e:
                console.print(f"[red]Failed: {src.name} - {e}[/red]")
                all_results.append({
                    'source': src.name, 'url': src.base_url,
                    'pages': 0, 'found': 0, 'new': 0, 'updated': 0,
                    'status': f'error: {e}'
                })

        total_found   = sum(r['found']   for r in all_results)
        total_new     = sum(r['new']     for r in all_results)
        total_updated = sum(r['updated'] for r in all_results)

        console.print("\n" + "=" * 60)
        console.print(f"[bold green]✓ Total: found={total_found}, new={total_new}, updated={total_updated}[/bold green]")

        # TRIGGER BACKEND CACHE CLEAR
        if total_new > 0 or total_updated > 0:
            console.print("[dim]🔄 Triggering backend cache invalidation...[/dim]")
            try:
                # We use http://backend:5000 because they run in the same docker-compose network
                async with httpx.AsyncClient() as client:
                    await client.post('http://backend:5000/api/scraper/clear-cache', timeout=5.0)
                console.print("[bold green]✓ Backend cache cleared successfully[/bold green]")
            except Exception as e:
                console.print(f"[dim yellow]⚠ Could not clear backend cache automatically: {e}[/dim yellow]")

        # Ghi file log txt
        log_file = _write_crawl_log(session_start, all_results)
        console.print(f"[dim]📝 Log saved: {log_file}[/dim]")

    finally:
        await db.close()


@cli.command()
@click.option('--batch-size', '-b', default=200, type=int, help='Number of links to verify')
def verify(batch_size):
    """Verify streaming links are still working."""
    asyncio.run(_verify(batch_size))


async def _verify(batch_size):
    await db.connect()
    try:
        verifier = LinkVerifier()
        await verifier.verify_batch(db, batch_size)
    finally:
        await db.close()


@cli.command()
def discover():
    """Use AI to discover new movie sources."""
    asyncio.run(_discover())


async def _discover():
    await db.connect()
    researcher = AIResearcher()
    try:
        await researcher.discover_sources(db)
    finally:
        await researcher.close()
        await db.close()


@cli.command()
def discover_and_crawl():
    """Run AI discovery first, then crawl all sources including discovered ones."""
    console.print("\n[bold magenta]🚀 Starting Discover & Crawl Pipeline[/bold magenta]")
    asyncio.run(_discover())
    console.print("\n[bold magenta]✅ Discovery completed. Starting Crawl...[/bold magenta]")
    asyncio.run(_crawl('all', 'full', None))


@cli.command()
def stats():
    """Show database statistics."""
    asyncio.run(_stats())


async def _stats():
    await db.connect()
    try:
        s = await db.get_stats()

        table = Table(title="🎬 RapPhim Database Stats", show_header=True)
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green", justify="right")

        table.add_row("Total Movies", str(s['total_movies']))
        table.add_row("Total Episodes", str(s['total_episodes']))
        table.add_row("Total Servers", str(s['total_servers']))
        table.add_row("Working Servers", str(s['working_servers']))

        for bt in s['by_type']:
            table.add_row(f"  → {bt['movie_type']}", str(bt['count']))

        console.print(table)

        if s['sources']:
            source_table = Table(title="📡 Sources", show_header=True)
            source_table.add_column("Name", style="cyan")
            source_table.add_column("Movies", justify="right")
            source_table.add_column("Last Crawled")
            for src in s['sources']:
                lc = str(src['last_crawled_at'])[:19] if src['last_crawled_at'] else 'Never'
                source_table.add_row(src['name'], str(src['total_movies']), lc)
            console.print(source_table)

    finally:
        await db.close()


@cli.command(name='track-import')
def track_import():
    """Find and import tracked movies from ALL sources (run once)."""
    console.print("\n[bold magenta]🎬 Importing tracked movies from all sources...[/bold magenta]")
    asyncio.run(_track_import())


@cli.command(name='track-update')
def track_update():
    """Daily update for tracked movies that are not yet completed (used by cron)."""
    console.print("\n[bold cyan]🔄 Running daily update for tracked movies...[/bold cyan]")
    asyncio.run(_track_update())


@cli.command(name='enrich-sources')
@click.argument('mode', default='tracked', type=click.Choice(['all', 'tracked', 'slug']))
@click.argument('slug_or_limit', default='', required=False)
def enrich_sources(mode: str, slug_or_limit: str):
    """
    Find backup sources for movies already in DB.

    MODE:
      all      — Scan all movies in DB (provide optional limit: enrich-sources all 100)
      tracked  — Only scan TRACKED_MOVIES list
      slug     — Scan one specific movie (provide slug: enrich-sources slug fairy-tail)

    Example: python main.py enrich-sources tracked
    """
    console.print(f"\n[bold magenta]🌐 Source Enrichment — mode={mode}[/bold magenta]")
    if mode == 'all':
        limit = int(slug_or_limit) if slug_or_limit.isdigit() else 200
        asyncio.run(cmd_enrich_all(limit=limit))
    elif mode == 'tracked':
        asyncio.run(cmd_enrich_tracked())
    elif mode == 'slug':
        if not slug_or_limit:
            console.print("[red]Please provide a slug: enrich-sources slug <slug>[/red]")
            return
        asyncio.run(cmd_enrich_slug(slug_or_limit))


if __name__ == '__main__':
    cli()
