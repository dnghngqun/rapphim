const express = require('express');
const router = express.Router();
const { getMovies, getFeaturedMovies, getMovieBySlug, getMovieEpisodes, getEpisodeServers } = require('../controllers/movieController');

router.get('/', getMovies);
router.get('/featured', getFeaturedMovies);
router.get('/:slug', getMovieBySlug);
router.get('/:id/episodes', getMovieEpisodes);

module.exports = router;
