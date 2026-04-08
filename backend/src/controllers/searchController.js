const { pool } = require('../config/database');

/** GET /api/search?q=keyword&page=1&limit=24 */
async function searchMovies(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ status: true, items: [], pagination: { currentPage: 1, totalPages: 0, totalItems: 0 } });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 24);
    const offset = (page - 1) * limit;
    const searchTerm = q.trim();

    // Full-text search + ILIKE fallback
    const result = await pool.query(`
      SELECT m.*,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as genres,
        array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as countries,
        ts_rank(to_tsvector('simple', coalesce(m.title,'') || ' ' || coalesce(m.original_title,'')), plainto_tsquery('simple', $1)) as rank
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
      WHERE 
        to_tsvector('simple', coalesce(m.title,'') || ' ' || coalesce(m.original_title,'')) @@ plainto_tsquery('simple', $1)
        OR m.title ILIKE $2
        OR m.original_title ILIKE $2
        OR m.slug ILIKE $3
      GROUP BY m.id
      ORDER BY rank DESC, m.updated_at DESC
      LIMIT $4 OFFSET $5
    `, [searchTerm, `%${searchTerm}%`, `%${searchTerm.replace(/\s+/g, '-')}%`, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT m.id) FROM movies m
      WHERE 
        to_tsvector('simple', coalesce(m.title,'') || ' ' || coalesce(m.original_title,'')) @@ plainto_tsquery('simple', $1)
        OR m.title ILIKE $2
        OR m.original_title ILIKE $2
    `, [searchTerm, `%${searchTerm}%`]);

    const totalItems = parseInt(countResult.rows[0].count);
    res.json({
      status: true,
      items: result.rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        itemsPerPage: limit,
      }
    });
  } catch (err) {
    console.error('searchMovies error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

module.exports = { searchMovies };
