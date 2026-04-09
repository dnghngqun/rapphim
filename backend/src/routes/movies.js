const express = require('express');
const router = express.Router();
const { getMovies, getFeaturedMovies, getMovieBySlug, getMovieEpisodes, getEpisodeServers } = require('../controllers/movieController');
const { cacheMiddleware } = require('../middlewares/cache');

// Danh sách chung & search (cache 1 phút vì hay search)
router.get('/', cacheMiddleware(1), getMovies);

// Nổi bật & Homepage (cache 5 phút)
router.get('/featured', cacheMiddleware(5), getFeaturedMovies);

// Tạm thời KHÔNG cache /:slug để đảm bảo logic tăng view
router.get('/:slug', getMovieBySlug);
router.get('/:id/episodes', getMovieEpisodes);

module.exports = router;
