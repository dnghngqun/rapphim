const { pool } = require('../config/database');

const removeVietnameseTones = (str) => {
  return str
    .normalize('NFD') // Chuẩn hóa Unicode
    .replace(/[\u0300-\u036f]/g, '') // Xóa các dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D'); // Chữ đ/Đ
};

// ============================================================
// Movies Controller
// ============================================================

/**
 * GET /api/movies
 * Query params: page, limit, type, genre, country, year, sort, search
 */
async function getMovies(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 24));
    const offset = (page - 1) * limit;
    const { type, genre, country, year, sort, search } = req.query;

    let query = `
      SELECT m.*, 
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as genres,
        array_agg(DISTINCT g.slug) FILTER (WHERE g.slug IS NOT NULL) as genre_slugs,
        array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as countries,
        array_agg(DISTINCT c.slug) FILTER (WHERE c.slug IS NOT NULL) as country_slugs
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (type) {
      conditions.push(`m.movie_type = $${paramIndex++}`);
      params.push(type);
    }
    if (genre) {
      conditions.push(`g.slug = $${paramIndex++}`);
      params.push(genre);
    }
    if (country) {
      conditions.push(`c.slug = $${paramIndex++}`);
      params.push(country);
    }
    if (year) {
      conditions.push(`m.year = $${paramIndex++}`);
      params.push(parseInt(year));
    }
    if (search) {
      const searchStrTrim = search.trim();
      const likeSearchStr = `%${searchStrTrim}%`;
      const normalizedSlug = removeVietnameseTones(searchStrTrim).replace(/\s+/g, '-').toLowerCase().replace(/y/g, 'i');
      const slugSearchStr = `%${normalizedSlug}%`;
      conditions.push(`(m.title ILIKE $${paramIndex} OR m.original_title ILIKE $${paramIndex} OR REPLACE(m.slug, 'y', 'i') ILIKE $${paramIndex + 1})`);
      params.push(likeSearchStr, slugSearchStr);
      paramIndex += 2;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY m.id';

    // Sorting
    switch (sort) {
      case 'latest': query += ' ORDER BY m.updated_at DESC'; break;
      case 'oldest': query += ' ORDER BY m.created_at ASC'; break;
      case 'name': query += ' ORDER BY m.title ASC'; break;
      case 'year': query += ' ORDER BY m.year DESC'; break;
      case 'views': query += ' ORDER BY m.view_count DESC'; break;
      case 'rating': query += ' ORDER BY m.imdb_rating DESC NULLS LAST'; break;
      default: query += ' ORDER BY m.year DESC NULLS LAST, m.updated_at DESC';
    }

    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    // Count query
    let countQuery = 'SELECT COUNT(DISTINCT m.id) FROM movies m';
    const countConditions = [];
    const countParams = [];
    let cpi = 1;

    if (type) { countConditions.push(`m.movie_type = $${cpi++}`); countParams.push(type); }
    if (genre) {
      countQuery += ' LEFT JOIN movie_genres mg ON m.id = mg.movie_id LEFT JOIN genres g ON mg.genre_id = g.id';
      countConditions.push(`g.slug = $${cpi++}`); countParams.push(genre);
    }
    if (country) {
      if (!genre) countQuery += ' LEFT JOIN movie_countries mc ON m.id = mc.movie_id LEFT JOIN countries c ON mc.country_id = c.id';
      else countQuery += ' LEFT JOIN movie_countries mc ON m.id = mc.movie_id LEFT JOIN countries c ON mc.country_id = c.id';
      countConditions.push(`c.slug = $${cpi++}`); countParams.push(country);
    }
    if (year) { countConditions.push(`m.year = $${cpi++}`); countParams.push(parseInt(year)); }
    if (search) {
      const searchStrTrim = search.trim();
      const likeSearchStr = `%${searchStrTrim}%`;
      const normalizedSlug = removeVietnameseTones(searchStrTrim).replace(/\s+/g, '-').toLowerCase().replace(/y/g, 'i');
      const slugSearchStr = `%${normalizedSlug}%`;
      countConditions.push(`(m.title ILIKE $${cpi} OR m.original_title ILIKE $${cpi} OR REPLACE(m.slug, 'y', 'i') ILIKE $${cpi + 1})`);
      countParams.push(likeSearchStr, slugSearchStr);
      cpi += 2;
    }
    
    if (countConditions.length > 0) countQuery += ' WHERE ' + countConditions.join(' AND ');

    const [moviesResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    const totalItems = parseInt(countResult.rows[0].count);
    res.json({
      status: true,
      items: moviesResult.rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        itemsPerPage: limit,
      }
    });
  } catch (err) {
    console.error('getMovies error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/movies/featured
 */
async function getFeaturedMovies(req, res) {
  try {
    const result = await pool.query(`
      SELECT m.*,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as genres,
        array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as countries
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
      WHERE m.is_featured = TRUE OR m.backdrop_url IS NOT NULL
      GROUP BY m.id
      ORDER BY m.updated_at DESC
      LIMIT 10
    `);
    res.json({ status: true, items: result.rows });
  } catch (err) {
    console.error('getFeaturedMovies error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/movies/:slug
 */
async function getMovieBySlug(req, res) {
  try {
    const { slug } = req.params;
    const result = await pool.query(`
      SELECT m.*,
        array_agg(DISTINCT jsonb_build_object('name', g.name, 'slug', g.slug)) FILTER (WHERE g.name IS NOT NULL) as genres,
        array_agg(DISTINCT jsonb_build_object('name', c.name, 'slug', c.slug)) FILTER (WHERE c.name IS NOT NULL) as countries
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
      WHERE m.slug = $1
      GROUP BY m.id
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: 'Movie not found' });
    }

    // Get episodes
    const episodes = await pool.query(`
      SELECT e.*, 
        json_agg(json_build_object(
          'id', es.id, 'server_name', es.server_name, 'server_type', es.server_type,
          'embed_url', es.embed_url, 'm3u8_url', es.m3u8_url, 'quality', es.quality,
          'is_working', es.is_working
        ) ORDER BY es.server_name) FILTER (WHERE es.id IS NOT NULL) as servers
      FROM episodes e
      LEFT JOIN episode_servers es ON e.id = es.episode_id
      WHERE e.movie_id = $1
      GROUP BY e.id
      ORDER BY e.episode_number ASC
    `, [result.rows[0].id]);

    // Increment view count
    pool.query('UPDATE movies SET view_count = view_count + 1 WHERE id = $1', [result.rows[0].id]);

    res.json({
      status: true,
      movie: result.rows[0],
      episodes: episodes.rows
    });
  } catch (err) {
    console.error('getMovieBySlug error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/movies/:id/episodes
 */
async function getMovieEpisodes(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT e.*,
        json_agg(json_build_object(
          'id', es.id, 'server_name', es.server_name, 'server_type', es.server_type,
          'embed_url', es.embed_url, 'm3u8_url', es.m3u8_url, 'quality', es.quality,
          'is_working', es.is_working
        ) ORDER BY es.server_name) FILTER (WHERE es.id IS NOT NULL) as servers
      FROM episodes e
      LEFT JOIN episode_servers es ON e.id = es.episode_id
      WHERE e.movie_id = $1
      GROUP BY e.id
      ORDER BY e.episode_number ASC
    `, [id]);
    res.json({ status: true, items: result.rows });
  } catch (err) {
    console.error('getMovieEpisodes error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

/**
 * GET /api/episodes/:id/servers
 */
async function getEpisodeServers(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM episode_servers WHERE episode_id = $1 ORDER BY server_name', [id]
    );
    res.json({ status: true, items: result.rows });
  } catch (err) {
    console.error('getEpisodeServers error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

module.exports = { getMovies, getFeaturedMovies, getMovieBySlug, getMovieEpisodes, getEpisodeServers };
