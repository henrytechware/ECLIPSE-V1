'use strict';

const database = require('../database/database');
const logger = require('./logger');

const metadataCache = new Map();
const CACHE_TTL = 60 * 1000;

function normalizeJid(jid) {
  if (!jid) return '';
  const [user] = String(jid).split(':');
  if (user.includes('@')) return user;
  return `${user}@s.whatsapp.net`;
}

/**
 * The bare user part of any WhatsApp identifier (phone number or LID),
 * with device / server suffixes removed.
 */
function userPart(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].split('/')[0].replace(/\D/g, '') || String(jid).split('@')[0];
}

/**
 * Every identifier a participant entry can expose. Modern WhatsApp groups
 * can report LID identities (`123@lid`) instead of phone JIDs, which is why
 * a single equality check is never enough.
 */
function participantIds(participant) {
  if (!participant) return [];
  const raw = [
    participant.id,
    participant.jid,
    participant.lid,
    participant.pn,
    participant.phoneNumber,
    participant.phone_number,
  ].filter(Boolean);
  return raw.map(userPart).filter(Boolean);
}

function identityCandidates(...values) {
  const out = new Set();
  for (const value of values.flat()) {
    const id = userPart(value);
    if (id) out.add(id);
  }
  return [...out];
}

function botIdentities(sock, botJid) {
  return identityCandidates([
    botJid,
    sock?.user?.id,
    sock?.user?.lid,
    sock?.user?.jid,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.lid,
  ]);
}

async function getGroupMetadata(sock, groupJid, force = false) {
  const cached = metadataCache.get(groupJid);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
  const data = await sock.groupMetadata(groupJid);
  metadataCache.set(groupJid, { at: Date.now(), data });
  return data;
}

function invalidateGroup(groupJid) {
  metadataCache.delete(groupJid);
}

function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

function isAdminEntry(participant) {
  return participant?.admin === 'admin' || participant?.admin === 'superadmin' || participant?.isAdmin || participant?.isSuperAdmin;
}

function adminsOf(metadata) {
  return (metadata?.participants || []).filter(isAdminEntry).map((p) => normalizeJid(p.id));
}

/**
 * A set of every identifier (phone + LID) belonging to a group admin.
 */
function adminIdSet(metadata) {
  const set = new Set();
  for (const participant of metadata?.participants || []) {
    if (!isAdminEntry(participant)) continue;
    for (const id of participantIds(participant)) set.add(id);
  }
  return set;
}

function matchesAdmin(metadata, candidates) {
  const admins = adminIdSet(metadata);
  return candidates.some((id) => admins.has(id));
}

async function groupContext(sock, groupJid, senderJid, botJid, extraSenderIds = []) {
  let metadata = await getGroupMetadata(sock, groupJid);
  const admins = adminsOf(metadata);
  const senderIds = identityCandidates([senderJid, ...extraSenderIds]);
  const botIds = botIdentities(sock, botJid);

  let isSenderAdmin = matchesAdmin(metadata, senderIds);
  let isBotAdmin = matchesAdmin(metadata, botIds);

  // The cached metadata can be stale right after a promotion — refresh once
  // before telling anyone that the bot is not an admin.
  if (!isBotAdmin) {
    try {
      metadata = await getGroupMetadata(sock, groupJid, true);
      isSenderAdmin = matchesAdmin(metadata, senderIds);
      isBotAdmin = matchesAdmin(metadata, botIds);
    } catch (error) {
      logger.debug('Group metadata refresh failed:', error.message);
    }
  }

  return {
    metadata,
    admins,
    isSenderAdmin,
    isBotAdmin,
  };
}

function isOwner(ctx) {
  // The paired WhatsApp account itself is the owner of its session.
  if (ctx.fromMe) return true;
  const bot = identityCandidates([ctx.botJid, ctx.botIds || []]);
  const sender = identityCandidates([ctx.sender, ctx.senderIds || []]);
  return sender.some((id) => bot.includes(id));
}

function isSudo(ctx) {
  return isOwner(ctx) || database.isSudo(normalizeJid(ctx.sender));
}

/**
 * Returns null when allowed, or a string reason when denied.
 */
async function check(command, ctx) {
  const permission = command.permission || 'user';

  if (database.isBanned(normalizeJid(ctx.sender)) && !isOwner(ctx)) {
    return 'You are banned from using this bot.';
  }

  if (command.groupOnly && !ctx.isGroup) {
    return 'This command only works inside a group.';
  }

  if (command.privateOnly && ctx.isGroup) {
    return 'This command only works in private chat.';
  }

  if (permission === 'owner' && !isOwner(ctx)) {
    return 'Owner only command.';
  }

  if (permission === 'sudo' && !isSudo(ctx)) {
    return 'Sudo or owner only command.';
  }

  if (permission === 'admin') {
    if (!ctx.isGroup) return 'This command only works inside a group.';
    if (!isOwner(ctx) && !isSudo(ctx) && !ctx.isSenderAdmin) return 'Group admins only.';
  }

  if (command.requireBotAdmin) {
    if (!ctx.isGroup) return 'This command only works inside a group.';
    if (!ctx.isBotAdmin) return 'I need to be a group admin to do that.';
  }

  const mode = (database.getSetting('mode') || 'public').toLowerCase();
  if (mode === 'private' && !isSudo(ctx)) {
    logger.debug('Blocked command in private mode from', ctx.sender);
    return 'Bot is in private mode.';
  }

  return null;
}

module.exports = {
  normalizeJid,
  userPart,
  participantIds,
  identityCandidates,
  botIdentities,
  getGroupMetadata,
  invalidateGroup,
  isGroupJid,
  adminsOf,
  adminIdSet,
  matchesAdmin,
  groupContext,
  isOwner,
  isSudo,
  check,
};
