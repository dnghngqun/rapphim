"""Link Verifier - Check if movie streaming links are still working."""
import asyncio
import httpx
from rich.console import Console
from rich.progress import Progress

console = Console()


class LinkVerifier:
    """Verify embed_url and m3u8_url links are still accessible."""

    async def verify_batch(self, db, batch_size=200):
        """Verify a batch of episode server links."""
        console.print("\n[bold cyan]✅ Link Verification Starting...[/bold cyan]")

        async with db.pool.acquire() as conn:
            # Get unverified or old-checked links
            rows = await conn.fetch('''
                SELECT es.id, es.embed_url, es.m3u8_url
                FROM episode_servers es
                WHERE es.last_checked IS NULL
                   OR es.last_checked < NOW() - INTERVAL '24 hours'
                ORDER BY es.last_checked ASC NULLS FIRST
                LIMIT $1
            ''', batch_size)

        total = len(rows)
        working = 0
        broken = 0

        console.print(f"[cyan]Checking {total} links...[/cyan]")

        semaphore = asyncio.Semaphore(10)

        async def check_link(row):
            nonlocal working, broken
            async with semaphore:
                url = row['embed_url'] or row['m3u8_url']
                if not url:
                    return

                is_ok = await self._check_url(url)
                async with db.pool.acquire() as conn:
                    await conn.execute('''
                        UPDATE episode_servers
                        SET is_working = $1, last_checked = NOW()
                        WHERE id = $2
                    ''', is_ok, row['id'])

                if is_ok:
                    working += 1
                else:
                    broken += 1

        tasks = [check_link(row) for row in rows]

        with Progress() as progress:
            task = progress.add_task("[cyan]Verifying links", total=total)
            for coro in asyncio.as_completed(tasks):
                await coro
                progress.update(task, advance=1)

        console.print(f"[green]✓ Verified: {total} total, {working} working, {broken} broken[/green]")
        return {'total': total, 'working': working, 'broken': broken}

    async def _check_url(self, url: str) -> bool:
        """Check if a URL is accessible."""
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                resp = await client.head(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://rophimz.org/',
                })
                return resp.status_code < 400
        except Exception:
            return False
