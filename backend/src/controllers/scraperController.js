const { spawn } = require('child_process');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

const SCRAPER_DIR = path.resolve(__dirname, '../../../scraper');

// Job states mapped by jobKey
// Structure: activeJobs[jobKey] = { isRunning: boolean, lastRun: Date, lastResult: string, logs: array, process: child_process }
const activeJobs = new Map();

function getJobState(jobKey) {
  if (!activeJobs.has(jobKey)) {
    activeJobs.set(jobKey, {
      isRunning: false,
      lastRun: null,
      lastResult: null,
      logs: [],
      process: null
    });
  }
  return activeJobs.get(jobKey);
}

// Trả về promise để vòng lặp có thể chờ tiến trình kết thúc
function runScraper(jobKey, args = []) {
  const state = getJobState(jobKey);

  if (state.isRunning) {
    logger.warn(`⚠️ Bỏ qua lệnh: Scraper job '${jobKey}' đang chạy rồi.`);
    return Promise.resolve({ success: false, message: 'Scraper is already running' });
  }

  state.isRunning = true;
  state.logs = [];
  const startTime = new Date();

  logger.info(`🚀 Khởi động Scraper Job: [${jobKey}] với args: ${args.join(' ')}`);

  const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
  state.process = spawn(PYTHON_BIN, ['-u', 'main.py', ...args], {
    cwd: SCRAPER_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    shell: true,
  });

  state.process.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      state.logs.push({ time: new Date().toISOString(), level: 'info', message: msg });
      if (state.logs.length > 500) state.logs.shift(); // Chống Memory leak khi chạy nhiều ngày
      logger.info(`[${jobKey}] ${msg}`);
    }
  });

  state.process.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      state.logs.push({ time: new Date().toISOString(), level: 'error', message: msg });
      if (state.logs.length > 500) state.logs.shift();
      logger.error(`[${jobKey}] ${msg}`);
    }
  });

  return new Promise((resolve) => {
    state.process.on('close', (code) => {
      state.isRunning = false;
      state.lastRun = new Date();
      state.lastResult = code === 0 ? 'success' : `failed (code: ${code})`;
      state.process = null;
      logger.info(`✅ Scraper job [${jobKey}] kết thúc: ${state.lastResult} (thời gian: ${((state.lastRun - startTime) / 1000).toFixed(1)}s)`);
      resolve({ success: code === 0, code });
    });

    state.process.on('error', (err) => {
      state.isRunning = false;
      state.lastRun = new Date();
      state.lastResult = `error: ${err.message}`;
      state.process = null;
      logger.error(`❌ Scraper job [${jobKey}] LỖI: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
  });
}

function spawnScraperAsync(jobKey, args = []) {
  // Fire and forget cho API call
  runScraper(jobKey, args).catch(err => logger.error(`Error in async job ${jobKey}: ${err}`));
  return { success: true, message: `Scraper job '${jobKey}' started` };
}

/** POST /api/scraper/trigger */
async function triggerScraper(req, res) {
  const { source = 'all', mode = 'incremental', pages } = req.body || {};
  const args = ['crawl', '--source', source, '--mode', mode];
  if (pages) args.push('--pages', String(pages));
  
  const jobKey = `manual_${mode}`; // user manually trigger from admin panel
  const state = getJobState(jobKey);
  if (state.isRunning) {
    return res.json({ status: false, message: 'Scraper is already running' });
  }

  const result = spawnScraperAsync(jobKey, args);
  res.json({ status: result.success, ...result });
}

/** GET /api/scraper/status */
async function getScraperStatus(req, res) {
  const statusObj = {};
  let anyRunning = false;
  let allLogs = [];

  for (const [key, state] of activeJobs.entries()) {
    statusObj[key] = {
      isRunning: state.isRunning,
      lastRun: state.lastRun ? state.lastRun.toISOString() : null,
      lastResult: state.lastResult,
      recentLogs: state.logs.slice(-10),
    };
    if (state.isRunning) anyRunning = true;
    allLogs = allLogs.concat(state.logs.slice(-10));
  }
  
  allLogs.sort((a,b) => new Date(a.time) - new Date(b.time));

  res.json({
    status: true,
    isRunning: anyRunning, // Backward compatibility
    jobs: statusObj,
    recentLogs: allLogs.slice(-50), // Backward compatibility
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
  const result = spawnScraperAsync('manual_discover', ['discover']);
  res.json({ status: result.success, ...result });
}

/**
 * POST /api/scraper/enrich
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

  const result = spawnScraperAsync(`manual_enrich_${mode}`, args);
  res.json({ status: result.success, mode, ...result });
}

module.exports = {
  triggerScraper, getScraperStatus, getScraperStats,
  discoverSources, enrichSources,
  runScraper, spawnScraperAsync
};
