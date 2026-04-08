"""KKPhim API Source - ~27,000 movies
API: https://phimapi.com
Similar structure to OPhim but different image hosting.
"""
import httpx
from sources.base import BaseSource

class KKPhimSource(BaseSource):
    name = 'kkphim'
    base_url = 'https://phimapi.com'
    source_type = 'api'

    TYPE_MAP = {
        'series': 'phim-bo',
        'single': 'phim-le',
        'tvshows': 'tvshows',
        'hoathinh': 'hoathinh',
    }

    async def get_total_pages(self) -> int:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f'{self.base_url}/danh-sach/phim-moi-cap-nhat?page=1')
            data = resp.json()
            return data.get('pagination', {}).get('totalPages', 1)

    async def get_movie_list(self, page: int) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f'{self.base_url}/danh-sach/phim-moi-cap-nhat?page={page}')
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
            resp = await client.get(f'{self.base_url}/phim/{slug}')
            if resp.status_code != 200:
                return None

            data = resp.json()
            movie_raw = data.get('movie')
            if not movie_raw:
                return None

            # Parse dynamic type and genres
            movie_type, genres = self.parse_genres_and_types_dynamically(movie_raw)
            countries = [{'name': c.get('name'), 'slug': c.get('slug')} for c in movie_raw.get('country', [])]

            actors_list = movie_raw.get('actor', [])
            actors = ', '.join(actors_list) if isinstance(actors_list, list) else str(actors_list)
            dir_list = movie_raw.get('director', [])
            director = ', '.join(dir_list) if isinstance(dir_list, list) else str(dir_list)

            ep_total = movie_raw.get('episode_total')
            try:
                total_episodes = int(ep_total) if ep_total else 1
            except (ValueError, TypeError):
                total_episodes = 1

            movie = {
                'slug': slug,
                'title': movie_raw.get('name'),
                'original_title': movie_raw.get('origin_name'),
                'description': movie_raw.get('content', ''),
                'poster_url': movie_raw.get('poster_url', ''),
                'thumb_url': movie_raw.get('thumb_url', ''),
                'backdrop_url': movie_raw.get('poster_url', ''),
                'movie_type': movie_type,
                'status': movie_raw.get('status'),
                'quality': movie_raw.get('quality'),
                'language': movie_raw.get('lang'),
                'year': movie_raw.get('year'),
                'duration': movie_raw.get('time'),
                'total_episodes': total_episodes,
                'current_episode': movie_raw.get('episode_current'),
                'episode_current': movie_raw.get('episode_current'),
                'imdb_id': movie_raw.get('imdb', {}).get('id') if movie_raw.get('imdb') else None,
                'tmdb_id': str(movie_raw.get('tmdb', {}).get('id', '')) if movie_raw.get('tmdb') else None,
                'imdb_rating': None,
                'tmdb_rating': movie_raw.get('tmdb', {}).get('vote_average') if movie_raw.get('tmdb') else None,
                'director': director,
                'actors': actors,
                'trailer_url': movie_raw.get('trailer_url'),
                'is_copyright': movie_raw.get('is_copyright', False),
                'chieurap': movie_raw.get('chieurap', False),
                'source_url': f'{self.base_url}/phim/{slug}',
                'external_id': movie_raw.get('_id'),
                'genres': genres,
                'countries': countries,
            }

            # Parse episodes
            episodes = []
            for server_group in data.get('episodes', []):
                server_name = server_group.get('server_name', 'Default')
                for ep in server_group.get('server_data', []):
                    ep_name = ep.get('name', '')
                    ep_slug = ep.get('slug', '')
                    ep_num = 1
                    try:
                        num_str = ep_name.replace('Tập', '').replace('tập', '').replace('Tap', '').strip().split(' ')[0]
                        ep_num = int(num_str)
                    except (ValueError, IndexError):
                        ep_num = len(episodes) + 1

                    existing_ep = next((e for e in episodes if e['episode_number'] == ep_num), None)
                    server_data = {
                        'server_name': server_name,
                        'server_type': 'vietsub' if 'vietsub' in server_name.lower() else 'thuyet-minh',
                        'embed_url': ep.get('link_embed'),
                        'm3u8_url': ep.get('link_m3u8'),
                        'quality': movie_raw.get('quality', 'HD'),
                    }
                    if existing_ep:
                        existing_ep['servers'].append(server_data)
                    else:
                        episodes.append({
                            'episode_number': ep_num,
                            'name': ep_name,
                            'slug': ep_slug,
                            'servers': [server_data],
                        })

            movie['episodes'] = episodes
            return movie
