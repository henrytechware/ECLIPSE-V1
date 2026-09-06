'use strict';

const config = require('../../config/config');
const formatter = require('../utils/formatter');
const dl = require('../utils/downloader');

const NOT_CONFIGURED = '⚠️ This service is not configured by the owner.';

async function openaiChat(prompt) {
  const data = await dl.postJson(
    'https://api.openai.com/v1/chat/completions',
    { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 600 },
    { headers: { Authorization: `Bearer ${config.apis.openai}` } },
  );
  return data?.choices?.[0]?.message?.content?.trim() || 'No response.';
}

// Model names change over time, so every provider tries a list until one works.
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-001',
].filter(Boolean);

const GROK_MODELS = [process.env.GROK_MODEL, 'grok-4-fast', 'grok-3-mini', 'grok-3', 'grok-2-1212'].filter(Boolean);

async function tryModels(models, run) {
  let lastError = null;
  for (const model of models) {
    try {
      return await run(model);
    } catch (error) {
      lastError = error;
      // Only keep trying when the model itself was rejected.
      if (!/404|400|not found|does not exist|invalid-argument|model/i.test(error.message)) throw error;
    }
  }
  throw new Error(`No usable model. Last error: ${lastError?.message || 'unknown'}`);
}

async function geminiChat(prompt) {
  return tryModels(GEMINI_MODELS, async (model) => {
    const data = await dl.postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'x-goog-api-key': config.apis.gemini } },
    );
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n').trim();
    if (!text) throw new Error('Empty response from Gemini.');
    return text;
  });
}

async function grokChat(prompt) {
  return tryModels(GROK_MODELS, async (model) => {
    const data = await dl.postJson(
      'https://api.x.ai/v1/chat/completions',
      { model, messages: [{ role: 'user', content: prompt }], max_tokens: 600 },
      { headers: { Authorization: `Bearer ${config.apis.grok}` } },
    );
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from Grok.');
    return text;
  });
}

/**
 * Movie lookup with three independent sources so a single dead API
 * never breaks the command: OMDb (if a key is set) → imdbot → TVmaze.
 */
async function lookupMovie(query) {
  if (config.apis.omdb) {
    const data = await dl
      .getJson('https://www.omdbapi.com/', { params: { apikey: config.apis.omdb, t: query, plot: 'short' } })
      .catch(() => null);
    if (data && data.Response !== 'False') {
      return {
        poster: data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
        lines: [
          `🎬 ${data.Title}`,
          `📅 YEAR   : ${data.Year || 'n/a'}`,
          `⭐ RATING : ${data.imdbRating || 'n/a'}`,
          `🎭 CAST   : ${(data.Actors || 'n/a').slice(0, 120)}`,
          `📝 ${(data.Plot || '').slice(0, 300)}`,
          `🔗 https://imdb.com/title/${data.imdbID}`,
        ],
      };
    }
  }

  const imdb = await dl.getJson('https://search.imdbot.workers.dev/', { params: { q: query } }).catch(() => null);
  const movie = imdb?.description?.[0];
  if (movie) {
    return {
      poster: movie['#IMG_POSTER'] || null,
      lines: [
        `🎬 ${movie['#TITLE']}`,
        `📅 YEAR : ${movie['#YEAR'] || 'n/a'}`,
        `🎭 CAST : ${(movie['#ACTORS'] || 'n/a').slice(0, 120)}`,
        `🔗 https://imdb.com/title/${movie['#IMDB_ID']}`,
      ],
    };
  }

  const tv = await dl.getJson('https://api.tvmaze.com/singlesearch/shows', { params: { q: query } }).catch(() => null);
  if (tv?.name) {
    return {
      poster: tv.image?.original || tv.image?.medium || null,
      lines: [
        `🎬 ${tv.name}`,
        `📅 YEAR   : ${(tv.premiered || 'n/a').slice(0, 4)}`,
        `⭐ RATING : ${tv.rating?.average ?? 'n/a'}`,
        `🎭 GENRES : ${(tv.genres || []).join(', ') || 'n/a'}`,
        `📝 ${String(tv.summary || '').replace(/<[^>]+>/g, '').slice(0, 300)}`,
        `🔗 ${tv.url}`,
      ],
    };
  }

  return null;
}

function aiCommand(name, aliases, key, runner, label) {
  return {
    name,
    aliases,
    category: 'other',
    permission: 'user',
    description: `Ask ${label}`,
    usage: `.${name} <prompt>`,
    handler: async (ctx) => {
      if (!config.apis[key]) return ctx.reply(NOT_CONFIGURED);
      if (!ctx.argText) return ctx.reply(formatter.error(`Provide a prompt: \`${ctx.prefix}${name} explain black holes\``));
      const answer = await runner(ctx.argText);
      return ctx.reply(`${formatter.header(label.toUpperCase())}\n┃ 🤖 ${label}\n${formatter.footer()}\n\n${answer}`);
    },
  };
}

module.exports = [
  {
    name: 'jid',
    aliases: [],
    category: 'other',
    permission: 'user',
    description: 'Show the JIDs of the sender, quoted user and chat',
    usage: '.jid',
    handler: async (ctx) => {
      const lines = [`🧑‍💻 SENDER : ${ctx.sender}`, `💬 CHAT   : ${ctx.chat}`, `🤖 BOT    : ${ctx.botJid}`];
      if (ctx.quoted?.participant) lines.push(`↩️ QUOTED : ${ctx.quoted.participant}`);
      if (ctx.isGroup && ctx.groupMetadata) lines.push(`🏘️ GROUP  : ${ctx.groupMetadata.subject}`);
      return ctx.reply(formatter.panel(lines, 'JID'));
    },
  },
  {
    name: 'time',
    aliases: ['date'],
    category: 'other',
    permission: 'user',
    description: 'Show the current time (optionally for a timezone)',
    usage: '.time [Africa/Lagos]',
    handler: async (ctx) => {
      const zone = ctx.args[0];
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'full',
          timeStyle: 'medium',
          timeZone: zone || undefined,
        }).format(now);
        return ctx.reply(formatter.panel([`🕒 ${formatted}`, `🌍 ${zone || 'server time'}`], 'TIME'));
      } catch {
        return ctx.reply(formatter.error('Unknown timezone. Example: `.time Africa/Lagos`'));
      }
    },
  },
  {
    name: 'weather',
    aliases: [],
    category: 'other',
    permission: 'user',
    description: 'Current weather for a city',
    usage: '.weather Lagos',
    handler: async (ctx) => {
      if (!config.apis.weather) return ctx.reply(NOT_CONFIGURED);
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a city: `.weather Lagos`'));
      const data = await dl.getJson('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: ctx.argText, appid: config.apis.weather, units: 'metric' },
      });
      if (data.cod && String(data.cod) !== '200') throw new Error(data.message || 'City not found.');
      return ctx.reply(
        formatter.panel(
          [
            `📍 ${data.name}, ${data.sys?.country || ''}`,
            `🌡 TEMP  : ${data.main.temp}°C (feels ${data.main.feels_like}°C)`,
            `🌥️ SKY   : ${data.weather?.[0]?.description || 'n/a'}`,
            `🌤️ HUMID : ${data.main.humidity}%`,
            `🌪️ WIND  : ${data.wind?.speed} m/s`,
          ],
          'WEATHER',
        ),
      );
    },
  },
  {
    name: 'dictionary',
    aliases: ['define'],
    category: 'other',
    permission: 'user',
    description: 'Look up a word',
    usage: '.dictionary eclipse',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a word.'));
      const word = ctx.argText.trim().split(/\s+/)[0].toLowerCase();

      // dictionaryapi.dev answers 404 for unknown words — treat that as "not found",
      // never as a service failure, and fall back to Wiktionary.
      const data = await dl
        .getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        .catch(() => null);
      const entry = Array.isArray(data) ? data[0] : null;

      if (entry) {
        const meanings = entry.meanings.slice(0, 3).map(
          (meaning) => `• (${meaning.partOfSpeech}) ${meaning.definitions[0]?.definition}`,
        );
        const phonetic = entry.phonetic ? [`🔊 ${entry.phonetic}`] : [];
        return ctx.reply(formatter.panel([`📖 ${entry.word}`, ...phonetic, ...meanings], 'DICTIONARY'));
      }

      const wiktionary = await dl
        .getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`)
        .catch(() => null);
      const english = wiktionary?.en;
      if (Array.isArray(english) && english.length) {
        const lines = english.slice(0, 3).map((section) => {
          const definition = String(section.definitions?.[0]?.definition || '')
            .replace(/<[^>]+>/g, '')
            .trim();
          return `• (${section.partOfSpeech}) ${definition}`;
        });
        return ctx.reply(formatter.panel([`📖 ${word}`, ...lines], 'DICTIONARY'));
      }

      return ctx.reply(formatter.warn(`No dictionary entry found for *${word}*. Check the spelling and try again.`));
    },
  },
  {
    name: 'wiki',
    aliases: ['wikipedia'],
    category: 'other',
    permission: 'user',
    description: 'Wikipedia summary',
    usage: '.wiki eclipse',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a search term.'));
      // Treat the argument as a search query instead of assuming it is an
      // exact Wikipedia article title. The old REST request returned 404 for
      // queries such as ".wiki who is Elon".
      const search = await dl.getJson('https://en.wikipedia.org/w/api.php', {
        timeout: 10000,
        params: {
          action: 'query',
          list: 'search',
          srsearch: ctx.argText,
          srlimit: 1,
          format: 'json',
          utf8: 1,
        },
      });

      const result = search?.query?.search?.[0];
      if (!result?.title) throw new Error('No article found.');

      const data = await dl.getJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(result.title)}`,
        { timeout: 10000 },
      );

      if (!data?.extract) throw new Error('No article found.');
      return ctx.reply(`${formatter.header('WIKIPEDIA')}\n┃ 📚 ${data.title}\n${formatter.footer()}\n\n${data.extract}\n\n🔗 ${data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`}`);
    },
  },
  {
    name: 'currency',
    aliases: ['convert'],
    category: 'other',
    permission: 'user',
    description: 'Convert currency',
    usage: '.currency 100 USD NGN',
    handler: async (ctx) => {
      const [amountRaw, from, to] = ctx.args;
      const amount = parseFloat(amountRaw);
      if (!Number.isFinite(amount) || !from || !to) {
        return ctx.reply(formatter.error('Usage: `.currency 100 USD NGN`'));
      }
      const data = await dl.getJson(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
      const rate = data?.rates?.[to.toUpperCase()];
      if (!rate) throw new Error('Unsupported currency code.');
      return ctx.reply(
        formatter.panel(
          [
            `💱 ${amount} ${from.toUpperCase()} = ${(amount * rate).toFixed(2)} ${to.toUpperCase()}`,
            `📈 RATE: 1 ${from.toUpperCase()} = ${rate} ${to.toUpperCase()}`,
          ],
          'CURRENCY',
        ),
      );
    },
  },
  {
    name: 'movie',
    aliases: [],
    category: 'other',
    permission: 'user',
    description: 'Search movie information',
    usage: '.movie inception',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a movie title.'));
      const result = await lookupMovie(ctx.argText);
      if (!result) return ctx.reply(formatter.warn(`No movie or series found for *${ctx.argText}*.`));
      const panel = formatter.panel(result.lines, 'MOVIE');
      if (result.poster) {
        return ctx.reply({ image: { url: result.poster }, caption: panel });
      }
      return ctx.reply(panel);
    },
  },
  {
    name: 'music',
    aliases: ['lyrics'],
    category: 'other',
    permission: 'user',
    description: 'Find song lyrics',
    usage: '.music <artist> - <title>',
    handler: async (ctx) => {
      const [artist, title] = (ctx.argText || '').split('-').map((part) => part.trim());
      if (!artist || !title) return ctx.reply(formatter.error('Usage: `.music Adele - Hello`'));
      const data = await dl.getJson(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      );
      if (!data?.lyrics) throw new Error('Lyrics not found.');
      return ctx.reply(`${formatter.header('LYRICS')}\n┃ 🎵 ${artist} — ${title}\n${formatter.footer()}\n\n${data.lyrics.slice(0, 3500)}`);
    },
  },
  aiCommand('chatgpt', ['gpt', 'ai'], 'openai', openaiChat, 'ChatGPT'),
  aiCommand('openai', [], 'openai', openaiChat, 'OpenAI'),
  aiCommand('gemini', [], 'gemini', geminiChat, 'Gemini'),
  aiCommand('grok', [], 'grok', grokChat, 'Grok'),
];
