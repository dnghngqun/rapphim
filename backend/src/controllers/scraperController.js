const { spawn } = require('child_process');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

let scraperProcess = null;
let isRunning = false;
let lastRun = null;
let lastResult = null;
let currentLogs = [];

const SCRAPER_DIR = path.resolve(__dirname, '../../../scraper');

function runScraper(args = []) {
  if (isRunning) {
    return { success: false, message: 'Scraper is already running' };
  }

  isRunning = true;
  currentLogs = [];
  const startTime = new Date();

  logger.info(`🚀 Starting scraper with args: ${args.join(' ')}`);

  const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
  scraperProcess = spawn(PYTHON_BIN, ['-u', 'main.py', ...args], {
    cwd: SCRAPER_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    shell: true,
  });

  scraperProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      currentLogs.push({ time: new Date().toISOString(), level: 'info', message: msg });
      logger.info(`[Scraper] ${msg}`);
    }
  });

  scraperProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      currentLogs.push({ time: new Date().toISOString(), level: 'error', message: msg });
      logger.error(`[Scraper] ${msg}`);
    }
  });

  scraperProcess.on('close', (code) => {
    isRunning = false;
    lastRun = new Date();
    lastResult = code === 0 ? 'success' : `failed (code: ${code})`;
    scraperProcess = null;
    logger.info(`Scraper finished: ${lastResult} (duration: ${((lastRun - startTime) / 1000).toFixed(1)}s)`);
  });

  scraperProcess.on('error', (err) => {
    isRunning = false;
    lastRun = new Date();
    lastResult = `error: ${err.message}`;
    scraperProcess = null;
    logger.error(`Scraper error: ${err.message}`);
  });

  return { success: true, message: 'Scraper started' };
}

/** POST /api/scraper/trigger */
async function triggerScraper(req, res) {
  const { source = 'all', mode = 'incremental', pages } = req.body || {};
  const args = ['crawl', '--source', source, '--mode', mode];
  if (pages) args.push('--pages', String(pages));

  const result = runScraper(args);
  res.json({ status: result.success, ...result });
}

/** GET /api/scraper/status */
async function getScraperStatus(req, res) {
  res.json({
    status: true,
    isRunning,
    lastRun: lastRun ? lastRun.toISOString() : null,
    lastResult,
    recentLogs: currentLogs.slice(-50),
  });
}

/** GET /api/scraper/stats */
async function getScraperStats(req, res) {
  try {
    const [movies, episodes, servers, sources, recentLogs] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, movie_type, COUNT(*) as count FROM movies GROUP BY movie_type'),
      pool.query('SELECT COUNT(*) as total FROM episodes'),
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_working = TRUE) as working FROM episode_servers'),
      pool.query('SELECT name, source_type, is_active, total_movies, last_crawled_at FROM sources ORDER BY priority ASC'),
      pool.query('SELECT * FROM crawl_logs ORDER BY started_at DESC LIMIT 10'),
    ]);

    const totalMovies = await pool.query('SELECT COUNT(*) FROM movies');

    res.json({
      status: true,
      stats: {
        totalMovies: parseInt(totalMovies.rows[0].count),
        moviesByType: movies.rows,
        totalEpisodes: parseInt(episodes.rows[0].total),
        totalServers: parseInt(servers.rows[0].total),
        workingServers: parseInt(servers.rows[0].working),
        sources: sources.rows,
        recentCrawls: recentLogs.rows,
      }
    });
  } catch (err) {
    console.error('getScraperStats error:', err);
    res.status(500).json({ status: false, error: 'Internal server error' });
  }
}

/** POST /api/scraper/discover */
async function discoverSources(req, res) {
  const result = runScraper(['discover']);
  res.json({ status: result.success, ...result });
}

/**
 * POST /api/scraper/enrich
 * Body: { mode: "all"|"tracked"|"slug", slug?: string, limit?: number }
 * Tìm nguồn dự phòng cho phim đã có trong DB.
 */
async function enrichSources(req, res) {
  const { mode = 'tracked', slug = '', limit = 200 } = req.body || {};

  if (!['all', 'tracked', 'slug'].includes(mode)) {
    return res.status(400).json({ status: false, error: 'mode must be all | tracked | slug' });
  }
  if (mode === 'slug' && !slug) {
    return res.status(400).json({ status: false, error: 'slug is required when mode=slug' });
  }

  const args = ['enrich-sources', mode];
  if (mode === 'all')  args.push(String(limit));
  if (mode === 'slug') args.push(slug);

  const result = runScraper(args);
  res.json({ status: result.success, mode, ...result });
}

module.exports = {
  triggerScraper, getScraperStatus, getScraperStats,
  discoverSources, enrichSources,
  runScraper, isRunning: () => isRunning,
};

