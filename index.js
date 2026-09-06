'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Drop any .js file exporting a command object (or an array of them)
 * into src/plugins/ and it is registered automatically at startup.
 */
function load() {
  const dir = __dirname;
  const found = [];
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

  for (const entry of entries) {
    if (entry === 'index.js' || !entry.endsWith('.js')) continue;
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const loaded = require(path.join(dir, entry));
      const list = Array.isArray(loaded) ? loaded : [loaded];
      for (const command of list) {
        if (command && command.name && typeof command.handler === 'function') found.push(command);
      }
      logger.info(`Plugin loaded: ${entry}`);
    } catch (error) {
      logger.error(`Plugin ${entry} failed to load:`, error.message);
    }
  }
  return found;
}

module.exports = { load };
