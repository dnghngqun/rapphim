const cron = require('node-cron');
const logger = require('../utils/logger');
const { runScraper } = require('../controllers/scraperController');

const INTERVAL = process.env.SCRAPER_INTERVAL_MINUTES || 30;

function startScraperJob() {
  // Mỗi ngày lúc 0:00: crawl full TẤT CẢ các trang từ mọi nguồn
  cron.schedule('0 0 * * *', () => {
    logger.info('⏰ Full crawl trigger (every day at midnight) - crawling ALL pages...');
    runScraper(['crawl', '--source', 'all', '--mode', 'full']);
  });

  // Chạy AI discover sau đó crawl TẤT CẢ mỗi 6 giờ
  cron.schedule('0 */6 * * *', () => {
    logger.info('🔍 AI source discovery + Full Crawl trigger (every 6 hours)');
    runScraper(['discover-and-crawl']);
  });

  // Verify links mỗi 12 giờ
  cron.schedule('0 */12 * * *', () => {
    logger.info('✅ Link verification trigger (every 12 hours)');
    runScraper(['verify', '--batch-size', '500']);
  });

  // Cập nhật phim theo dõi đặc biệt mỗi ngày lúc 2:00 sáng (sau full crawl)
  // Script này check TẤT CẢ nguồn (OPhim, KKPhim, NguonPhim...) cho từng phim trong tracked_movies.json
  cron.schedule('0 2 * * *', () => {
    logger.info('🎯 Tracked movies update trigger (every day at 2am) - updating from ALL sources...');
    runScraper(['track-update']);
  });

  logger.info(`📅 Scheduler: full crawl @ midnight, discover every 6h, verify every 12h, tracked-movies update @ 2am`);

  // Chạy Khám phá nguồn bằng AI ngay khi khởi động, sau đó Crawl (đợi 10s cho DB)
  setTimeout(() => {
    logger.info(`⚡ Initial startup - Running AI Discovery AND then crawling ALL sources...`);
    runScraper(['discover-and-crawl']);
  }, 10000);

  // Chạy track-update khi startup (sau 5 phút để không đụng với discover-and-crawl)
  setTimeout(() => {
    logger.info(`🎯 Initial startup - Running tracked movies update from ALL sources...`);
    runScraper(['track-update']);
  }, 5 * 60 * 1000);
}

module.exports = { startScraperJob };

