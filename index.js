'use strict';

const logger = require('../utils/logger');

const MODULES = [
  './misc',
  './group',
  './fun',
  './download',
  './user',
  './sticker',
  './vars',
  './textmaker',
  './video',
  './other',
];

const commands = new Map(); // name -> command
const aliases = new Map();  // alias -> name

function register(command) {
  if (!command || !command.name || typeof command.handler !== 'function') {
    throw new Error(`Invalid command definition: ${JSON.stringify(command?.name || command)}`);
  }
  if (commands.has(command.name) || aliases.has(command.name)) {
    throw new Error(`Duplicate command name: ${command.name}`);
  }
  commands.set(command.name, {
    category: 'misc',
    permission: 'user',
    description: '',
    usage: `.${command.name}`,
    aliases: [],
    ...command,
  });
  for (const alias of command.aliases || []) {
    if (commands.has(alias) || aliases.has(alias)) {
      throw new Error(`Duplicate command alias: ${alias}`);
    }
    aliases.set(alias, command.name);
  }
}

function load() {
  if (commands.size) return;
  for (const modulePath of MODULES) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const list = require(modulePath);
    for (const command of list) register(command);
  }
  // Optional user plugins.
  try {
    // eslint-disable-next-line global-require
    const plugins = require('../plugins');
    for (const command of plugins.load()) register(command);
  } catch (error) {
    logger.warn('Plugin loading skipped:', error.message);
  }
  logger.info(`Command registry loaded: ${commands.size} commands`);
}

function find(name) {
  load();
  const key = String(name || '').toLowerCase();
  if (commands.has(key)) return commands.get(key);
  if (aliases.has(key)) return commands.get(aliases.get(key));
  return null;
}

function all() {
  load();
  return [...commands.values()];
}

function byCategory(category) {
  return all().filter((command) => command.category === category);
}

function categories() {
  return [...new Set(all().map((command) => command.category))];
}

module.exports = { register, load, find, all, byCategory, categories };
