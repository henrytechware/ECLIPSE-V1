'use strict';

const config = require('../../config/config');
const logger = require('./../utils/logger');

const reacted = new Set();

const CLEAR_AFTER_MS = 5000;

/**
 * React exactly once to a given message key, then remove the reaction
 * automatically after 5 seconds.
 */
async function reactToCommand(sock, message, emoji = config.reaction) {
  try {
    const key = message?.key;
    if (!key || !key.id) return false;
    if (reacted.has(key.id)) return false;
    reacted.add(key.id);
    if (reacted.size > 500) {
      const first = reacted.values().next().value;
      reacted.delete(first);
    }
    await sock.sendMessage(key.remoteJid, { react: { text: emoji, key } });

    // Sending an empty reaction removes it again.
    const timer = setTimeout(() => {
      sock
        .sendMessage(key.remoteJid, { react: { text: '', key } })
        .catch((error) => logger.debug('Reaction cleanup failed:', error.message));
    }, CLEAR_AFTER_MS);
    timer.unref?.();

    return true;
  } catch (error) {
    logger.warn('Reaction failed:', error.message);
    return false;
  }
}

/**
 * Handles incoming reaction events (used by interactive features).
 */
async function handleReaction(sock, reaction) {
  try {
    const text = reaction?.reaction?.text;
    if (!text) return;
    logger.debug(`Reaction ${text} on ${reaction.key?.id}`);
  } catch (error) {
    logger.warn('Reaction handler error:', error.message);
  }
}

module.exports = { reactToCommand, handleReaction, CLEAR_AFTER_MS };
