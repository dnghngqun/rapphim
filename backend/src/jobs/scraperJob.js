const cron = require('node-cron');
const logger = require('../utils/logger');
const { runScraper } = require('../controllers/scraperController');

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

  // Cập nhật phim theo dõi đặc biệt mỗi ngày lúc 2:00 sáng
  // Check TẤT CẢ nguồn (OPhim, KKPhim, NguonPhim + AI web search) cho từng phim
  // Nếu response không phải dạng OPhim → AI normalize về schema của mình
  cron.schedule('0 2 * * *', () => {
    logger.info('🎯 Tracked movies update (2am) - updating from ALL sources, AI normalize any format...');
    runScraper(['track-update']);
  });

  // Tìm nguồn dự phòng cho phim đã có — Chủ Nhật 3:00 AM
  // Mỗi phim sẽ được tìm thêm nguồn (OPhim/KKPhim/NguonPhim + AI web)
  // để user có thể chọn nguồn khác khi nguồn chính bị lag/down
  cron.schedule('0 3 * * 0', () => {
    logger.info('🌐 Source enrichment (Sunday 3am) - finding backup sources for all movies...');
    runScraper(['enrich-sources', 'all']);
  });

  // Enrich nguồn dự phòng cho tracked movies — mỗi 2 ngày lúc 3:30 AM
  // Ưu tiên phim trong danh sách theo dõi đặc biệt
  cron.schedule('30 3 */2 * *', () => {
    logger.info('🌐 Source enrichment - tracked movies (every 2 days at 3:30am)...');
    runScraper(['enrich-sources', 'tracked']);
  });

  logger.info([
    '📅 Scheduler configured:',
    '  - Full crawl: every day at 00:00',
    '  - AI discover + crawl: every 6 hours',
    '  - Link verify: every 12 hours',
    '  - Tracked movies update (AI normalize): daily at 02:00',
    '  - Source enrichment (backup sources): Sundays at 03:00',
    '  - Tracked enrichment: every 2 days at 03:30',
  ].join('\n'));

  // ── Startup jobs ──────────────────────────────────────────────────────
  // AI discover + crawl ngay khi khởi động
  setTimeout(() => {
    logger.info('⚡ Startup: AI Discovery + crawl all sources...');
    runScraper(['discover-and-crawl']);
  }, 10_000);

  // track-update sau 5 phút (không đụng với discover-and-crawl)
  setTimeout(() => {
    logger.info('🎯 Startup: tracked movies update from ALL sources...');
    runScraper(['track-update']);
  }, 5 * 60 * 1000);

  // enrich tracked movies sau 30 phút
  setTimeout(() => {
    logger.info('🌐 Startup: source enrichment for tracked movies...');
    runScraper(['enrich-sources', 'tracked']);
  }, 30 * 60 * 1000);
}

module.exports = { startScraperJob };


