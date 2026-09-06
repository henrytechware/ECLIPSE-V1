'use strict';

const config = require('../../config/config');
const logger = require('../utils/logger');
const database = require('../database/database');
const sessions = require('../whatsapp/sessions');
const {
  startSession,
  stopSession,
  statusOf,
} = require('../whatsapp/connection');
const formatter = require('../utils/formatter');
const pairing = require('./pairing');
const subscriptionGate = require('./subscriptionGate');

function isOwnerTelegram(telegramId) {
  return (
    config.ownerTelegramId &&
    String(telegramId) ===
      String(config.ownerTelegramId)
  );
}

function statusText(telegramId) {
  const live = sessions.get(telegramId);
  const stored = database.getSession(telegramId);

  const status =
    live?.status ||
    stored?.status ||
    'none';

  return [
    `🌑 *${config.botName}*`,
    '',
    `🐯 Owner: ${config.ownerName}`,
    `📡 WhatsApp: ${status}`,
    `📱 Number: ${
      stored?.number
        ? `+${stored.number}`
        : 'not linked'
    }`,
    `🆔 JID: ${
      live?.jid ||
      stored?.jid ||
      'n/a'
    }`,
    `⏱ Uptime: ${formatter.uptime()}`,
  ].join('\n');
}

function registerCommands(bot) {

  /* ==========================================================
   * START
   * ========================================================== */

  bot.onText(/^\/start$/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      [
        `🌑 *${config.botName}*`,
        `🐯 Owner: ${config.ownerName}`,
        '',
        'Pair your WhatsApp account and control the bot from here.',
        '',
        '/pair – link a WhatsApp number',
        '/status – connection status',
        '/sessions – list sessions',
        '/logout – unlink WhatsApp',
        '/restart – restart your session',
        '/help – show this help',
      ].join('\n'),
      {
        parse_mode: 'Markdown',
      }
    );
  });


  /* ==========================================================
   * HELP
   * ========================================================== */

  bot.onText(/^\/help$/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      [
        '*Commands*',
        '/pair – start WhatsApp pairing',
        '/status – show your WhatsApp connection status',
        '/sessions – list active sessions',
        '/logout – log out and delete your session',
        '/restart – restart your WhatsApp socket',
        '',
        `WhatsApp prefix: \`${formatter.prefix()}\``,
        `Try \`${formatter.prefix()}menu\` once connected.`,
      ].join('\n'),
      {
        parse_mode: 'Markdown',
      }
    );
  });


  /* ==========================================================
   * PAIR
   * ========================================================== */

  bot.onText(
    /^\/pair(?:\s+(\S+))?$/,
    async (msg, match) => {

      const telegramId =
        String(msg.from.id);

      /*
       * --------------------------------------------------------
       * FIRST: CHECK TELEGRAM MEMBERSHIP
       * --------------------------------------------------------
       */

      const allowed =
        await subscriptionGate.requireSubscription(
          bot,
          telegramId,
          msg.chat.id
        );

      if (!allowed) {
        return;
      }

      /*
       * --------------------------------------------------------
       * IF NUMBER WAS PROVIDED WITH /pair
       *
       * Example:
       * /pair 2348012345678
       * --------------------------------------------------------
       */

      if (match && match[1]) {

        await pairing.runPairing(
          bot,
          msg.chat.id,
          telegramId,
          match[1]
        );

        return;
      }

      /*
       * --------------------------------------------------------
       * ASK FOR NUMBER
       * --------------------------------------------------------
       */

      pairing.requestNumber(
        msg.chat.id,
        telegramId
      );

      await bot.sendMessage(
        msg.chat.id,
        [
          '📱 *WhatsApp Number*',
          '',
          'Send your WhatsApp number in international format.',
          '',
          'Example:',
          '`2348012345678`',
          '',
          'Do not include `+` or spaces.',
        ].join('\n'),
        {
          parse_mode: 'Markdown',
        }
      );
    }
  );


  /* ==========================================================
   * MEMBERSHIP CHECK BUTTON
   * ========================================================== */

  bot.on(
    'callback_query',
    async (query) => {

      if (
        query.data !==
        'eclipse_check_membership'
      ) {
        return;
      }

      const telegramId =
        String(query.from.id);

      const chatId =
        query.message?.chat?.id ||
        telegramId;

      try {

        /*
         * Tell Telegram that the button was pressed.
         */
        await bot.answerCallbackQuery(
          query.id,
          {
            text: 'Checking your membership...',
          }
        );

        /*
         * Check all required communities again.
         */
        const result =
          await subscriptionGate.checkMembership(
            bot,
            telegramId
          );

        if (!result.allowed) {

          await subscriptionGate.sendRequirement(
            bot,
            chatId,
            result.missing
          );

          return;
        }

        /*
         * User has joined everything.
         */
        await bot.sendMessage(
          chatId,
          [
            '✅ *Membership verified!*',
            '',
            'You have joined all required Telegram communities.',
            '',
            '📱 Now send your WhatsApp number in international format.',
            '',
            'Example:',
            '`2348012345678`',
          ].join('\n'),
          {
            parse_mode: 'Markdown',
          }
        );

        pairing.requestNumber(
          chatId,
          telegramId
        );

      } catch (error) {

        logger.error(
          'Membership callback error:',
          error.message
        );

        await bot.sendMessage(
          chatId,
          '❌ Could not verify your membership. Please try again.'
        );
      }
    }
  );


  /* ==========================================================
   * STATUS
   * ========================================================== */

  bot.onText(/^\/status$/, async (msg) => {

    await bot.sendMessage(
      msg.chat.id,
      statusText(msg.from.id),
      {
        parse_mode: 'Markdown',
      }
    );

  });


  /* ==========================================================
   * SESSIONS
   * ========================================================== */

  bot.onText(/^\/sessions$/, async (msg) => {

    const telegramId =
      String(msg.from.id);

    const all =
      database.listSessions();

    const visible =
      isOwnerTelegram(telegramId)
        ? all
        : all.filter(
            (s) =>
              String(s.telegramId) ===
              telegramId
          );

    if (!visible.length) {

      await bot.sendMessage(
        msg.chat.id,
        'No sessions found. Use /pair to create one.'
      );

      return;
    }

    const lines =
      visible.map(
        (session) =>
          `• ${
            String(session.telegramId) ===
            telegramId
              ? 'you'
              : session.telegramId
          } — ${
            statusOf(session.telegramId)
          }${
            session.number
              ? ` (+${session.number})`
              : ''
          }`
      );

    await bot.sendMessage(
      msg.chat.id,
      `*Sessions*\n${lines.join('\n')}`,
      {
        parse_mode: 'Markdown',
      }
    );

  });


  /* ==========================================================
   * LOGOUT
   * ========================================================== */

  bot.onText(/^\/logout$/, async (msg) => {

    const telegramId =
      String(msg.from.id);

    if (
      !sessions.hasSession(telegramId) &&
      !sessions.get(telegramId)
    ) {

      await bot.sendMessage(
        msg.chat.id,
        'You have no active session.'
      );

      return;
    }

    await stopSession(
      telegramId,
      {
        wipe: true,
      }
    );

    await bot.sendMessage(
      msg.chat.id,
      '⏳ Logged out and session removed. Use /pair to link again.'
    );

  });


  /* ==========================================================
   * RESTART
   * ========================================================== */

  bot.onText(/^\/restart$/, async (msg) => {

    const telegramId =
      String(msg.from.id);

    if (!sessions.hasSession(telegramId)) {

      await bot.sendMessage(
        msg.chat.id,
        'No stored session to restart. Use /pair first.'
      );

      return;
    }

    await stopSession(telegramId);

    await bot.sendMessage(
      msg.chat.id,
      '♻️ Restarting your WhatsApp session...'
    );

    try {

      await startSession({
        telegramId,

        resumeOnly: true,

        notify: async (text) =>
          bot
            .sendMessage(
              msg.chat.id,
              text,
              {
                parse_mode: 'Markdown',
              }
            )
            .catch(() => null),
      });

    } catch (error) {

      logger.error(
        'Restart failed:',
        error.message
      );

      await bot.sendMessage(
        msg.chat.id,
        `⛔ Restart failed: ${error.message}`
      );
    }

  });


  /* ==========================================================
   * FREE TEXT PAIRING NUMBER
   * ========================================================== */

  bot.on(
    'message',
    async (msg) => {

      const text =
        (msg.text || '').trim();

      if (!text) return;

      if (text.startsWith('/')) {
        return;
      }

      if (
        !pairing.isAwaiting(
          msg.chat.id
        )
      ) {
        return;
      }

      /*
       * Check membership AGAIN before
       * actually creating the WhatsApp session.
       *
       * This prevents bypassing the gate by
       * waiting for the number prompt.
       */
      const allowed =
        await subscriptionGate.requireSubscription(
          bot,
          String(msg.from.id),
          msg.chat.id
        );

      if (!allowed) {
        pairing.clear(msg.chat.id);
        return;
      }

      await pairing.runPairing(
        bot,
        msg.chat.id,
        msg.from.id,
        text
      );
    }
  );
}

module.exports = {
  registerCommands,
  isOwnerTelegram,
};