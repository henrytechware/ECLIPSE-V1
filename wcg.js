'use strict';

/**
 * Standard Word Chain Game (WCG).
 *
 * Features: lobby with join timer, turn order, per-turn countdown with a
 * warning, dictionary validation, no repeated words, growing minimum word
 * length, elimination on timeout/invalid answer, and a winner announcement.
 */

const formatter = require('../utils/formatter');
const logger = require('../utils/logger');
const { getJson } = require('../utils/downloader');

const games = new Map(); // chatJid -> game

const JOIN_SECONDS = 60;
const BASE_TURN_SECONDS = 40;
const MIN_TURN_SECONDS = 15;
const START_MIN_LENGTH = 3;
const MAX_MIN_LENGTH = 8;

const LETTERS = 'abcdefghijklmnoprstuw'.split('');

function randomLetter() {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function tag(jid) {
  return `@${String(jid).split('@')[0]}`;
}

function clearTimers(game) {
  if (game.turnTimer) clearTimeout(game.turnTimer);
  if (game.warnTimer) clearTimeout(game.warnTimer);
  if (game.joinTimer) clearTimeout(game.joinTimer);
  game.turnTimer = null;
  game.warnTimer = null;
  game.joinTimer = null;
}

function isActive(chat) {
  return games.has(chat);
}

function get(chat) {
  return games.get(chat) || null;
}

async function isRealWord(word) {
  try {
    const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      timeout: 7000,
    });
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    // If the dictionary is unreachable we do not punish the player.
    logger.debug('WCG dictionary lookup failed:', error.message);
    return true;
  }
}

/* --------------------------------- lobby ---------------------------------- */

async function start(ctx) {
  if (games.has(ctx.chat)) {
    return ctx.reply(formatter.warn('A word chain game is already running here. Use `.wcg cancel` to stop it.'));
  }

  const game = {
    chat: ctx.chat,
    sock: ctx.sock,
    send: ctx.send,
    state: 'lobby',
    host: ctx.sender,
    players: [ctx.sender],
    names: { [ctx.sender]: ctx.pushName },
    eliminated: [],
    used: new Set(),
    letter: randomLetter(),
    minLength: START_MIN_LENGTH,
    turnIndex: 0,
    round: 1,
    turnSeconds: BASE_TURN_SECONDS,
    turnTimer: null,
    warnTimer: null,
    joinTimer: null,
  };
  games.set(ctx.chat, game);

  await ctx.send({
    text: formatter.panel(
      [
        '🔤 *WORD CHAIN GAME*',
        `⏳ Joining closes in ${JOIN_SECONDS}s`,
        `👫 Players: 1 (${tag(ctx.sender)})`,
        '',
        'Type `.wcg join` to enter.',
        'Rules: continue the chain with a real English word,',
        'starting with the required letter, no repeats,',
        'answer before the timer or you are eliminated.',
      ],
      'WCG LOBBY',
    ),
    mentions: [ctx.sender],
  });

  game.joinTimer = setTimeout(() => beginPlay(game).catch(() => {}), JOIN_SECONDS * 1000);
  game.joinTimer.unref?.();
  return true;
}

async function join(ctx) {
  const game = games.get(ctx.chat);
  if (!game) return ctx.reply(formatter.warn('No word chain game running. Start one with `.wcg start`.'));
  if (game.state !== 'lobby') return ctx.reply(formatter.warn('The game already started. Wait for the next round.'));
  if (game.players.includes(ctx.sender)) return ctx.reply(formatter.warn('You already joined.'));

  game.players.push(ctx.sender);
  game.names[ctx.sender] = ctx.pushName;
  return ctx.send({
    text: formatter.success(`${tag(ctx.sender)} joined the word chain. Players: ${game.players.length}`),
    mentions: [ctx.sender],
  });
}

async function forceStart(ctx) {
  const game = games.get(ctx.chat);
  if (!game) return ctx.reply(formatter.warn('No word chain game running.'));
  if (game.state !== 'lobby') return ctx.reply(formatter.warn('The game is already in play.'));
  if (ctx.sender !== game.host && !ctx.isSenderAdmin && !ctx.fromMe) {
    return ctx.reply(formatter.error('Only the host or an admin can start the round early.'));
  }
  clearTimers(game);
  return beginPlay(game);
}

/* --------------------------------- play ----------------------------------- */

async function beginPlay(game) {
  clearTimers(game);
  if (game.state !== 'lobby') return;

  if (game.players.length < 1) {
    games.delete(game.chat);
    return game.send(formatter.warn('Nobody joined. Word chain cancelled.'));
  }

  game.state = 'playing';
  game.turnIndex = 0;

  const solo = game.players.length === 1;
  await game.send({
    text: formatter.panel(
      [
        solo ? '🎯 Solo survival mode' : `👫 Players: ${game.players.length}`,
        `🔠 First letter: *${game.letter.toUpperCase()}*`,
        `🪐 Minimum length: ${game.minLength}`,
        `⏱ Time per turn: ${game.turnSeconds}s`,
        '',
        ...game.players.map((p, i) => `${i + 1}. ${tag(p)}`),
      ],
      'WCG STARTED',
    ),
    mentions: game.players,
  });

  return promptTurn(game);
}

function currentPlayer(game) {
  return game.players[game.turnIndex % game.players.length];
}

async function promptTurn(game) {
  clearTimers(game);
  if (game.state !== 'playing') return;
  if (!game.players.length) return finish(game, null);

  game.turnIndex %= game.players.length;
  const player = currentPlayer(game);
  game.turnStartedAt = Date.now();

  await game.send({
    text: formatter.panel(
      [
        `🎮 Turn: ${tag(player)}`,
        `🔠 Word must start with: *${game.letter.toUpperCase()}*`,
        `🔡 Minimum letters: ${game.minLength}`,
        `⏱ You have ${game.turnSeconds}s`,
        `🔁 Round ${game.round} · Words played: ${game.used.size}`,
      ],
      'WORD CHAIN',
    ),
    mentions: [player],
  });

  game.warnTimer = setTimeout(() => {
    if (game.state === 'playing' && currentPlayer(game) === player) {
      game.send({ text: `⏳ 10 seconds left, ${tag(player)}!`, mentions: [player] }).catch(() => {});
    }
  }, Math.max((game.turnSeconds - 10) * 1000, 3000));
  game.warnTimer.unref?.();

  game.turnTimer = setTimeout(() => {
    eliminate(game, player, 'ran out of time').catch(() => {});
  }, game.turnSeconds * 1000);
  game.turnTimer.unref?.();
}

async function eliminate(game, player, reason) {
  if (game.state !== 'playing') return;
  clearTimers(game);

  const index = game.players.indexOf(player);
  if (index === -1) return;
  game.players.splice(index, 1);
  game.eliminated.push(player);
  if (index <= game.turnIndex && game.turnIndex > 0) game.turnIndex -= 1;

  await game.send({
    text: formatter.panel([`❌ ${tag(player)} is eliminated — ${reason}.`, `👫 Remaining: ${game.players.length}`], 'ELIMINATED'),
    mentions: [player],
  });

  if (game.players.length <= 1) {
    return finish(game, game.players[0] || null);
  }
  return promptTurn(game);
}

async function finish(game, winner) {
  clearTimers(game);
  game.state = 'ended';
  games.delete(game.chat);

  if (!winner) {
    return game.send(formatter.panel(['🏁 Game over — no survivors.', `📚 Words played: ${game.used.size}`], 'WORD CHAIN'));
  }
  return game.send({
    text: formatter.panel(
      [`🏆 Winner: ${tag(winner)}`, `📚 Words played: ${game.used.size}`, `🔁 Rounds: ${game.round}`],
      'WORD CHAIN',
    ),
    mentions: [winner],
  });
}

async function cancel(ctx) {
  const game = games.get(ctx.chat);
  if (!game) return ctx.reply(formatter.warn('No word chain game running here.'));
  if (ctx.sender !== game.host && !ctx.isSenderAdmin && !ctx.fromMe) {
    return ctx.reply(formatter.error('Only the host or an admin can cancel the game.'));
  }
  clearTimers(game);
  games.delete(ctx.chat);
  return ctx.reply(formatter.success('Word chain cancelled.'));
}

async function status(ctx) {
  const game = games.get(ctx.chat);
  if (!game) return ctx.reply(formatter.warn('No word chain game running here.'));
  const lines =
    game.state === 'lobby'
      ? ['🕐 Waiting for players', `👫 Joined: ${game.players.length}`]
      : [
          `🎮 Turn: ${tag(currentPlayer(game))}`,
          `🔠 Letter: *${game.letter.toUpperCase()}*`,
          `✍️ Min length: ${game.minLength}`,
          `❤️‍🔥 Alive: ${game.players.length}`,
          `📚 Words played: ${game.used.size}`,
        ];
  return ctx.send({ text: formatter.panel(lines, 'WCG STATUS'), mentions: game.players });
}

/**
 * Called for every plain (non-command) group message. Returns true when the
 * message was consumed by the game.
 */
async function handleMessage(ctx) {
  const game = games.get(ctx.chat);
  if (!game || game.state !== 'playing') return false;

  const player = currentPlayer(game);
  if (ctx.sender !== player) return false;

  const word = (ctx.text || '').trim().toLowerCase();
  if (!/^[a-z]+$/.test(word)) return false; // not an attempt at a word

  if (word[0] !== game.letter) {
    await ctx.reply(formatter.error(`Your word must start with "${game.letter.toUpperCase()}".`));
    return true;
  }
  if (word.length < game.minLength) {
    await ctx.reply(formatter.error(`Too short. Minimum ${game.minLength} letters.`));
    return true;
  }
  if (game.used.has(word)) {
    await eliminate(game, player, `"${word}" was already used`);
    return true;
  }
  if (!(await isRealWord(word))) {
    await eliminate(game, player, `"${word}" is not a valid English word`);
    return true;
  }

  clearTimers(game);
  game.used.add(word);
  game.letter = word[word.length - 1];
  game.turnIndex += 1;

  if (game.turnIndex % Math.max(game.players.length, 1) === 0) {
    game.round += 1;
    if (game.round % 2 === 0 && game.minLength < MAX_MIN_LENGTH) game.minLength += 1;
    game.turnSeconds = Math.max(MIN_TURN_SECONDS, BASE_TURN_SECONDS - (game.round - 1) * 3);
  }

  await ctx.reply(formatter.success(`✅ "${word}" accepted. Next letter: *${game.letter.toUpperCase()}*`));
  await promptTurn(game);
  return true;
}

module.exports = {
  start,
  join,
  forceStart,
  cancel,
  status,
  handleMessage,
  isActive,
  get,
  JOIN_SECONDS,
};
