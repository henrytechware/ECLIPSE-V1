'use strict';

const path = require('path');
require('dotenv').config();

const root = path.resolve(__dirname, '..');

const config = {
  botName: process.env.BOT_NAME || 'ECLIPSE V1',
  ownerName: process.env.OWNER_NAME || 'MR. RYAN',
  prefix: process.env.PREFIX || '.',
  mode: (process.env.BOT_MODE || 'public').toLowerCase(),
  reaction: process.env.DEFAULT_REACTION || '🌔',

  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  ownerTelegramId: process.env.OWNER_TELEGRAM_ID || '',

  paths: {
    root,
    database: path.resolve(root, process.env.DATABASE_PATH || './data/database.json'),
    sessions: path.resolve(root, process.env.SESSION_PATH || './sessions'),
    temp: path.resolve(root, './temp'),
  },

  apis: {
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    grok: process.env.GROK_API_KEY || '',
    weather: process.env.WEATHER_API_KEY || '',
    textmaker: process.env.TEXTMAKER_API || '',
    omdb: process.env.OMDB_API_KEY || '',
    cobalt: process.env.COBALT_API_URL || '',
    cobaltKey: process.env.COBALT_API_KEY || '',
  },

  publicUrl: process.env.PUBLIC_URL || '',
  repoUrl: process.env.REPO_URL || 'https://github.com/',

  limits: {
    // bytes
    maxDownloadSize: 60 * 1024 * 1024,
    maxStickerVideoSeconds: 10,
    maxVideoInputSize: 80 * 1024 * 1024,
    httpTimeout: 60000,
    concurrentDownloads: 2,
  },

  rateLimit: {
    windowMs: 10000,
    maxCommands: 6,
    cooldownMs: 15000,
  },
};

module.exports = config;
