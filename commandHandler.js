'use strict';

const config = require('../../config/config');
const logger = require('../utils/logger');
const database = require('../database/database');
const registry = require('../commands');
const permissions = require('../utils/permissions');
const formatter = require('../utils/formatter');
const { reactToCommand } = require('./reactionHandler');

/* ------------------------------ rate limiting ----------------------------- */

const buckets = new Map(); // jid -> { hits: number[], blockedUntil: number, notified: boolean }

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < config.rateLimit.windowMs);
    if (!bucket.hits.length && (!bucket.blockedUntil || bucket.blockedUntil < now)) {
      buckets.delete(key);
    }
  }
}, 30000).unref?.();

function rateLimit(key) {
  const now = Date.now();
  const bucket = buckets.get(key) || { hits: [], blockedUntil: 0, notified: false };
  buckets.set(key, bucket);

  if (bucket.blockedUntil > now) {
    const shouldNotify = !bucket.notified;
    bucket.notified = true;
    return { blocked: true, notify: shouldNotify };
  }

  bucket.hits = bucket.hits.filter((t) => now - t < config.rateLimit.windowMs);
  bucket.hits.push(now);

  if (bucket.hits.length > config.rateLimit.maxCommands) {
    bucket.blockedUntil = now + config.rateLimit.cooldownMs;
    bucket.notified = true;
    return { blocked: true, notify: true };
  }

  bucket.notified = false;
  return { blocked: false, notify: false };
}

/* -------------------------------- parsing -------------------------------- */

function parse(text) {
  const prefix = formatter.prefix();
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith(prefix)) return null;
  const withoutPrefix = trimmed.slice(prefix.length).trim();
  if (!withoutPrefix) return null;
  const parts = withoutPrefix.split(/\s+/);
  const name = parts.shift().toLowerCase();
  return {
    name,
    args: parts,
    argText: withoutPrefix.slice(name.length).trim(),
    prefix,
  };
}

/* ------------------------------- execution -------------------------------- */

async function execute(ctx) {
  const parsed = parse(ctx.text);
  if (!parsed) return false;

  const command = registry.find(parsed.name);
  if (!command) return false;

  ctx.command = command;
  ctx.args = parsed.args;
  ctx.argText = parsed.argText;
  ctx.prefix = parsed.prefix;

  const limit = rateLimit(ctx.sender || ctx.chat);
  if (limit.blocked) {
    if (limit.notify) {
      await ctx.reply(formatter.warn('Slow down — you are sending commands too fast.')).catch(() => {});
    }
    return true;
  }

  if (ctx.isGroup) {
    const group = database.getGroup(ctx.chat);
    if (group.mute && !ctx.isSenderAdmin && !permissions.isOwner(ctx)) return true;
  }

  const denial = await permissions.check(command, ctx);
  if (denial) {
    await reactToCommand(ctx.sock, ctx.message, '⏳').catch(() => {});
    await ctx.reply(formatter.error(denial)).catch(() => {});
    return true;
  }

  await reactToCommand(ctx.sock, ctx.message, command.reaction || config.reaction);

  try {
    logger.command(`${parsed.prefix}${command.name} by ${ctx.sender} in ${ctx.chat}`);
    database.countCommand(command.name);
    await command.handler(ctx);
  } catch (error) {
    logger.error(`Command ${command.name} failed:`, error.message);
    await ctx
      .reply(formatter.error(error.message || 'Something went wrong while running that command.'))
      .catch(() => {});
  }

  return true;
}

module.exports = { execute, parse };
