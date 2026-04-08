const express = require('express');
const router = express.Router();
const { triggerScraper, getScraperStatus, getScraperStats, discoverSources } = require('../controllers/scraperController');
const { getEpisodeServers } = require('../controllers/movieController');

router.post('/trigger', triggerScraper);
router.get('/status', getScraperStatus);
router.get('/stats', getScraperStats);
router.post('/discover', discoverSources);

module.exports = router;
