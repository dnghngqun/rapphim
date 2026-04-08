const express = require('express');
const router = express.Router();
const { getEpisodeServers } = require('../controllers/movieController');

router.get('/:id/servers', getEpisodeServers);

module.exports = router;
