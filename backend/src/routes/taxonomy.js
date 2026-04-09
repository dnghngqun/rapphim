const express = require('express');
const router = express.Router();
const { getGenres, getCountries } = require('../controllers/genreController');
const { getMovies } = require('../controllers/movieController');
const cache = require('../middlewares/cache');

// Genre routes (cache lists for 60 mins, movie listings for 5 mins)
router.get('/genres', cache(60), getGenres);
router.get('/genres/:slug/movies', cache(5), (req, res) => {
  req.query.genre = req.params.slug;
  return getMovies(req, res);
});

// Country routes
router.get('/countries', cache(60), getCountries);
router.get('/countries/:slug/movies', cache(5), (req, res) => {
  req.query.country = req.params.slug;
  return getMovies(req, res);
});

module.exports = router;
