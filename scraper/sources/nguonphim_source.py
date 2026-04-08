"""NguonPhim API Source
API: https://phim.nguonc.com/api
Different API structure from OPhim/KKPhim.
"""
import httpx
from sources.base import BaseSource

class NguonPhimSource(BaseSource):
    name = 'nguonphim'
    base_url = 'https://phim.nguonc.com/api'
    source_type = 'api'

    async def get_total_pages(self) -> int:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(f'{self.base_url}/films/phim-moi-cap-nhat?page=1')
                data = resp.json()
                paginator = data.get('paginate', data.get('pagination', {}))
                return paginator.get('total_page', paginator.get('totalPages', 100))
            except Exception:
                return 100

    async def get_movie_list(self, page: int) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f'{self.base_url}/films/phim-moi-cap-nhat?page={page}')
            data = resp.json()
            items = data.get('items', [])
            result = []
            for item in items:
                result.append({
                    'slug': item.get('slug'),
                    'title': item.get('name'),
                    'original_title': item.get('origin_name'),
                    'thumb_url': item.get('thumb_url', ''),
                    'poster_url': item.get('poster_url', ''),
                    'year': item.get('year'),
                })
            return result

    async def get_movie_detail(self, slug: str) -> dict | None:
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(f'{self.base_url}/film/{slug}')
                if resp.status_code != 200:
                    return None
                data = resp.json()
            except Exception:
                return None

            movie_raw = data.get('movie') or data.get('item')
            if not movie_raw:
                return None

            # Parse dynamic type and genres
            movie_type, genres = self.parse_genres_and_types_dynamically(movie_raw)
            # NguonPhim sometimes sends lists of tags instead of common genre structs, the dynamic parser handles it usually, but let's ensure 'genres' property of movie_raw is available.
            movie_raw['genres'] = movie_raw.get('category', movie_raw.get('genres', []))
            movie_type, genres = self.parse_genres_and_types_dynamically(movie_raw)

            countries = []
            for c in movie_raw.get('country', movie_raw.get('countries', [])):
                if isinstance(c, dict):
                    countries.append({'name': c.get('name', ''), 'slug': c.get('slug', '')})

            actors = movie_raw.get('casts', movie_raw.get('actor', ''))
            if isinstance(actors, list):
                actors = ', '.join(actors)
            director = movie_raw.get('director', '')
            if isinstance(director, list):
                director = ', '.join(director)

            movie = {
                'slug': slug,
                'title': movie_raw.get('name'),
                'original_title': movie_raw.get('origin_name'),
                'description': movie_raw.get('content', movie_raw.get('description', '')),
                'poster_url': movie_raw.get('poster_url', ''),
                'thumb_url': movie_raw.get('thumb_url', ''),
                'backdrop_url': movie_raw.get('poster_url', ''),
                'movie_type': movie_type,
                'status': movie_raw.get('status'),
                'quality': movie_raw.get('quality'),
                'language': movie_raw.get('language', movie_raw.get('lang', '')),
                'year': movie_raw.get('year'),
                'duration': movie_raw.get('time', movie_raw.get('duration', '')),
                'total_episodes': movie_raw.get('total_episodes', 1),
                'current_episode': movie_raw.get('current_episode'),
                'episode_current': movie_raw.get('current_episode'),
                'director': director,
                'actors': actors,
                'source_url': f'{self.base_url}/film/{slug}',
                'genres': genres,
                'countries': countries,
            }

            # Parse episodes
            episodes = []
            for server_group in data.get('episodes', movie_raw.get('episodes', [])):
                server_name = server_group.get('server_name', 'Default')
                items = server_group.get('server_data', server_group.get('items', []))
                for idx, ep in enumerate(items):
                    ep_name = ep.get('name', f'Tập {idx+1}')
                    ep_slug = ep.get('slug', f'tap-{idx+1:02d}')
                    ep_num = idx + 1
                    try:
                        num_str = ep_name.replace('Tập', '').replace('tập', '').strip().split(' ')[0]
                        ep_num = int(num_str)
                    except (ValueError, IndexError):
                        pass

                    existing_ep = next((e for e in episodes if e['episode_number'] == ep_num), None)
                    server_data = {
                        'server_name': server_name,
                        'server_type': 'vietsub',
                        'embed_url': ep.get('link_embed', ep.get('embed', '')),
                        'm3u8_url': ep.get('link_m3u8', ep.get('m3u8', '')),
                    }
                    if existing_ep:
                        existing_ep['servers'].append(server_data)
                    else:
                        episodes.append({
                            'episode_number': ep_num,
                            'name': ep_name, 'slug': ep_slug,
                            'servers': [server_data],
                        })

            movie['episodes'] = episodes
            return movie
