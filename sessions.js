'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const config = require('../../config/config');
const logger = require('../utils/logger');

/**
 * Live socket registry: telegramId -> { sock, saveCreds, status, number, jid }
 */
const live = new Map();

function sessionDir(telegramId) {
  const safe = String(telegramId).replace(/[^0-9a-zA-Z_-]/g, '');
  if (!safe) throw new Error('Invalid session id.');
  return path.join(config.paths.sessions, safe);
}

function ensureSessionDir(telegramId) {
  const dir = sessionDir(telegramId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hasSession(telegramId) {
  const dir = sessionDir(telegramId);
  return fs.existsSync(path.join(dir, 'creds.json'));
}

function listStoredSessions() {
  try {
    if (!fs.existsSync(config.paths.sessions)) return [];
    return fs
      .readdirSync(config.paths.sessions, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => fs.existsSync(path.join(config.paths.sessions, name, 'creds.json')));
  } catch (error) {
    logger.error('Failed to list sessions:', error.message);
    return [];
  }
}

async function removeSessionFiles(telegramId) {
  const dir = sessionDir(telegramId);
  await fsp.rm(dir, { recursive: true, force: true });
  logger.info(`Session files removed for ${telegramId}`);
}

function get(telegramId) {
  return live.get(String(telegramId)) || null;
}

function set(telegramId, value) {
  live.set(String(telegramId), value);
  return value;
}

function remove(telegramId) {
  live.delete(String(telegramId));
}

function all() {
  return [...live.entries()].map(([telegramId, value]) => ({ telegramId, ...value }));
}

module.exports = {
  sessionDir,
  ensureSessionDir,
  hasSession,
  listStoredSessions,
  removeSessionFiles,
  get,
  set,
  remove,
  all,
};
