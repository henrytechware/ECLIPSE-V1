'use strict';

const config = require('../../config/config');

/*
 * ============================================================
 * REQUIRED TELEGRAM GROUPS / CHANNELS
 * ============================================================
 *
 * Replace these with your REAL usernames.
 *
 * The bot must be able to check membership in each chat.
 * Make the Telegram bot admin in required channels/groups.
 */

const REQUIRED_CHATS = [
  {
    chatId: '@henrytechcommunity',
    title: 'OWNERS CHANNEL',
    url: 'https://t.me/henrytechcommunity',
  },
  {
    chatId: '@henrytechcommunitygroup',
    title: 'ECLIPSE UPDATES',
    url: 'https://t.me/henrytechcommunitygroup',
  },
  {
    chatId: '@donnasdomains',
    title: 'CHANNEL 2',
    url: 'https://t.me/donnasdomains',
  },
];

/*
 * Telegram membership statuses that count as joined.
 */
const VALID_STATUSES = new Set([
  'creator',
  'administrator',
  'member',
]);

/*
 * Get the Telegram bot instance.
 *
 * This module does NOT create another TelegramBot instance.
 * You pass your existing bot instance into these functions.
 */

async function checkMembership(bot, userId) {
  const missing = [];

  for (const chat of REQUIRED_CHATS) {
    try {
      const member = await bot.getChatMember(
        chat.chatId,
        userId
      );

      const joined =
        member &&
        VALID_STATUSES.has(member.status);

      if (!joined) {
        missing.push(chat);
      }
    } catch (error) {
      console.error(
        `[SUBSCRIPTION] Failed checking ${chat.chatId}:`,
        error?.response?.body || error.message
      );

      /*
       * Fail closed.
       *
       * If the bot cannot verify membership,
       * don't generate the WhatsApp pairing code.
       */
      missing.push(chat);
    }
  }

  return {
    allowed: missing.length === 0,
    missing,
  };
}

/*
 * Create Telegram inline keyboard.
 */
function buildJoinKeyboard(missing) {
  const rows = [];

  for (const chat of missing) {
    rows.push([
      {
        text: `🚨 Join ${chat.title}`,
        url: chat.url,
      },
    ]);
  }

  rows.push([
    {
      text: '✅ I Have Joined',
      callback_data: 'eclipse_check_membership',
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

/*
 * Send the subscription requirement message.
 */
async function sendRequirement(bot, chatId, missing) {
  const keyboard = buildJoinKeyboard(missing);

  const text = [
    '🔐 *ECLIPSE MD PAIRING*',
    '',
    'Before you can pair ECLIPSE MD, you must join all our official Telegram communities.',
    '',
    'Required:',
    ...missing.map(
      (chat) => `❌ ${chat.title}`
    ),
    '',
    'Join every required community, then tap:',
    '✅ *I Have Joined*',
  ].join('\n');

  return bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
}

/*
 * Main gate.
 */
async function requireSubscription(bot, userId, telegramChatId) {
  const result =
    await checkMembership(
      bot,
      userId
    );

  if (result.allowed) {
    return true;
  }

  await sendRequirement(
    bot,
    telegramChatId,
    result.missing
  );

  return false;
}

module.exports = {
  REQUIRED_CHATS,
  checkMembership,
  requireSubscription,
  sendRequirement,
};