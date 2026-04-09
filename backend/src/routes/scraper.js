const express = require('express');
const router = express.Router();
const { triggerScraper, getScraperStatus, getScraperStats, discoverSources, enrichSources } = require('../controllers/scraperController');

router.post('/trigger', triggerScraper);
router.get('/status', getScraperStatus);
router.get('/stats', getScraperStats);
router.post('/discover', discoverSources);
// Tìm nguồn dự phòng: { mode: "all"|"tracked"|"slug", slug?: string, limit?: number }
router.post('/enrich', enrichSources);

module.exports = router;

