const express = require('express');
const router = express.Router();
const { searchMovies } = require('../controllers/searchController');
const { cacheMiddleware } = require('../middlewares/cache');

// Cache search API for 1 minute
router.get('/', cacheMiddleware(1), searchMovies);

module.exports = router;
