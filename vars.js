'use strict';

const database = require('../database/database');
const formatter = require('../utils/formatter');
const permissions = require('../utils/permissions');

function targetJid(ctx) {
  if (ctx.mentions[0]) return ctx.mentions[0];
  if (ctx.quoted?.participant) return ctx.quoted.participant;
  const number = (ctx.argText || '').match(/\d{8,15}/);
  return number ? `${number[0]}@s.whatsapp.net` : null;
}

module.exports = [
  {
    name: 'setsudo',
    aliases: ['addsudo'],
    category: 'vars',
    permission: 'owner',
    description: 'Grant sudo privileges to a user',
    usage: '.setsudo @user',
    handler: async (ctx) => {
      const jid = permissions.normalizeJid(targetJid(ctx) || '');
      if (!jid) return ctx.reply(formatter.error('Mention a user or provide a number.'));
      const added = database.addSudo(jid);
      return ctx.reply(
        added ? formatter.success(`@${jid.split('@')[0]} is now a sudo user.`) : formatter.warn('That user is already sudo.'),
        { mentions: [jid] },
      );
    },
  },
  {
    name: 'delsudo',
    aliases: ['removesudo'],
    category: 'vars',
    permission: 'owner',
    description: 'Revoke sudo privileges',
    usage: '.delsudo @user',
    handler: async (ctx) => {
      const jid = permissions.normalizeJid(targetJid(ctx) || '');
      if (!jid) return ctx.reply(formatter.error('Mention a user or provide a number.'));
      const removed = database.removeSudo(jid);
      return ctx.reply(removed ? formatter.success('Sudo privileges revoked.') : formatter.warn('That user is not sudo.'));
    },
  },
  {
    name: 'getsudo',
    aliases: ['listsudo'],
    category: 'vars',
    permission: 'sudo',
    description: 'List sudo users',
    usage: '.getsudo',
    handler: async (ctx) => {
      const list = database.listSudo();
      if (!list.length) return ctx.reply(formatter.warn('No sudo users configured.'));
      return ctx.send({
        text: formatter.panel(list.map((jid) => `🥷 @${jid.split('@')[0]}`), 'SUDO USERS'),
        mentions: list,
      });
    },
  },
  {
    name: 'stats',
    aliases: ['usage'],
    category: 'vars',
    permission: 'sudo',
    description: 'Show command usage statistics',
    usage: '.stats',
    handler: async (ctx) => {
      const stats = database.getStats();
      const entries = Object.entries(stats)
        .filter(([key]) => key !== '_total')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name, count]) => `${name}: ${count}`);
      return ctx.reply(
        formatter.panel([`📊 TOTAL: ${stats._total || 0}`, ...(entries.length ? entries : ['no commands used yet'])], 'STATS'),
      );
    },
  },
];
