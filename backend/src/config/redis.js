const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

// Configure Redis client
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('🟢 Connected to Redis successfully');
});

redis.on('error', (err) => {
  logger.error(`🔴 Redis Error: ${err.message}`);
});

module.exports = redis;
