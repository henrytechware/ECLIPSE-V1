'use strict';

const config = require('../../config/config');
const logger = require('../utils/logger');
const database = require('../database/database');
const permissions = require('../utils/permissions');
const formatter = require('../utils/formatter');
const messages = require('../whatsapp/messages');
const commandHandler = require('./commandHandler');
const wcg = require('../games/wcg');

const LINK_REGEX = /(https?:\/\/|www\.)[^\s]+|chat\.whatsapp\.com\/[0-9A-Za-z]+/i;
const spamTracker = new Map(); // `${chat}:${sender}` -> timestamps

/**
 * Basic protection against malformed / abusive payloads (defensive only).
 */
function looksAbusive(content) {
  try {
    const text = messages.getText(content) || '';
    if (text.length > 15000) return true;
    // Very long runs of invisible/combining characters are the classic crash payload.
    if (/[\u0300-\u036F]{80,}/.test(text)) return true;
    if (/(\u200b|\u200e|\u200f|\u2063){500,}/.test(text)) return true;
    const raw = JSON.stringify(content || {});
    if (raw.length > 400000) return true;
    return false;
  } catch {
    return false;
  }
}

function buildReply(sock, message) {
  return async (payload, options = {}) => {
    const body = typeof payload === 'string' ? { text: payload } : payload;
    const sent = await sock.sendMessage(message.key.remoteJid, body, {
      quoted: message,
      ...options,
    });
    messages.rememberBotMessage(sent?.key?.id);
    return sent;
  };
}

function buildSend(sock, chat) {
  return async (payload, options = {}) => {
    const body = typeof payload === 'string' ? { text: payload } : payload;
    const sent = await sock.sendMessage(chat, body, options);
    messages.rememberBotMessage(sent?.key?.id);
    return sent;
  };
}

async function buildContext(sock, message, telegramId) {
  const chat = message.key.remoteJid;
  const content = messages.unwrap(message.message);
  const botJid = messages.botJidOf(sock);
  const isGroup = permissions.isGroupJid(chat);
  const fromMe = Boolean(message.key.fromMe);
  const botIds = permissions.botIdentities(sock, botJid);
  const senderIds = permissions.identityCandidates([
    message.key.participant,
    message.key.participantAlt,
    message.key.participantPn,
    message.key.senderLid,
    message.key.senderPn,
    message.participant,
    isGroup ? null : chat,
    fromMe ? botIds : [],
  ]);
  const sender = fromMe
    ? botJid
    : permissions.normalizeJid(isGroup ? message.key.participant || message.participant : chat);

  const ctx = {
    sock,
    telegramId,
    message,
    key: message.key,
    content,
    chat,
    isGroup,
    fromMe,
    sender,
    senderIds,
    botJid,
    botIds,
    pushName: message.pushName || 'User',
    text: messages.getText(content),
    type: messages.messageType(content),
    quoted: messages.getQuoted(content),
    mentions: messages.getMentions(content),
    isSenderAdmin: false,
    isBotAdmin: false,
    groupMetadata: null,
    reply: buildReply(sock, message),
    send: buildSend(sock, chat),
  };

  ctx.target = ctx.mentions[0] || ctx.quoted?.participant || null;

  if (isGroup) {
    try {
      const groupCtx = await permissions.groupContext(sock, chat, sender, botJid, senderIds);
      ctx.groupMetadata = groupCtx.metadata;
      ctx.admins = groupCtx.admins;
      ctx.isSenderAdmin = groupCtx.isSenderAdmin;
      ctx.isBotAdmin = groupCtx.isBotAdmin;
    } catch (error) {
      logger.warn('Group metadata fetch failed:', error.message);
      ctx.admins = [];
    }
  }


  return ctx;
}

/* ----------------------------- group guards ------------------------------ */

/**
 * Delete the offending message and apply the configured action
 * (warn / delete / kick). Returns nothing; every step is best-effort.
 */
async function enforceGuard(ctx, { mode = 'delete', reason, kickText, warnText }) {
  // Every mode deletes the message first (needs bot admin).
  if (ctx.isBotAdmin) {
    await ctx.sock.sendMessage(ctx.chat, { delete: ctx.key }).catch(() => {});
  }

  if (mode === 'kick') {
    let removed = false;
    if (ctx.isBotAdmin) {
      const candidates = [...new Set([ctx.sender, ...(ctx.senderIds || [])])].filter(Boolean);
      for (const jid of candidates) {
        try {
          const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, [jid], 'remove');
          if (!Array.isArray(result) || result.some((r) => String(r.status) === '200')) {
            removed = true;
            break;
          }
        } catch {
          /* try the next identity form */
        }
      }
      permissions.invalidateGroup(ctx.chat);
    }
    await ctx
      .send({
        text: formatter.warn(
          removed
            ? kickText.replace('{user}', `@${ctx.sender.split('@')[0]}`)
            : `I could not remove @${ctx.sender.split('@')[0]} (${reason}). Make sure I am a group admin.`,
        ),
        mentions: [ctx.sender],
      })
      .catch(() => {});
    return;
  }

  if (mode === 'warn') {
    await ctx
      .send({
        text: formatter.warn(warnText.replace('{user}', `@${ctx.sender.split('@')[0]}`)),
        mentions: [ctx.sender],
      })
      .catch(() => {});
  }
  // mode === 'delete' → silent removal only
}

async function runGroupGuards(ctx) {
  if (!ctx.isGroup) return false;
  const settings = database.getGroup(ctx.chat);
  const isPrivileged = ctx.isSenderAdmin || permissions.isOwner(ctx);

  // Record activity for .listinactive (before any guard can drop the message).
  if (!ctx.fromMe) database.recordActivity(ctx.chat, ctx.sender, Date.now());

  // Per-member mute: delete everything the muted member sends.
  if (!isPrivileged && !ctx.fromMe) {
    const muted = settings.mutedMembers || [];
    const isMuted = muted.includes(ctx.sender) || (ctx.senderIds || []).some((jid) => muted.includes(jid));
    if (isMuted) {
      if (ctx.isBotAdmin) await ctx.sock.sendMessage(ctx.chat, { delete: ctx.key }).catch(() => {});
      return true;
    }
  }

  // Anti-link
  if (settings.antilink && !isPrivileged && LINK_REGEX.test(ctx.text || '')) {
    await enforceGuard(ctx, {
      mode: settings.antilinkAction || 'delete',
      reason: 'anti-link',
      kickText: '{user} was removed for sending links. 🔗',
      warnText: '{user} links are not allowed here. Your message was deleted. ⚠️',
    });
    return true;
  }

  // Anti group mention (mass tagging)
  const mentionCount = (ctx.mentions || []).length;
  const groupMention = Boolean(
    ctx.content?.extendedTextMessage?.contextInfo?.groupMentions?.length ||
      ctx.content?.groupMentionedMessage,
  );
  if (settings.antigroupmention && !isPrivileged && (mentionCount >= 5 || groupMention)) {
    await enforceGuard(ctx, {
      mode: settings.antigroupmentionAction || 'delete',
      reason: 'anti group mention',
      kickText: '{user} was removed for mass-mentioning the group.🎙️',
      warnText: '{user} mass mentions are not allowed here. Your message was deleted. ⚠️',
    });
    return true;
  }


  // Anti spam
  if (settings.antispam && !isPrivileged) {
    const key = `${ctx.chat}:${ctx.sender}`;
    const now = Date.now();
    const hits = (spamTracker.get(key) || []).filter((t) => now - t < 8000);
    hits.push(now);
    spamTracker.set(key, hits);
    if (hits.length > 8) {
      if (ctx.isBotAdmin) await ctx.sock.sendMessage(ctx.chat, { delete: ctx.key }).catch(() => {});
      return true;
    }
  }

  // Anti bot (blocks messages sent by other bots / linked devices with bot ids)
  if (settings.antibot && !ctx.fromMe && !isPrivileged) {
    const id = ctx.key.id || '';
    const looksLikeBot = id.startsWith('BAE5') || id.startsWith('3EB0') || id.length === 32;
    if (looksLikeBot && ctx.isBotAdmin) {
      await ctx.sock.sendMessage(ctx.chat, { delete: ctx.key }).catch(() => {});
      return true;
    }
  }

  // Scheduled open/close
  await applySchedule(ctx, settings).catch(() => {});

  return false;
}

async function applySchedule(ctx, settings) {
  if (!ctx.isBotAdmin) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (settings.closeTime && settings.closeTime === hhmm) {
    await ctx.sock.groupSettingUpdate(ctx.chat, 'announcement');
    database.setGroup(ctx.chat, { closeTime: settings.closeTime });
    await ctx.send('🔐 Group closed automatically.');
  }
  if (settings.openTime && settings.openTime === hhmm) {
    await ctx.sock.groupSettingUpdate(ctx.chat, 'not_announcement');
    await ctx.send('🔓 Group opened automatically.');
  }
}

/* ------------------------------ user presence ----------------------------- */

async function applyUserPresence(ctx) {
  const settings = database.getUser(ctx.botJid);
  try {
    if (settings.autoTyping) await ctx.sock.sendPresenceUpdate('composing', ctx.chat);
    else if (settings.autoRecording) await ctx.sock.sendPresenceUpdate('recording', ctx.chat);
  } catch {
    /* presence is best-effort */
  }
}

/* ------------------------------ main handler ------------------------------ */

async function handleMessages(sock, upsert, telegramId) {
  if (upsert.type !== 'notify' && upsert.type !== 'append') return;

  for (const message of upsert.messages || []) {
    try {
      if (!message.message) continue;
      const chat = message.key?.remoteJid;
      if (!chat) continue;

      // Status broadcasts: optional auto-view, never command processing.
      if (chat === 'status@broadcast') {
        const botJid = messages.botJidOf(sock);
        if (database.getUser(botJid).autoViewStatus) {
          await sock.readMessages([message.key]).catch(() => {});
        }
        continue;
      }

      // Loop prevention: skip messages this bot generated itself.
      if (messages.isBotGenerated(message.key.id)) continue;

      const content = messages.unwrap(message.message);
      if (content.protocolMessage || content.reactionMessage || content.senderKeyDistributionMessage) {
        continue;
      }

      // Defensive antibug filter.
      if (looksAbusive(content)) {
        logger.warn(`Dropped a suspicious payload from ${chat}`);
        continue;
      }

      const ctx = await buildContext(sock, message, telegramId);

      if (await runGroupGuards(ctx)) continue;

      if (!ctx.text || !ctx.text.trim()) continue;

      await applyUserPresence(ctx);
      const handled = await commandHandler.execute(ctx);
      if (!handled) await wcg.handleMessage(ctx).catch(() => {});
    } catch (error) {
      logger.error('Message handling error:', error.message);
    }
  }
}


/* --------------------------- welcome / goodbye ---------------------------- */

async function handleGroupParticipantsUpdate(sock, update) {
  const { id, participants, action } = update;
  const settings = database.getGroup(id);
  if (action === 'add' && !settings.welcome) return;
  if (action === 'remove' && !settings.goodbye) return;
  if (!['add', 'remove'].includes(action)) return;

  permissions.invalidateGroup(id);
  let metadata;
  try {
    metadata = await sock.groupMetadata(id);
  } catch (error) {
    logger.warn('Cannot read group metadata for welcome/goodbye:', error.message);
    return;
  }

  for (const participant of participants) {
    const tag = `@${participant.split('@')[0]}`;
    const template =
      action === 'add'
        ? settings.welcomeText || '👐 Welcome {user} to {group}!\nYou are member #{count}.'
        : settings.goodbyeText || '💩 {user} left {group}. We are now {count} members.';

    const text = template
      .replace(/\{user\}/g, tag)
      .replace(/\{group\}/g, metadata.subject)
      .replace(/\{count\}/g, String(metadata.participants.length));

    const sent = await sock
      .sendMessage(id, { text: `${formatter.header(config.botName)}\n┃ ${text}\n${formatter.footer()}`, mentions: [participant] })
      .catch(() => null);
    messages.rememberBotMessage(sent?.key?.id);
  }
}

module.exports = { handleMessages, handleGroupParticipantsUpdate, buildContext };
