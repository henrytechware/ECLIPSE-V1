'use strict';

const TelegramBot = require('node-telegram-bot-api');
const config = require('../../config/config');
const logger = require('../utils/logger');
const { registerCommands } = require('./commands');

let instance = null;

function getBot() {
  return instance;
}

function notifier(telegramId) {
  return async (text) => {
    if (!instance) return null;

    return instance
      .sendMessage(telegramId, text, {
        parse_mode: 'Markdown',
      })
      .catch(() => null);
  };
}

async function startTelegram() {
  if (instance) return instance;

  if (!config.telegramToken) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is missing. Add it to your .env file.'
    );
  }

  instance = new TelegramBot(
    config.telegramToken,
    {
      polling: true,
    }
  );

  instance.on(
    'polling_error',
    (error) => {
      logger.error(
        'Telegram polling error:',
        error.message
      );
    }
  );

  registerCommands(instance);

  const me = await instance.getMe();

  logger.info(
    `Telegram connected as @${me.username}`
  );

  return instance;
}

async function stopTelegram() {
  if (!instance) return;

  await instance
    .stopPolling()
    .catch(() => {});

  instance = null;
}

module.exports = {
  startTelegram,
  stopTelegram,
  getBot,
  notifier,
};