const cron = require('node-cron');
const logger = require('../utils/logger');
const { runScraper, spawnScraperAsync } = require('../controllers/scraperController');

async function startEternalCrawlLoop() {
  logger.info('🚀 Khởi động luồng Crawl Vĩnh Cửu (Eternal Crawl Loop)...');
  
  while (true) {
    try {
      logger.info('🔄 [EternalLoop] Bắt đầu chạy chu kỳ Full Crawl...');
      
      // Chờ cho đến khi tiến trình crawl cào MỌI TRANG HOÀN TẤT (mất nhiều ngày)
      await runScraper('loop_full_crawl', ['crawl', '--source', 'all', '--mode', 'full']);
      
      logger.info('✅ [EternalLoop] Đã hoàn thành 1 chu kỳ Full Crawl.');
      logger.info('😴 [EternalLoop] Bắt đầu ngủ đông đúng 24 GIỜ (1 ngày) trước chu kỳ tiếp theo...');
      
      // Chờ đúng 24 tiếng (24 * 60 * 60 * 1000 milliseconds)
      await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000));
      
    } catch (error) {
      logger.error(`❌ [EternalLoop] Lỗi trong chu kỳ crawl: ${error.message}`);
      logger.info('😴 [EternalLoop] Chờ 1 giờ rồi thử lại sau lỗi để tránh crash loop...');
      await new Promise(resolve => setTimeout(resolve, 1 * 60 * 60 * 1000));
    }
  }
}

function startScraperJob() {
  // START ETERNAL LOOP (Thay thế cho cron 0 0 * * *)
  startEternalCrawlLoop();

  // -------- CÁC TÁC VỤ NHỎ (CHẠY SONG SONG BÌNH THƯỜNG) --------

  // Chạy AI discover mỗi 6 giờ
  cron.schedule('0 */6 * * *', () => {
    logger.info('🔍 AI source discovery trigger (every 6 hours)');
    spawnScraperAsync('cron_discover', ['discover']);
  });

  // Verify links mỗi 12 giờ
  cron.schedule('0 */12 * * *', () => {
    logger.info('✅ Link verification trigger (every 12 hours)');
    spawnScraperAsync('cron_verify', ['verify', '--batch-size', '500']);
  });

  // Cập nhật phim theo dõi đặc biệt mỗi ngày lúc 2:00 sáng
  cron.schedule('0 2 * * *', () => {
    logger.info('🎯 Tracked movies update (2am) - updating from ALL sources, AI normalize any format...');
    spawnScraperAsync('cron_track_update', ['track-update']);
  });

  // Tìm nguồn dự phòng cho tất cả phim — Chủ Nhật 3:00 AM
  cron.schedule('0 3 * * 0', () => {
    logger.info('🌐 Source enrichment (Sunday 3am) - finding backup sources for all movies...');
    spawnScraperAsync('cron_enrich_all', ['enrich-sources', 'all']);
  });

  // Enrich nguồn dự phòng cho tracked movies — mỗi 2 ngày lúc 3:30 AM
  cron.schedule('30 3 */2 * *', () => {
    logger.info('🌐 Source enrichment - tracked movies (every 2 days at 3:30am)...');
    spawnScraperAsync('cron_enrich_tracked', ['enrich-sources', 'tracked']);
  });

  logger.info([
    '📅 Scheduler configured:',
    '  - Full crawl: [Eternal Loop - 24h rest delay]',
    '  - AI discover: every 6 hours',
    '  - Link verify: every 12 hours',
    '  - Tracked movies update (AI normalize): daily at 02:00',
    '  - Source enrichment (backup sources): Sundays at 03:00',
    '  - Tracked enrichment: every 2 days at 03:30',
  ].join('\n'));

  // ── Startup jobs ──────────────────────────────────────────────────────
  // AI discover ngay khi khởi động
  setTimeout(() => {
    logger.info('⚡ Startup: AI Discovery...');
    spawnScraperAsync('startup_discover', ['discover']);
  }, 10_000);

  // track-update sau 2 phút
  setTimeout(() => {
    logger.info('🎯 Startup: tracked movies update from ALL sources...');
    spawnScraperAsync('startup_track_update', ['track-update']);
  }, 2 * 60 * 1000);
}

module.exports = { startScraperJob };
