'use strict';

const logger = require('../utils/logger');
const { pair, pairingMessage, normalizeNumber } = require('../whatsapp/pairing');

/**
 * Telegram users currently in the "send me your number" state.
 */
const awaitingNumber = new Map(); // chatId -> { telegramId, at }

function requestNumber(chatId, telegramId) {
  awaitingNumber.set(String(chatId), { telegramId, at: Date.now() });
}

function isAwaiting(chatId) {
  const entry = awaitingNumber.get(String(chatId));
  if (!entry) return false;
  if (Date.now() - entry.at > 5 * 60 * 1000) {
    awaitingNumber.delete(String(chatId));
    return false;
  }
  return true;
}

function clear(chatId) {
  awaitingNumber.delete(String(chatId));
}

async function runPairing(bot, chatId, telegramId, rawNumber) {
  const number = normalizeNumber(rawNumber);
  if (!number) {
    await bot.sendMessage(chatId, '❌ Invalid number. Use international format without +, e.g. `2348012345678`', {
      parse_mode: 'Markdown',
    });
    return;
  }

  clear(chatId);
  await bot.sendMessage(chatId, '🌑 Creating your WhatsApp session, please wait...');

  try {
    const { code } = await pair({
      telegramId,
      rawNumber: number,
      notify: async (text) => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(() => null),
    });
    await bot.sendMessage(chatId, pairingMessage(code), { parse_mode: 'Markdown' });
    logger.info(`Pairing code sent to Telegram chat ${chatId}`);
  } catch (error) {
    logger.error('Pairing failed:', error.message);
    await bot.sendMessage(chatId, `🚫 Pairing failed: ${error.message}`);
  }
}

module.exports = { requestNumber, isAwaiting, clear, runPairing };
