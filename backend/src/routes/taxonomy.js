const express = require('express');
const router = express.Router();
const { getGenres, getCountries } = require('../controllers/genreController');
const { getMovies } = require('../controllers/movieController');

// Genre routes
router.get('/genres', getGenres);
router.get('/genres/:slug/movies', (req, res) => {
  req.query.genre = req.params.slug;
  return getMovies(req, res);
});

// Country routes
router.get('/countries', getCountries);
router.get('/countries/:slug/movies', (req, res) => {
  req.query.country = req.params.slug;
  return getMovies(req, res);
});

module.exports = router;
