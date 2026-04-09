const express = require('express');
const router = express.Router();
const { searchMovies } = require('../controllers/searchController');
const cache = require('../middlewares/cache');

// Cache search API for 1 minute
router.get('/', cache(1), searchMovies);

module.exports = router;
