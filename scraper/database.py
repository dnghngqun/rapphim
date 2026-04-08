import asyncpg
import json
from datetime import datetime, timezone
from config import DB_CONFIG
from rich.console import Console

console = Console()

class Database:
    def __init__(self):
        self.pool = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            database=DB_CONFIG['database'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            min_size=2,
            max_size=10,
        )
        console.print("[green]✓ Database connected[/green]")

    async def close(self):
        if self.pool:
            await self.pool.close()

    async def get_or_create_source(self, name, base_url, source_type='api'):
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow('SELECT id FROM sources WHERE name = $1', name)
            if row:
                return row['id']
            row = await conn.fetchrow(
                'INSERT INTO sources (name, base_url, source_type) VALUES ($1, $2, $3) RETURNING id',
                name, base_url, source_type
            )
            return row['id']

    async def get_or_create_genre(self, name, slug):
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow('SELECT id FROM genres WHERE slug = $1', slug)
            if row:
                return row['id']
            try:
                row = await conn.fetchrow(
                    'INSERT INTO genres (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
                    name, slug
                )
                return row['id']
            except Exception:
                row = await conn.fetchrow('SELECT id FROM genres WHERE slug = $1', slug)
                return row['id'] if row else None

    async def get_or_create_country(self, name, slug):
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow('SELECT id FROM countries WHERE slug = $1', slug)
            if row:
                return row['id']
            try:
                row = await conn.fetchrow(
                    'INSERT INTO countries (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
                    name, slug
                )
                return row['id']
            except Exception:
                row = await conn.fetchrow('SELECT id FROM countries WHERE slug = $1', slug)
                return row['id'] if row else None

    async def movie_exists(self, slug):
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow('SELECT id FROM movies WHERE slug = $1', slug)
            return row['id'] if row else None

    async def upsert_movie(self, movie_data):
        """Insert or update a movie and return the movie id."""
        async with self.pool.acquire() as conn:
            existing = await conn.fetchrow('SELECT id FROM movies WHERE slug = $1', movie_data['slug'])

            if existing:
                movie_id = existing['id']
                await conn.execute('''
                    UPDATE movies SET
                        title = $2, original_title = $3, description = $4,
                        poster_url = $5, thumb_url = $6, backdrop_url = $7,
                        movie_type = $8, status = $9, quality = $10,
                        language = $11, year = $12, duration = $13,
                        total_episodes = $14, current_episode = $15, episode_current = $16,
                        imdb_id = $17, tmdb_id = $18, imdb_rating = $19, tmdb_rating = $20,
                        director = $21, actors = $22, trailer_url = $23,
                        is_copyright = $24, chieurap = $25,
                        source_id = $26, source_name = $27, source_url = $28, external_id = $29,
                        last_synced_at = NOW(), updated_at = NOW()
                    WHERE id = $1
                ''', movie_id,
                    movie_data.get('title'), movie_data.get('original_title'), movie_data.get('description'),
                    movie_data.get('poster_url'), movie_data.get('thumb_url'), movie_data.get('backdrop_url'),
                    movie_data.get('movie_type', 'phim-le'), movie_data.get('status'), movie_data.get('quality'),
                    movie_data.get('language'), movie_data.get('year'), movie_data.get('duration'),
                    movie_data.get('total_episodes', 1), movie_data.get('current_episode'), movie_data.get('episode_current'),
                    movie_data.get('imdb_id'), movie_data.get('tmdb_id'),
                    movie_data.get('imdb_rating'), movie_data.get('tmdb_rating'),
                    movie_data.get('director'), movie_data.get('actors'), movie_data.get('trailer_url'),
                    movie_data.get('is_copyright', False), movie_data.get('chieurap', False),
                    movie_data.get('source_id'), movie_data.get('source_name'), movie_data.get('source_url'),
                    movie_data.get('external_id'),
                )
            else:
                row = await conn.fetchrow('''
                    INSERT INTO movies (
                        title, original_title, slug, description,
                        poster_url, thumb_url, backdrop_url,
                        movie_type, status, quality, language, year, duration,
                        total_episodes, current_episode, episode_current,
                        imdb_id, tmdb_id, imdb_rating, tmdb_rating,
                        director, actors, trailer_url,
                        is_copyright, chieurap,
                        source_id, source_name, source_url, external_id,
                        last_synced_at
                    ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW()
                    ) RETURNING id
                ''',
                    movie_data.get('title'), movie_data.get('original_title'), movie_data['slug'],
                    movie_data.get('description'),
                    movie_data.get('poster_url'), movie_data.get('thumb_url'), movie_data.get('backdrop_url'),
                    movie_data.get('movie_type', 'phim-le'), movie_data.get('status'), movie_data.get('quality'),
                    movie_data.get('language'), movie_data.get('year'), movie_data.get('duration'),
                    movie_data.get('total_episodes', 1), movie_data.get('current_episode'), movie_data.get('episode_current'),
                    movie_data.get('imdb_id'), movie_data.get('tmdb_id'),
                    movie_data.get('imdb_rating'), movie_data.get('tmdb_rating'),
                    movie_data.get('director'), movie_data.get('actors'), movie_data.get('trailer_url'),
                    movie_data.get('is_copyright', False), movie_data.get('chieurap', False),
                    movie_data.get('source_id'), movie_data.get('source_name'), movie_data.get('source_url'),
                    movie_data.get('external_id'),
                )
                movie_id = row['id']

            # Handle genres
            genres_list = movie_data.get('genres') or []
            if genres_list:
                await conn.execute('DELETE FROM movie_genres WHERE movie_id = $1', movie_id)
                for g in genres_list:
                    genre_id = await self.get_or_create_genre(g['name'], g['slug'])
                    if genre_id:
                        await conn.execute(
                            'INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                            movie_id, genre_id
                        )

            # Handle countries
            if 'countries' in movie_data and movie_data['countries']:
                await conn.execute('DELETE FROM movie_countries WHERE movie_id = $1', movie_id)
                for c in movie_data['countries']:
                    country_id = await self.get_or_create_country(c['name'], c['slug'])
                    if country_id:
                        await conn.execute(
                            'INSERT INTO movie_countries (movie_id, country_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                            movie_id, country_id
                        )

            return movie_id

    async def upsert_episodes(self, movie_id, episodes_data, source_name=None):
        """Insert or update episodes and their servers for a movie."""
        async with self.pool.acquire() as conn:
            for ep_num, ep in enumerate(episodes_data, 1):
                ep_number = ep.get('episode_number', ep_num)
                ep_name = ep.get('name', f'Tập {ep_number}')
                ep_slug = ep.get('slug', f'tap-{ep_number:02d}')

                # Upsert episode
                row = await conn.fetchrow(
                    '''INSERT INTO episodes (movie_id, episode_number, name, slug)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (movie_id, episode_number) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug
                       RETURNING id''',
                    movie_id, ep_number, ep_name, ep_slug
                )
                episode_id = row['id']

                # Upsert servers
                if 'servers' in ep:
                    for server in ep['servers']:
                        raw_server_name = server.get('server_name', 'Default')
                        final_server_name = f"{source_name} - {raw_server_name}" if source_name else raw_server_name
                        
                        await conn.execute('''
                            INSERT INTO episode_servers (episode_id, server_name, server_type, embed_url, m3u8_url, quality)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (episode_id, server_name) DO UPDATE SET 
                                embed_url = EXCLUDED.embed_url, 
                                m3u8_url = EXCLUDED.m3u8_url, 
                                is_working = TRUE
                        ''', episode_id, final_server_name,
                            server.get('server_type', 'vietsub'),
                            server.get('embed_url'), server.get('m3u8_url'),
                            server.get('quality'))

    async def log_crawl(self, source_name, source_id=None, mode='incremental'):
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                'INSERT INTO crawl_logs (source_id, source_name, mode) VALUES ($1, $2, $3) RETURNING id',
                source_id, source_name, mode
            )
            return row['id']

    async def update_crawl_log(self, log_id, **kwargs):
        async with self.pool.acquire() as conn:
            now = datetime.utcnow()
            sets = []
            values = [log_id]
            i = 2
            for k, v in kwargs.items():
                if v == 'NOW()':
                    v = now
                sets.append(f"{k} = ${i}")
                values.append(v)
                i += 1
            if sets:
                await conn.execute(f"UPDATE crawl_logs SET {', '.join(sets)} WHERE id = $1", *values)

    async def update_source_stats(self, source_id):
        async with self.pool.acquire() as conn:
            count = await conn.fetchval('SELECT COUNT(*) FROM movies WHERE source_id = $1', source_id)
            await conn.execute(
                'UPDATE sources SET total_movies = $1, last_crawled_at = NOW(), updated_at = NOW() WHERE id = $2',
                count, source_id
            )

    async def get_stats(self):
        async with self.pool.acquire() as conn:
            total = await conn.fetchval('SELECT COUNT(*) FROM movies')
            by_type = await conn.fetch('SELECT movie_type, COUNT(*) as count FROM movies GROUP BY movie_type')
            sources = await conn.fetch('SELECT name, total_movies, last_crawled_at FROM sources ORDER BY priority')
            episodes = await conn.fetchval('SELECT COUNT(*) FROM episodes')
            servers = await conn.fetchval('SELECT COUNT(*) FROM episode_servers')
            working = await conn.fetchval('SELECT COUNT(*) FROM episode_servers WHERE is_working = TRUE')
            return {
                'total_movies': total,
                'by_type': [dict(r) for r in by_type],
                'sources': [dict(r) for r in sources],
                'total_episodes': episodes,
                'total_servers': servers,
                'working_servers': working,
            }

    async def save_discovered_site(self, url, domain, discovered_by, analysis=None, config=None):
        async with self.pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO discovered_sites (url, domain, discovered_by, analysis, scraper_config)
                VALUES ($1, $2, $3, $4, $5) ON CONFLICT (url) DO UPDATE SET
                analysis = EXCLUDED.analysis, scraper_config = EXCLUDED.scraper_config
            ''', url, domain, discovered_by, json.dumps(analysis or {}), json.dumps(config or {}))

    async def get_active_sources(self):
        async with self.pool.acquire() as conn:
            return await conn.fetch('SELECT * FROM sources WHERE is_active = TRUE ORDER BY priority ASC')


db = Database()
