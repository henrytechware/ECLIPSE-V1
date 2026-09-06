'use strict';

const config = require('../../config/config');
const logger = require('../utils/logger');
const sessions = require('./sessions');
const { startSession } = require('./connection');

/**
 * Validate an international phone number (digits only, 8-15 digits).
 */
function normalizeNumber(input) {
  const digits = String(input || '').replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Start a pairing flow for a Telegram user and return the pairing code.
 */
async function pair({ telegramId, rawNumber, notify }) {
  const number = normalizeNumber(rawNumber);
  if (!number) {
    throw new Error('Invalid number. Send it in international format, e.g. 2348012345678');
  }

  const existing = sessions.get(telegramId);
  if (existing && existing.status === 'open') {
    throw new Error('This Telegram account already has a connected WhatsApp session. Use /logout first.');
  }
  if (existing && existing.status === 'connecting') {
    throw new Error('A pairing attempt is already running for your account. Please wait.');
  }

  // A fresh pairing always uses a clean auth directory.
  await sessions.removeSessionFiles(telegramId).catch(() => {});

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timed out while generating the pairing code. Please try again.'));
      }
    }, 60000);

    startSession({
      telegramId,
      phoneNumber: number,
      notify,
      onPairingCode: async (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logger.info(`Pairing code delivered to Telegram user ${telegramId}`);
        resolve({ code, number });
      },
    }).catch((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function pairingMessage(code) {
  return (
    `🌑 *${config.botName}*\n\n` +
    'WhatsApp Pairing Code:\n\n' +
    `\`${code}\`\n\n` +
    'Open WhatsApp → Linked devices → Link with phone number, then enter this code.'
  );
}

module.exports = { pair, normalizeNumber, pairingMessage };
