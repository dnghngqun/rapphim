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


if __name__ == '__main__':
    cli()
