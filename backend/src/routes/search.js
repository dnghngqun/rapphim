const express = require('express');
const router = express.Router();
const { searchMovies } = require('../controllers/searchController');

router.get('/', searchMovies);

module.exports = router;
