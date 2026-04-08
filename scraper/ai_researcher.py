"""AI Research Agent - Discover new movie sources using OpenRouter (Gemini Free)"""
import asyncio
import json
import re
import os
from urllib.parse import urlparse
from rich.console import Console
import httpx

console = Console()

# Try import openai
try:
    from openai import AsyncOpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    console.print("[yellow]⚠ openai not installed. AI research disabled.[/yellow]")

# Try import ddgs (new package) or duckduckgo_search (old name)
try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        HAS_DDGS = True
    except ImportError:
        HAS_DDGS = False
        console.print("[yellow]⚠ ddgs not installed. Search disabled. Run: pip install ddgs[/yellow]")


class AIResearcher:
    """Uses OpenRouter to discover and analyze movie websites."""

    SEARCH_QUERIES = [
        "xem phim vietsub miễn phí mới nhất",
        "web xem anime vietsub mới nhất",
        "trang web xem phim bộ hàn quốc thuyết minh",
        "website xem phim chiếu rạp online vietsub",
        "phim hoạt hình anime vietsub cập nhật",
        "xem phim trung quốc lồng tiếng thuyết minh",
        "trang xem short drama vietsub",
        "website phim hành động mỹ vietsub",
        "phim thái lan vietsub online free",
        "web xem phim lẻ chiếu rạp mới",
        "api phim vietsub free",
        "share api phim miễn phí",
        "get api phim chiếu rạp",
        "kho phim thuyết minh vietsub api",
        "nguồn phim api việt nam",
        "phim thả ga api",
    ]

    def __init__(self):
        self.client = None
        if HAS_OPENAI:
            api_key = os.getenv("OPENROUTER_API_KEY")
            if api_key:
                try:
                    self.client = AsyncOpenAI(
                        base_url="https://openrouter.ai/api/v1",
                        api_key=api_key,
                    )
                    console.print("[green]✓ OpenRouter client initialized[/green]")
                except Exception as e:
                    console.print(f"[yellow]⚠ OpenRouter init failed: {e}[/yellow]")
            else:
                console.print("[yellow]⚠ OPENROUTER_API_KEY missing. AI research will run in basic mode.[/yellow]")

    async def close(self):
        """Clean up HTTP client to prevent ResourceWarning event loop closed errors."""
        if self.client:
            await self.client.close()

    async def discover_sources(self, db):
        """Main discovery flow: search → filter known → analyze → validate → save."""
        console.print("\n[bold cyan]🔍 AI Source Discovery Starting...[/bold cyan]")
        console.print("[dim]Fetching known URLs from database to skip...[/dim]")

        # Prepare known domains to skip
        active_sources = await db.get_active_sources()
        known_domains = set()
        for source in active_sources:
            try:
                known_domains.add(urlparse(source['base_url']).netloc.lower())
            except:
                pass

        # Also get already discovered sites
        async with db.pool.acquire() as conn:
            discovered = await conn.fetch("SELECT domain FROM discovered_sites")
            for row in discovered:
                if row['domain']:
                    known_domains.add(row['domain'].lower())

        console.print(f"[cyan]Loaded {len(known_domains)} known domains to skip.[/cyan]")

        # Step 1: Search for movie websites
        urls = await self._search_movie_sites()
        console.print(f"[cyan]Found {len(urls)} potential new unique sites to analyze...[/cyan]")

        # Step 2: Analyze each URL with AI
        analyzed_count = 0
        for i, url in enumerate(urls, 1):
            try:
                domain = urlparse(url).netloc.lower()
                if domain in known_domains:
                    continue

                console.print(f"\n[bold yellow]➜ ({i}/{len(urls)}) Analyzing: {domain}[/bold yellow]")

                # Fetch page content
                html = await self._fetch_page(url)
                if not html:
                    console.print("  [red]✗ Failed to fetch page content. Skipping.[/red]")
                    continue

                # Analyze with AI
                console.print("  [dim]Sending to OpenRouter AI for structural analysis...[/dim]")
                analysis = await self._analyze_with_ai(url, html[:6000])
                if not analysis or not analysis.get('is_movie_site'):
                    console.print(f"  [dim]✗ AI verdict: Not a movie/anime site. Skipping.[/dim]")
                    continue

                # Check if has API
                api_info = await self._detect_api(url, html)

                # Generate scraper config
                config = await self._generate_config(url, analysis, api_info)

                # Save to database
                await db.save_discovered_site(
                    url=url, domain=domain,
                    discovered_by='ai-openrouter',
                    analysis=analysis, config=config
                )

                console.print(f"  [green]✓ AI verdict: Movie site ({analysis.get('site_type', 'unknown')})[/green]")

                # If it has an API endpoint, register as source
                if api_info and api_info.get('api_url'):
                    source_id = await db.get_or_create_source(
                        domain.replace('.', '-'),
                        api_info['api_url'],
                        'ai-discovered'
                    )
                    console.print(f"  [bold green]🌟 JACKPOT! Detected hidden API endpoint: {api_info['api_url']}[/bold green]")
                    console.print(f"  [green]✓ Successfully registered into crawl network as dynamic api source.[/green]")

                known_domains.add(domain) # Prevent re-analyzing same domain in this run
                analyzed_count += 1

            except Exception as e:
                console.print(f"  [red]Error analyzing {url}: {e}[/red]")

            await asyncio.sleep(1)  # Rate limit
            
        console.print(f"\n[bold cyan]🏁 Discovery completed: {analyzed_count} entirely new domains validated by AI![/bold cyan]")

    async def _search_movie_sites(self) -> list[str]:
        """Search for movie websites using DuckDuckGo."""
        urls = set()

        if HAS_DDGS:
            ddgs = DDGS()
            total_queries = len(self.SEARCH_QUERIES)
            console.print(f"  [cyan]Running distributed search across {total_queries} queries...[/cyan]")
            for i, query in enumerate(self.SEARCH_QUERIES, 1):
                console.print(f"  [dim]Search ({i}/{total_queries}): {query}...[/dim]")
                try:
                    results = ddgs.text(query, max_results=40)
                    found_for_query = 0
                    for r in results:
                        url = r.get('href', r.get('link', ''))
                        if url and self._is_potential_movie_site(url):
                            urls.add(url)
                            found_for_query += 1
                    console.print(f"    [dim]↳ Picked up {found_for_query} potential URLs[/dim]")
                except Exception as e:
                    console.print(f"    [red]↳ Search error: {e}[/red]")
                await asyncio.sleep(1) # delay to prevent rate limit

        # Also try known patterns
        known_domains = [
            'https://animehay.bio', 'https://animevsub.eu.org',
            'https://animevietsub.day', 'https://thungphim.org',
        ]
        for url in known_domains:
            urls.add(url)

        return list(urls)

    def _is_potential_movie_site(self, url: str) -> bool:
        """Filter out non-movie URLs."""
        skip_domains = [
            'google.', 'youtube.', 'facebook.', 'tiktok.', 'twitter.',
            'wikipedia.', 'reddit.', 'amazon.', 'netflix.com', 'apple.',
            'play.google.', 'apps.apple.', 'fptplay.', 'vieon.',
        ]
        url_lower = url.lower()
        for d in skip_domains:
            if d in url_lower:
                return False

        movie_keywords = ['phim', 'anime', 'movie', 'film', 'drama', 'vietsub', 'watch']
        return any(kw in url_lower for kw in movie_keywords)

    async def _fetch_page(self, url: str) -> str | None:
        """Fetch HTML content of a URL."""
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                if resp.status_code == 200:
                    return resp.text
        except Exception:
            pass
        return None

    async def _analyze_with_ai(self, url: str, html_snippet: str) -> dict | None:
        """Use OpenRouter to analyze if a website is a movie site and extract structure."""
        if not self.client:
            return self._basic_analysis(url, html_snippet)

        prompt = f"""Analyze this website HTML and determine if it's a movie/anime streaming site.

URL: {url}
HTML (first 6000 chars):
{html_snippet}

Respond ONLY with a valid JSON object matching exactly this structure (no markdown fences, no conversational text):
{{
    "is_movie_site": true/false,
    "site_type": "movie" or "anime" or "drama" or "mixed",
    "content_types": ["phim-le", "phim-bo"],
    "language": "vi" or "en" or "mixed",
    "has_player": true/false,
    "has_search": true/false,
    "css_selectors": {{
        "movie_list_container": "string or null",
        "movie_card": "string or null",
        "movie_title": "string or null",
        "movie_poster": "string or null",
        "movie_link": "string or null"
    }},
    "estimated_movies": "string",
    "notes": "string"
}}"""

        try:
            response = await self.client.chat.completions.create(
                model='google/gemini-2.0-flash-lite:free',
                messages=[
                    {"role": "system", "content": "You are a precise JSON Web Scraper AI. Always reply in valid JSON without markdown."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            text = response.choices[0].message.content.strip()
            
            # Extract JSON from possible markdown fence if model disobeys
            if '```' in text:
                match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
                text = match.group(1) if match else text.replace('```json', '').replace('```', '')
            
            return json.loads(text)
        except Exception as e:
            console.print(f"  [dim]AI analysis fallback: {e}[/dim]")
            return self._basic_analysis(url, html_snippet)

    def _basic_analysis(self, url: str, html: str) -> dict:
        """Basic heuristic analysis when AI is unavailable."""
        html_lower = html.lower()
        is_movie = any(kw in html_lower for kw in ['phim', 'anime', 'movie', 'vietsub', 'tập'])
        has_player = any(kw in html_lower for kw in ['<video', '<iframe', 'player', 'jwplayer'])
        return {
            'is_movie_site': is_movie,
            'site_type': 'anime' if 'anime' in html_lower else 'movie',
            'has_player': has_player,
            'language': 'vi',
        }

    async def _detect_api(self, url: str, html: str) -> dict | None:
        """Try to detect hidden API endpoints."""
        api_patterns = [
            r'api["\s]*[=:]\s*["\']([^"\']+)["\']',
            r'fetch\(["\']([^"\']*api[^"\']*)["\']',
            r'axios\.\w+\(["\']([^"\']+)["\']',
            r'["\'](https?://[^"\']*api[^"\']*)["\']',
        ]
        apis = set()
        for pattern in api_patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            apis.update(matches)

        if apis:
            return {'api_url': list(apis)[0], 'all_apis': list(apis)}
        return None

    async def _generate_config(self, url: str, analysis: dict, api_info: dict | None) -> dict:
        """Generate scraper configuration for a discovered site."""
        config = {
            'url': url,
            'type': 'api' if api_info else 'web',
            'selectors': analysis.get('css_selectors', {}),
        }
        if api_info:
            config['api_url'] = api_info.get('api_url')
        return config
