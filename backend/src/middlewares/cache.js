const redis = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Cache middleware
 * @param {number} ttlMinutes - Time to live in minutes
 */
const cacheMiddleware = (ttlMinutes = 5) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Use originalUrl as key (e.g. /api/search?q=abc)
      const cacheKey = `rapphim:cache:${req.originalUrl}`;
      
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        // Return from cache immediately
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cachedData));
      }

      // Intercept res.json
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful requests
        if (res.statusCode === 200 && body && body.status !== false) {
          redis.setex(cacheKey, ttlMinutes * 60, JSON.stringify(body)).catch((err) => {
            logger.error(`Redis Set Error: ${err.message}`);
          });
        }
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.error(`Redis Cache Middleware Error: ${err.message}`);
      next();
    }
  };
};

const clearCachePattern = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
      logger.info(`🧹 Cleared ${keys.length} cache keys matching ${pattern}`);
    }
  } catch (err) {
    logger.error('Failed to clear cache: ' + err.message);
  }
};

module.exports = { cacheMiddleware, clearCachePattern };
