'use strict';

const config = require('../../config/config');
const database = require('../database/database');
const formatter = require('../utils/formatter');
const permissions = require('../utils/permissions');
const media = require('../utils/media');

function onOff(ctx) {
  const value = (ctx.args[0] || '').toLowerCase();
  if (['on', 'true', 'enable'].includes(value)) return true;
  if (['off', 'false', 'disable'].includes(value)) return false;
  return null;
}

function toggle(name, field, label) {
  return {
    name,
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: `Toggle ${label}`,
    usage: `.${name} on|off`,
    handler: async (ctx) => {
      const value = onOff(ctx);
      const settings = database.getUser(ctx.botJid);

      if (value === null) {
        return ctx.reply(
          formatter.warn(
            `${label} is *${settings[field] ? 'ON' : 'OFF'}*.\nUsage: ${ctx.prefix}${name} on|off`
          )
        );
      }

      database.setUser(ctx.botJid, { [field]: value });

      return ctx.reply(
        formatter.success(
          `${label} is now *${value ? 'ON' : 'OFF'}*.`
        )
      );
    },
  };
}

function targetJid(ctx) {
  if (ctx.mentions[0]) return ctx.mentions[0];

  if (ctx.quoted?.participant) {
    return ctx.quoted.participant;
  }

  const number = (ctx.argText || '').match(/\d{8,15}/);

  return number
    ? `${number[0]}@s.whatsapp.net`
    : null;
}

module.exports = [
  {
    name: 'delete',
    aliases: ['del'],
    category: 'user',
    permission: 'admin',
    description: 'Delete a quoted message',
    usage: '.delete (reply to a message)',
    handler: async (ctx) => {
      if (!ctx.quoted?.stanzaId) {
        return ctx.reply(
          formatter.error(
            'Reply to the message you want to delete.'
          )
        );
      }

      await ctx.sock.sendMessage(ctx.chat, {
        delete: {
          remoteJid: ctx.chat,
          fromMe:
            ctx.quoted.participant === ctx.botJid,
          id: ctx.quoted.stanzaId,
          participant: ctx.quoted.participant,
        },
      });
    },
  },

  {
    name: 'block',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: 'Block a WhatsApp contact',
    usage: '.block @user',
    handler: async (ctx) => {
      const jid =
        targetJid(ctx) ||
        (!ctx.isGroup ? ctx.chat : null);

      if (!jid) {
        return ctx.reply(
          formatter.error(
            'Mention the user you want to block.'
          )
        );
      }

      await ctx.sock.updateBlockStatus(
        jid,
        'block'
      );

      return ctx.reply(
        formatter.success(
          `Blocked ${jid.split('@')[0]}.`
        )
      );
    },
  },

  {
    name: 'unblock',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: 'Unblock a WhatsApp contact',
    usage: '.unblock @user',
    handler: async (ctx) => {
      const jid =
        targetJid(ctx) ||
        (!ctx.isGroup ? ctx.chat : null);

      if (!jid) {
        return ctx.reply(
          formatter.error(
            'Mention the user you want to unblock.'
          )
        );
      }

      await ctx.sock.updateBlockStatus(
        jid,
        'unblock'
      );

      return ctx.reply(
        formatter.success(
          `Unblocked ${jid.split('@')[0]}.`
        )
      );
    },
  },

  {
    name: 'call',
    aliases: [],
    category: 'user',
    permission: 'user',
    description: 'Show a click-to-call link for a number',
    usage: '.call [@user]',
    handler: async (ctx) => {
      const jid =
        targetJid(ctx) || ctx.sender;

      const number = jid.split('@')[0];

      return ctx.reply(
        formatter.panel(
          [
            `📞 NUMBER: +${number}`,
            `🔗 https://wa.me/${number}`,
          ],
          'CALL'
        )
      );
    },
  },

  {
    name: 'antibug',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description:
      'Toggle the defensive malformed-payload filter',
    usage: '.antibug on|off',
    handler: async (ctx) => {
      const value = onOff(ctx);
      const settings =
        database.getUser(ctx.botJid);

      if (value === null) {
        return ctx.reply(
          formatter.panel(
            [
              `STATE: ${
                settings.antibug
                  ? 'ON'
                  : 'OFF'
              }`,
              'Filters oversized and malformed payloads that can freeze WhatsApp.',
              'This is protection only — it never attacks anyone.',
            ],
            'ANTIBUG'
          )
        );
      }

      database.setUser(
        ctx.botJid,
        { antibug: value }
      );

      return ctx.reply(
        formatter.success(
          `Antibug protection is now *${
            value ? 'ON' : 'OFF'
          }*.`
        )
      );
    },
  },

  toggle(
    'autoviewstatus',
    'autoViewStatus',
    'Auto view status'
  ),

  toggle(
    'autotyping',
    'autoTyping',
    'Auto typing'
  ),

  toggle(
    'autorecording',
    'autoRecording',
    'Auto recording'
  ),

  {
    name: 'left',
    aliases: ['leavegroup'],
    category: 'user',
    permission: 'owner',
    groupOnly: true,
    description: 'Make the bot leave this group',
    usage: '.left',
    handler: async (ctx) => {
      await ctx.reply(
        formatter.success(
          'Leaving this group. 🌑'
        )
      );

      await ctx.sock.groupLeave(ctx.chat);
    },
  },

  {
    name: 'setpp',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: 'Set the bot profile picture',
    usage: '.setpp (reply to an image)',
    handler: async (ctx) => {
      const info =
        media.findMediaNode(
          ctx.quoted?.content
        ) ||
        media.findMediaNode(
          ctx.content
        );

      if (
        !info ||
        info.type !== 'image'
      ) {
        return ctx.reply(
          formatter.error(
            'Reply to an image.'
          )
        );
      }

      const buffer =
        await media.downloadMedia(info);

      const sharp = require('sharp');

      const square =
        await sharp(buffer)
          .resize(640, 640, {
            fit: 'cover',
          })
          .jpeg()
          .toBuffer();

      await ctx.sock.updateProfilePicture(
        ctx.botJid,
        square
      );

      return ctx.reply(
        formatter.success(
          'Profile picture updated.'
        )
      );
    },
  },

  {
    name: 'ban',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: 'Ban a user from using the bot',
    usage: '.ban @user',
    handler: async (ctx) => {
      const jid = targetJid(ctx);

      if (!jid) {
        return ctx.reply(
          formatter.error(
            'Mention the user you want to ban.'
          )
        );
      }

      if (
        permissions.normalizeJid(jid) ===
        ctx.botJid
      ) {
        return ctx.reply(
          formatter.error(
            'I cannot ban myself.'
          )
        );
      }

      const ok =
        database.ban(
          permissions.normalizeJid(jid)
        );

      return ctx.reply(
        ok
          ? formatter.success(
              `Banned ${jid.split('@')[0]}.`
            )
          : formatter.warn(
              'That user is already banned.'
            )
      );
    },
  },

  {
    name: 'unban',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: 'Unban a user',
    usage: '.unban @user',
    handler: async (ctx) => {
      const jid = targetJid(ctx);

      if (!jid) {
        return ctx.reply(
          formatter.error(
            'Mention the user you want to unban.'
          )
        );
      }

      const ok =
        database.unban(
          permissions.normalizeJid(jid)
        );

      return ctx.reply(
        ok
          ? formatter.success(
              `Unbanned ${jid.split('@')[0]}.`
            )
          : formatter.warn(
              'That user is not banned.'
            )
      );
    },
  },

  {
    name: 'setprefix',
    aliases: [],
    category: 'user',
    permission: 'owner',
    description: 'Change the command prefix',
    usage: '.setprefix !',
    handler: async (ctx) => {
      const value =
        (ctx.args[0] || '').trim();

      if (
        !value ||
        value.length > 2 ||
        /\s/.test(value)
      ) {
        return ctx.reply(
          formatter.error(
            'Provide a prefix of 1-2 characters, e.g. `.setprefix !`'
          )
        );
      }

      database.setSetting(
        'prefix',
        value
      );

      return ctx.reply(
        formatter.success(
          `Prefix changed to *${value}*. Try ${value}menu`
        )
      );
    },
  },

  {
    name: 'repo',
    aliases: ['script'],
    category: 'user',
    permission: 'user',
    description: 'Show the bot repository',
    usage: '.repo',
    handler: async (ctx) =>
      ctx.reply(
        formatter.panel(
          [
            `👾 BOT   : ${config.botName}`,
            `🐯 OWNER : ${config.ownerName}`,
            `🔗 REPO  : ${config.repoUrl}`,
          ],
          'REPOSITORY'
        )
      ),
  },
];