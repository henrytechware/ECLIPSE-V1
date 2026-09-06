'use strict';

const database = require('../database/database');
const formatter = require('../utils/formatter');
const permissions = require('../utils/permissions');

function targetsOf(ctx) {
  const targets = [...ctx.mentions];
  if (ctx.quoted?.participant) targets.push(ctx.quoted.participant);
  const rawNumbers = (ctx.argText || '').match(/\d{8,15}/g) || [];
  for (const number of rawNumbers) targets.push(`${number}@s.whatsapp.net`);
  return [...new Set(targets)];
}

function onOffArg(ctx) {
  const value = (ctx.args[0] || '').toLowerCase();
  if (['on', 'enable', 'true'].includes(value)) return true;
  if (['off', 'disable', 'false'].includes(value)) return false;
  return null;
}

function toggleCommand({ name, field, label, extra }) {
  return {
    name,
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: `Toggle ${label}`,
    usage: `.${name} on|off`,
    handler: async (ctx) => {
      const value = onOffArg(ctx);
      if (value === null) {
        const current = database.getGroup(ctx.chat)[field];
        return ctx.reply(formatter.warn(`${label} is currently *${current ? 'ON' : 'OFF'}*.\nUsage: ${ctx.prefix}${name} on|off`));
      }
      database.setGroup(ctx.chat, { [field]: value, ...(extra ? extra(ctx, value) : {}) });
      return ctx.reply(formatter.success(`${label} is now *${value ? 'ON' : 'OFF'}*.`));
    },
  };
}

const GUARD_MODES = ['warn', 'delete', 'kick'];

/**
 * Guard command supporting:
 *   .antilink on|off
 *   .antilink warn on   → enable with the "warn" action
 *   .antilink kick on   → enable with the "kick" action
 *   .antilink action kick
 */
function guardCommand({ name, field, actionField, label }) {
  return {
    name,
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: `Toggle ${label} and choose its action`,
    usage: `.${name} on|off | .${name} warn|delete|kick on`,
    handler: async (ctx) => {
      const first = (ctx.args[0] || '').toLowerCase();
      const second = (ctx.args[1] || '').toLowerCase();
      const group = database.getGroup(ctx.chat);

      // .antilink warn on / .antilink kick off / .antilink action kick
      if (GUARD_MODES.includes(first) || first === 'action') {
        const mode = first === 'action' ? second : first;
        if (!GUARD_MODES.includes(mode)) {
          return ctx.reply(formatter.error('Mode must be warn, delete or kick.'));
        }
        let enabled = true;
        if (first !== 'action') {
          if (['off', 'disable', 'false'].includes(second)) enabled = false;
          else if (second && !['on', 'enable', 'true'].includes(second)) {
            return ctx.reply(formatter.error(`Usage: ${ctx.prefix}${name} ${mode} on|off`));
          }
        }
        database.setGroup(ctx.chat, { [actionField]: mode, [field]: enabled });
        return ctx.reply(
          formatter.success(
            `${label} is now *${enabled ? 'ON' : 'OFF'}* with action *${mode}*.\n` +
              (mode === 'warn'
                ? '• Offending message is deleted and the member is warned.'
                : mode === 'delete'
                  ? '• Offending message is deleted silently.'
                  : '• Offending message is deleted and the member is removed.'),
          ),
        );
      }

      const value = onOffArg(ctx);
      if (value === null) {
        return ctx.reply(
          formatter.panel(
            [
              `STATE : ${group[field] ? 'ON' : 'OFF'}`,
              `ACTION: ${group[actionField] || 'delete'}`,
              `USAGE : ${ctx.prefix}${name} warn|delete|kick on`,
            ],
            label.toUpperCase(),
          ),
        );
      }
      database.setGroup(ctx.chat, { [field]: value });
      return ctx.reply(
        formatter.success(`${label} is now *${value ? 'ON' : 'OFF'}* (action: ${group[actionField] || 'delete'}).`),
      );
    },
  };
}

module.exports = [
  {
    name: 'kick',
    aliases: ['remove'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Remove a member from the group',
    usage: '.kick @user',
    handler: async (ctx) => {
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(formatter.error('Mention or reply to the user you want to remove.'));
      if (targets.includes(ctx.botJid)) return ctx.reply(formatter.error('I cannot remove myself.'));
      await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'remove');
      permissions.invalidateGroup(ctx.chat);

      // Also delete the message that was replied to (the kicked member's message).
      if (ctx.quoted?.stanzaId) {
        await ctx.sock
          .sendMessage(ctx.chat, {
            delete: {
              remoteJid: ctx.chat,
              fromMe: ctx.quoted.participant === ctx.botJid,
              id: ctx.quoted.stanzaId,
              participant: ctx.quoted.participant,
            },
          })
          .catch(() => {});
      }
      return ctx.reply(formatter.success(`Removed ${targets.length} member(s).`));
    },
  },
  {
    name: 'add',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Add a member to the group',
    usage: '.add 2348012345678',
    handler: async (ctx) => {
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(formatter.error('Provide a number in international format.'));
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'add');
      permissions.invalidateGroup(ctx.chat);
      const lines = result.map((r) => `${r.jid.split('@')[0]} → ${r.status === '200' ? 'added' : `failed (${r.status})`}`);
      return ctx.reply(formatter.panel(lines, 'ADD'));
    },
  },
  {
    name: 'promote',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Promote a member to admin',
    usage: '.promote @user',
    handler: async (ctx) => {
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(formatter.error('Mention or reply to the user to promote.'));
      await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'promote');
      permissions.invalidateGroup(ctx.chat);
      return ctx.reply(formatter.success('Promoted successfully.'));
    },
  },
  {
    name: 'demote',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Demote an admin',
    usage: '.demote @user',
    handler: async (ctx) => {
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(formatter.error('Mention or reply to the admin to demote.'));
      await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'demote');
      permissions.invalidateGroup(ctx.chat);
      return ctx.reply(formatter.success('Demoted successfully.'));
    },
  },
  {
    name: 'tagall',
    aliases: ['everyone'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Mention every group member',
    usage: '.tagall [message]',
    handler: async (ctx) => {
      const metadata = ctx.groupMetadata || (await permissions.getGroupMetadata(ctx.sock, ctx.chat));
      const members = metadata.participants.map((p) => permissions.normalizeJid(p.id));
      const note = ctx.argText || 'Attention everyone';
      const body = members.map((jid) => `│ • @${jid.split('@')[0]}`).join('\n');
      const text = `${formatter.header('TAG ALL')}\n┃ 📢 ${note}\n┃ 🧑‍💻 ${members.length} members\n${formatter.footer()}\n\n${body}`;
      return ctx.send({ text, mentions: members });
    },
  },
  {
    name: 'hidetag',
    aliases: ['htag'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Send a message that silently tags everyone',
    usage: '.hidetag <message>',
    handler: async (ctx) => {
      const metadata = ctx.groupMetadata || (await permissions.getGroupMetadata(ctx.sock, ctx.chat));
      const members = metadata.participants.map((p) => permissions.normalizeJid(p.id));
      return ctx.send({ text: ctx.argText || '📢', mentions: members });
    },
  },
  {
    name: 'tag',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Tag specific members',
    usage: '.tag @user1 @user2 <message>',
    handler: async (ctx) => {
      const targets = targetsOf(ctx);
      if (!targets.length) return ctx.reply(formatter.error('Mention at least one user.'));
      const note = ctx.argText.replace(/@\d+/g, '').trim() || '📢';
      return ctx.send({
        text: `${note}\n${targets.map((jid) => `@${jid.split('@')[0]}`).join(' ')}`,
        mentions: targets,
      });
    },
  },
  {
    name: 'tagadmin',
    aliases: ['admins'],
    category: 'group',
    permission: 'user',
    groupOnly: true,
    description: 'Tag all group admins',
    usage: '.tagadmin',
    handler: async (ctx) => {
      const metadata = ctx.groupMetadata || (await permissions.getGroupMetadata(ctx.sock, ctx.chat));
      const admins = permissions.adminsOf(metadata);
      if (!admins.length) return ctx.reply(formatter.warn('No admins found.'));
      return ctx.send({
        text: `${formatter.header('ADMINS')}\n┃ ${admins.map((jid) => `@${jid.split('@')[0]}`).join('\n┃ ')}\n${formatter.footer()}`,
        mentions: admins,
      });
    },
  },
  {
    name: 'kickall',
    aliases: [],
    category: 'group',
    permission: 'owner',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Remove all non-admin members (owner only)',
    usage: '.kickall confirm',
    handler: async (ctx) => {
      if ((ctx.args[0] || '').toLowerCase() !== 'confirm') {
        return ctx.reply(formatter.warn(`This removes every non-admin member.\nRun \`${ctx.prefix}kickall confirm\` to proceed.`));
      }
      const metadata = ctx.groupMetadata || (await permissions.getGroupMetadata(ctx.sock, ctx.chat));
      const admins = permissions.adminsOf(metadata);
      const targets = metadata.participants
        .map((p) => permissions.normalizeJid(p.id))
        .filter((jid) => !admins.includes(jid) && jid !== ctx.botJid);
      if (!targets.length) return ctx.reply(formatter.warn('There is nobody to remove.'));

      let removed = 0;
      for (const jid of targets) {
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.chat, [jid], 'remove');
          removed += 1;
          await new Promise((resolve) => setTimeout(resolve, 800));
        } catch {
          /* keep going */
        }
      }
      permissions.invalidateGroup(ctx.chat);
      return ctx.reply(formatter.success(`Removed ${removed}/${targets.length} members.`));
    },
  },
  {
    name: 'groupinfo',
    aliases: ['ginfo'],
    category: 'group',
    permission: 'user',
    groupOnly: true,
    description: 'Show information about this group',
    usage: '.groupinfo',
    handler: async (ctx) => {
      const metadata = ctx.groupMetadata || (await permissions.getGroupMetadata(ctx.sock, ctx.chat));
      const admins = permissions.adminsOf(metadata);
      const settings = database.getGroup(ctx.chat);
      const created = metadata.creation ? new Date(metadata.creation * 1000).toISOString().slice(0, 16).replace('T', ' ') : 'unknown';
      const text = formatter.panel(
        [
          `🏷 NAME    : ${metadata.subject}`,
          `🆔 JID     : ${metadata.id}`,
          `👫 MEMBERS : ${metadata.participants.length}`,
          `🤺 ADMINS  : ${admins.length}`,
          `📅 CREATED : ${created}`,
          `🔒 LOCKED  : ${metadata.announce ? 'yes' : 'no'}`,
          `👾 BOT ADM : ${ctx.isBotAdmin ? 'yes' : 'no'}`,
          `🛡 ANTILINK: ${settings.antilink ? 'on' : 'off'}`,
          `🧹 ANTISPAM: ${settings.antispam ? 'on' : 'off'}`,
          `👐 WELCOME : ${settings.welcome ? 'on' : 'off'}`,
        ],
        'GROUP INFO',
      );
      const description = metadata.desc ? `\n\n📝 ${String(metadata.desc).slice(0, 500)}` : '';
      return ctx.reply(`${text}${description}`);
    },
  },
  {
    name: 'getpp',
    aliases: ['grouppp'],
    category: 'group',
    permission: 'user',
    description: 'Get the profile picture of the group or a user',
    usage: '.getpp [@user]',
    handler: async (ctx) => {
      const target = ctx.mentions[0] || ctx.quoted?.participant || (ctx.isGroup ? ctx.chat : ctx.sender);
      try {
        const url = await ctx.sock.profilePictureUrl(target, 'image');
        return ctx.reply({ image: { url }, caption: `🌁 Profile picture of ${target.split('@')[0]}` });
      } catch {
        return ctx.reply(formatter.warn('No profile picture available (or it is private).'));
      }
    },
  },
  {
    name: 'resetlink',
    aliases: ['revoke'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Reset the group invite link',
    usage: '.resetlink',
    handler: async (ctx) => {
      await ctx.sock.groupRevokeInvite(ctx.chat);
      const code = await ctx.sock.groupInviteCode(ctx.chat);
      return ctx.reply(formatter.success(`Invite link reset:\nhttps://chat.whatsapp.com/${code}`));
    },
  },
  {
    name: 'mute',
    aliases: ['close'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Mute a member (their messages get deleted) or close the group',
    usage: '.mute @user | .mute (closes the group)',
    handler: async (ctx) => {
      const targets = targetsOf(ctx).map((jid) => permissions.normalizeJid(jid));
      if (targets.length) {
        const muted = [];
        for (const jid of targets) {
          if (jid === ctx.botJid) continue;
          if (database.muteMember(ctx.chat, jid)) muted.push(jid);
        }
        if (!muted.length) return ctx.reply(formatter.warn('Those members are already muted.'));
        return ctx.send({
          text: formatter.success(
            `🔇 Muted ${muted.map((jid) => `@${jid.split('@')[0]}`).join(', ')}.\nTheir messages will be deleted until you run ${ctx.prefix}unmute.`,
          ),
          mentions: muted,
        });
      }
      await ctx.sock.groupSettingUpdate(ctx.chat, 'announcement');
      database.setGroup(ctx.chat, { mute: true });
      return ctx.reply(formatter.success('Group closed. Only admins can send messages.'));
    },
  },
  {
    name: 'unmute',
    aliases: ['open'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    requireBotAdmin: true,
    description: 'Unmute a member or open the group',
    usage: '.unmute @user | .unmute (opens the group)',
    handler: async (ctx) => {
      const targets = targetsOf(ctx).map((jid) => permissions.normalizeJid(jid));
      if (targets.length) {
        const freed = targets.filter((jid) => database.unmuteMember(ctx.chat, jid));
        if (!freed.length) return ctx.reply(formatter.warn('Those members are not muted.'));
        return ctx.send({
          text: formatter.success(`🔊 Unmuted ${freed.map((jid) => `@${jid.split('@')[0]}`).join(', ')}.`),
          mentions: freed,
        });
      }
      await ctx.sock.groupSettingUpdate(ctx.chat, 'not_announcement');
      database.setGroup(ctx.chat, { mute: false });
      return ctx.reply(formatter.success('Group opened. Everyone can send messages.'));
    },
  },
  {
    name: 'mutelist',
    aliases: ['muted'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'List members muted by the bot',
    usage: '.mutelist',
    handler: async (ctx) => {
      const list = database.listMutedMembers(ctx.chat);
      if (!list.length) return ctx.reply(formatter.warn('No member is muted in this group.'));
      return ctx.send({
        text: `${formatter.header('MUTED MEMBERS')}\n┃ ${list.map((jid) => `@${jid.split('@')[0]}`).join('\n┃ ')}\n${formatter.footer()}`,
        mentions: list,
      });
    },
  },
  {
    name: 'closetime',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Schedule an automatic group close time (HH:MM)',
    usage: '.closetime 22:00 | .closetime off',
    handler: async (ctx) => {
      const value = (ctx.args[0] || '').trim();
      if (value.toLowerCase() === 'off') {
        database.setGroup(ctx.chat, { closeTime: null });
        return ctx.reply(formatter.success('Automatic closing disabled.'));
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        return ctx.reply(formatter.error('Use 24h format, e.g. `.closetime 22:00`'));
      }
      database.setGroup(ctx.chat, { closeTime: value });
      return ctx.reply(formatter.success(`Group will close automatically at ${value}.`));
    },
  },
  {
    name: 'opentime',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Schedule an automatic group open time (HH:MM)',
    usage: '.opentime 07:00 | .opentime off',
    handler: async (ctx) => {
      const value = (ctx.args[0] || '').trim();
      if (value.toLowerCase() === 'off') {
        database.setGroup(ctx.chat, { openTime: null });
        return ctx.reply(formatter.success('Automatic opening disabled.'));
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        return ctx.reply(formatter.error('Use 24h format, e.g. `.opentime 07:00`'));
      }
      database.setGroup(ctx.chat, { openTime: value });
      return ctx.reply(formatter.success(`Group will open automatically at ${value}.`));
    },
  },
  {
    name: 'welcome',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Toggle or set the welcome message',
    usage: '.welcome on|off|set <text with {user} {group} {count}>',
    handler: async (ctx) => {
      const action = (ctx.args[0] || '').toLowerCase();
      if (action === 'set') {
        const template = ctx.argText.slice(3).trim();
        if (!template) return ctx.reply(formatter.error('Provide the welcome text.'));
        database.setGroup(ctx.chat, { welcomeText: template, welcome: true });
        return ctx.reply(formatter.success('Welcome message updated and enabled.'));
      }
      const value = onOffArg(ctx);
      if (value === null) {
        const group = database.getGroup(ctx.chat);
        return ctx.reply(
          formatter.panel(
            [`STATE: ${group.welcome ? 'ON' : 'OFF'}`, `TEXT : ${group.welcomeText || 'default'}`],
            'WELCOME',
          ),
        );
      }
      database.setGroup(ctx.chat, { welcome: value });
      return ctx.reply(formatter.success(`Welcome messages are now *${value ? 'ON' : 'OFF'}*.`));
    },
  },
  {
    name: 'goodbye',
    aliases: [],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'Toggle or set the goodbye message',
    usage: '.goodbye on|off|set <text>',
    handler: async (ctx) => {
      const action = (ctx.args[0] || '').toLowerCase();
      if (action === 'set') {
        const template = ctx.argText.slice(3).trim();
        if (!template) return ctx.reply(formatter.error('Provide the goodbye text.'));
        database.setGroup(ctx.chat, { goodbyeText: template, goodbye: true });
        return ctx.reply(formatter.success('Goodbye message updated and enabled.'));
      }
      const value = onOffArg(ctx);
      if (value === null) {
        const group = database.getGroup(ctx.chat);
        return ctx.reply(
          formatter.panel([`STATE: ${group.goodbye ? 'ON' : 'OFF'}`, `TEXT : ${group.goodbyeText || 'default'}`], 'GOODBYE'),
        );
      }
      database.setGroup(ctx.chat, { goodbye: value });
      return ctx.reply(formatter.success(`Goodbye messages are now *${value ? 'ON' : 'OFF'}*.`));
    },
  },
  guardCommand({
    name: 'antilink',
    field: 'antilink',
    actionField: 'antilinkAction',
    label: 'Anti-link',
  }),
  guardCommand({
    name: 'antigroupmention',
    field: 'antigroupmention',
    actionField: 'antigroupmentionAction',
    label: 'Anti group mention',
  }),
  toggleCommand({ name: 'antispam', field: 'antispam', label: 'Anti-spam' }),
  toggleCommand({ name: 'antibot', field: 'antibot', label: 'Anti-bot' }),
  {
    name: 'listinactive',
    aliases: ['inactive'],
    category: 'group',
    permission: 'admin',
    groupOnly: true,
    description: 'List members who have not chatted recently',
    usage: '.listinactive [days]',
    handler: async (ctx) => {
      const days = Math.max(1, parseInt(ctx.args[0], 10) || 7);
      const cutoff = Date.now() - days * 86400000;
      const metadata = ctx.groupMetadata || (await permissions.getGroupMetadata(ctx.sock, ctx.chat));
      const activity = database.getActivity(ctx.chat);
      const inactive = [];
      for (const participant of metadata.participants) {
        const jid = permissions.normalizeJid(participant.id);
        if (jid === ctx.botJid) continue;
        const last = activity[jid] || 0;
        if (last < cutoff) inactive.push({ jid, last });
      }
      if (!inactive.length) {
        return ctx.reply(formatter.success(`Everyone has chatted in the last ${days} day(s).`));
      }
      inactive.sort((a, b) => a.last - b.last);
      const lines = inactive
        .slice(0, 100)
        .map(
          (item, index) =>
            `│ ${index + 1}. @${item.jid.split('@')[0]} — ${
              item.last ? `${Math.floor((Date.now() - item.last) / 86400000)}d ago` : 'never seen'
            }`,
        );
      const text = `${formatter.header('INACTIVE MEMBERS')}\n┃ ⏳ No message in ${days} day(s)\n┃ 🐌 ${inactive.length} member(s)\n${formatter.footer()}\n\n${lines.join('\n')}\n\n_Activity is counted from the moment the bot joined._`;
      return ctx.send({ text, mentions: inactive.slice(0, 100).map((i) => i.jid) });
    },
  },
];
