'use strict';

const config = require('../../config/config');
const database = require('../database/database');

const START_TIME = Date.now();

function uptime(ms = Date.now() - START_TIME) {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function startTime() {
  return START_TIME;
}

function prefix() {
  return database.getSetting('prefix') || config.prefix;
}

function mode() {
  return (database.getSetting('mode') || config.mode).toUpperCase();
}

function header(title) {
  return `╭━━━〔 🌑 ${title} 〕━━━╮`;
}

function footer() {
  return '╰━━━━━━━━━━━━━━━━━━━━━━╯';
}

function panel(lines, title = config.botName) {
  const body = lines.map((line) => `┃ ${line}`).join('\n');
  return `${header(title)}\n┃\n${body}\n┃\n${footer()}`;
}

function box(title, items) {
  const body = items.map((item) => `│ • ${item}`).join('\n');
  return `╭━━〔 ${title} 〕━━╮\n${body}\n╰━━━━━━━━━━━━━━━━━━╯`;
}

function infoPanel(extraLines = []) {
  return panel(
    [
      `🐯 OWNER : ${config.ownerName}`,
      `👽 MODE  : ${mode()}`,
      `🌔 PREFIX: ${prefix()}`,
      `⏱ UPTIME: ${uptime()}`,
      '📡 STATUS: ONLINE',
      ...extraLines,
    ],
    config.botName,
  );
}

function error(message) {
  return `🥴 *SORRY*\n${message}`;
}

function success(message) {
  return `✅ ${message}`;
}

function warn(message) {
  return `⚠️ ${message}`;
}

function bytes(size) {
  if (!Number.isFinite(size)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

module.exports = {
  uptime,
  startTime,
  prefix,
  mode,
  header,
  footer,
  panel,
  box,
  infoPanel,
  error,
  success,
  warn,
  bytes,
};
