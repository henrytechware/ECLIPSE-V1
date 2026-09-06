'use strict';

const config = require('../../config/config');
const database = require('../database/database');
const formatter = require('../utils/formatter');
const registry = require('./index');

const CATEGORY_TITLES = {
  group: '🏘️ GROUP MENU',
  fun: '🎮 FUN MENU',
  download: '📥 DOWNLOAD MENU',
  user: '🥷 USER MENU',
  sticker: '🦸 STICKER MENU',
  misc: '🛰️ MISC',
  vars: '🖱️ VARS',
  textmaker: '✨ TEXT MAKER MENU',
  video: '🎬 VIDEO MENU',
  other: '🌐 OTHER MENU',
};

function categoryMenu(category) {
  const prefix = formatter.prefix();
  const list = registry.byCategory(category).map((command) => `${prefix}${command.name}`);
  if (!list.length) return formatter.error('No commands in this category.');
  return `${formatter.infoPanel()}\n\n${formatter.box(CATEGORY_TITLES[category] || category.toUpperCase(), list)}`;
}

function mainMenu() {
  const prefix = formatter.prefix();
  const stats = database.getStats();
  const info = formatter.infoPanel([
    `🧩 CMDS  : ${registry.all().length}`,
    `📊 USED  : ${stats._total || 0}`,
  ]);
  const menus = Object.keys(CATEGORY_TITLES).map((category) => `${prefix}${category === 'misc' ? 'misc' : `${category}menu`}`);
  return `${info}\n\n${formatter.box('🌔 COMMANDS', menus)}\n\n🌑 _Use ${prefix}help <command> for details._`;
}

module.exports = [
  {
    name: 'menu',
    aliases: ['help', 'commands'],
    category: 'misc',
    permission: 'user',
    description: 'Show the ECLIPSE V1 menu',
    usage: '.menu [command]',
    handler: async (ctx) => {
      if (ctx.args.length) {
        const command = registry.find(ctx.args[0]);
        if (!command) return ctx.reply(formatter.error(`Unknown command: ${ctx.args[0]}`));
        return ctx.reply(
          formatter.panel(
            [
              `🧩 NAME  : ${command.name}`,
              `📂 CAT   : ${command.category}`,
              `🔐 PERM  : ${command.permission}`,
              `📝 USAGE : ${command.usage}`,
              `💬 INFO  : ${command.description || 'No description'}`,
              `🔁 ALIAS : ${(command.aliases || []).join(', ') || 'none'}`,
            ],
            'COMMAND INFO',
          ),
        );
      }
      return ctx.reply(mainMenu());
    },
  },
  ...Object.keys(CATEGORY_TITLES).map((category) => ({
    name: category === 'misc' ? 'misc' : `${category}menu`,
    aliases: [],
    category: 'misc',
    permission: 'user',
    description: `Show the ${category} commands`,
    usage: `.${category === 'misc' ? 'misc' : `${category}menu`}`,
    handler: async (ctx) => ctx.reply(categoryMenu(category)),
  })),
  {
    name: 'ping',
    aliases: ['p', 'speed'],
    category: 'misc',
    permission: 'user',
    description: 'Check bot latency',
    usage: '.ping',
    handler: async (ctx) => {
      const start = Date.now();
      const sent = await ctx.reply('🛰️ Pinging...');
      const latency = Date.now() - start;
      await ctx.sock.sendMessage(ctx.chat, {
        text: formatter.panel(
          [`⚡ LATENCY : ${latency} ms`, `⏱ UPTIME  : ${formatter.uptime()}`, '📡 STATUS  : ONLINE'],
          'PING',
        ),
        edit: sent.key,
      });
    },
  },
  {
    name: 'alive',
    aliases: ['status', 'runtime'],
    category: 'misc',
    permission: 'user',
    description: 'Show bot status and uptime',
    usage: '.alive',
    handler: async (ctx) => {
      const memory = process.memoryUsage().rss;
      return ctx.reply(
        formatter.infoPanel([
          `🧠 MEMORY: ${formatter.bytes(memory)}`,
          `🖥 NODE  : ${process.version}`,
          `🧩 CMDS  : ${registry.all().length}`,
        ]),
      );
    },
  },
  {
    name: 'public',
    aliases: [],
    category: 'misc',
    permission: 'owner',
    description: 'Switch the bot to public mode',
    usage: '.public',
    handler: async (ctx) => {
      database.setSetting('mode', 'public');
      return ctx.reply(formatter.success('Mode set to *PUBLIC*. Everyone can use the bot.'));
    },
  },
  {
    name: 'private',
    aliases: [],
    category: 'misc',
    permission: 'owner',
    description: 'Switch the bot to private mode',
    usage: '.private',
    handler: async (ctx) => {
      database.setSetting('mode', 'private');
      return ctx.reply(formatter.success('Mode set to *PRIVATE*. Only the owner and sudo users can run commands.'));
    },
  },
  {
    name: 'url',
    aliases: ['host'],
    category: 'misc',
    permission: 'user',
    description: 'Show the configured public URL / host status',
    usage: '.url',
    handler: async (ctx) => {
      if (!config.publicUrl) {
        return ctx.reply(formatter.warn('No public URL is configured. Set PUBLIC_URL in .env.'));
      }
      return ctx.reply(
        formatter.panel([`🌐 URL   : ${config.publicUrl}`, `📡 STATUS: ONLINE`, `⏱ UPTIME: ${formatter.uptime()}`], 'HOST'),
      );
    },
  },
];
