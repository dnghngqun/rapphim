require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { pool } = require('./config/database');
const { startScraperJob } = require('./jobs/scraperJob');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.BACKEND_PORT || 4000;

// ============================================================
// Middleware
// ============================================================
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use(morgan('short', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 200, // 200 requests/phút
  message: { status: false, error: 'Too many requests, try again later.' }
});
app.use('/api', limiter);

// ============================================================
// Routes
// ============================================================
app.use('/api/movies', require('./routes/movies'));
app.use('/api/episodes', require('./routes/episodes'));
app.use('/api/search', require('./routes/search'));
app.use('/api/scraper', require('./routes/scraper'));
app.use('/api', require('./routes/taxonomy'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: false, error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ status: false, error: 'Internal server error' });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  logger.info(`🎬 RapPhim Backend running on http://localhost:${PORT}`);
  logger.info(`📡 API available at http://localhost:${PORT}/api`);
  logger.info(`📅 Scheduler: full crawl every day at midnight, discover every 6h, verify every 12h`);

  // Start scheduler
  startScraperJob();
});
