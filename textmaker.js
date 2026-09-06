'use strict';

const config = require('../../config/config');
const formatter = require('../utils/formatter');
const dl = require('../utils/downloader');

/** Local unicode fallbacks so the command always produces a real result. */
const MAPS = {
  bold: (t) => stylize(t, 0x1d400, 0x1d41a),
  mono: (t) => stylize(t, 0x1d670, 0x1d68a),
  script: (t) => stylize(t, 0x1d4d0, 0x1d4ea),
  double: (t) => stylize(t, 0x1d538, 0x1d552),
};

function stylize(text, upperBase, lowerBase) {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(upperBase + (code - 65));
      if (code >= 97 && code <= 122) return String.fromCodePoint(lowerBase + (code - 97));
      return char;
    })
    .join('');
}

function frame(style, text) {
  return `${formatter.header(`${style.toUpperCase()} TEXT`)}\n┃ ${text}\n${formatter.footer()}`;
}

function makeStyle(name, { emoji, transform }) {
  return {
    name,
    aliases: [],
    category: 'textmaker',
    permission: 'user',
    description: `Generate ${name} styled text`,
    usage: `.${name} <text>`,
    handler: async (ctx) => {
      const text = (ctx.argText || '').trim();
      if (!text) return ctx.reply(formatter.error(`Provide the text: \`${ctx.prefix}${name} ECLIPSE\``));
      if (text.length > 40) return ctx.reply(formatter.error('Keep the text under 40 characters.'));

      // Optional image service (TEXTMAKER_API must return { url } or a direct image URL template).
      if (config.apis.textmaker) {
        try {
          const endpoint = config.apis.textmaker
            .replace('{style}', encodeURIComponent(name))
            .replace('{text}', encodeURIComponent(text));
          if (/\{style\}|\{text\}/.test(config.apis.textmaker) === false) {
            throw new Error('TEXTMAKER_API must contain {style} and {text} placeholders.');
          }
          const file = await dl.fetchBuffer(endpoint);
          if (file.contentType.startsWith('image/')) {
            return ctx.reply({ image: file.buffer, caption: `${emoji} ${name} • ${text}` });
          }
          throw new Error('The text-maker service did not return an image.');
        } catch (error) {
          await ctx.reply(formatter.warn(`Image service failed (${error.message}). Using the text renderer.`));
        }
      }

      return ctx.reply(`${emoji} ${frame(name, transform(text))}`);
    },
  };
}

module.exports = [
  makeStyle('3d', { emoji: '🧊', transform: (t) => MAPS.double(t) }),
  makeStyle('hacker', { emoji: '🖥', transform: (t) => MAPS.mono(t.toLowerCase()) }),
  makeStyle('light', { emoji: '💡', transform: (t) => [...t].join(' ') }),
  makeStyle('neon', { emoji: '🌈', transform: (t) => `『 ${MAPS.bold(t)} 』` }),
  makeStyle('glitch', { emoji: '📺', transform: (t) => [...t].map((c) => `${c}\u0336`).join('') }),
  makeStyle('sign', { emoji: '🪧', transform: (t) => MAPS.script(t) }),
  makeStyle('tattoo', { emoji: '🌄', transform: (t) => `≼ ${MAPS.script(t)} ≽` }),
  makeStyle('watercolor', { emoji: '🌊', transform: (t) => `✦ ${MAPS.bold(t)} ✦` }),
];
