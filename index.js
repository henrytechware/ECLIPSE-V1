'use strict';

const fs = require('fs');
const config = require('./config/config');
const logger = require('./src/utils/logger');
const registry = require('./src/commands');
const media = require('./src/utils/media');
const { startTelegram, notifier } = require('./src/telegram/bot');
const { restoreSessions } = require('./src/whatsapp/connection');

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error.message);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
});

async function main() {
  for (const dir of [config.paths.sessions, config.paths.temp]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info(`Booting ${config.botName} (owner: ${config.ownerName})`);
  registry.load();

  await restoreSessions((telegramId) => notifier(telegramId));

  try {
    await startTelegram();
  } catch (error) {
    logger.error('Telegram bot could not start:', error.message);
    logger.warn('WhatsApp sessions still run, but pairing requires a valid TELEGRAM_BOT_TOKEN.');
  }

  setInterval(() => media.cleanTempDir().catch(() => {}), 15 * 60 * 1000).unref?.();
  logger.info(`${config.botName} is ready.`);
}

main().catch((error) => {
  logger.error('Fatal startup error:', error.message);
  process.exit(1);
});
