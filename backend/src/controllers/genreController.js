const { pool } = require('../config/database');

/** GET /api/genres */
async function getGenres(req, res) {
  try {
    const result = await pool.query(`
      SELECT g.*, COUNT(mg.movie_id) as movie_count
      FROM genres g
      LEFT JOIN movie_genres mg ON g.id = mg.genre_id
      GROUP BY g.id
      ORDER BY g.name ASC
    `);
    res.json({ status: true, items: result.rows });
  } catch (err) {
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

/** GET /api/countries */
async function getCountries(req, res) {
  try {
    const result = await pool.query(`
      SELECT c.*, COUNT(mc.movie_id) as movie_count
      FROM countries c
      LEFT JOIN movie_countries mc ON c.id = mc.country_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    res.json({ status: true, items: result.rows });
  } catch (err) {
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

module.exports = { getGenres, getCountries };
