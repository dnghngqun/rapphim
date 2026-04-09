const { pool } = require('../config/database');

const removeVietnameseTones = (str) => {
  return str
    .normalize('NFD') // Chuẩn hóa Unicode
    .replace(/[\u0300-\u036f]/g, '') // Xóa các dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D'); // Chữ đ/Đ
};

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
    
    const exactSearchTerm = searchTerm;
    const likeSearchTerm = `%${searchTerm}%`;
    const normalizedSlug = removeVietnameseTones(searchTerm).replace(/\s+/g, '-').toLowerCase().replace(/y/g, 'i');
    const slugSearchTerm = `%${normalizedSlug}%`;

    const result = await pool.query(`
      SELECT m.*,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as genres,
        array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as countries
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
      WHERE 
        m.title ILIKE $1
        OR m.original_title ILIKE $1
        OR REPLACE(m.slug, 'y', 'i') ILIKE $2
      GROUP BY m.id
      ORDER BY 
        CASE 
          WHEN m.title ILIKE $3 OR m.original_title ILIKE $3 THEN 1
          WHEN m.title ILIKE $1 OR m.original_title ILIKE $1 THEN 2
          ELSE 3
        END,
        m.updated_at DESC
      LIMIT $4 OFFSET $5
    `, [likeSearchTerm, slugSearchTerm, exactSearchTerm, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT m.id) FROM movies m
      WHERE 
        m.title ILIKE $1
        OR m.original_title ILIKE $1
        OR REPLACE(m.slug, 'y', 'i') ILIKE $2
    `, [likeSearchTerm, slugSearchTerm]);

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
