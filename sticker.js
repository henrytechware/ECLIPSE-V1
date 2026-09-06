'use strict';

const config = require('../../config/config');
const formatter = require('../utils/formatter');
const media = require('../utils/media');

function mediaSource(ctx) {
  return media.findMediaNode(ctx.quoted?.content) || media.findMediaNode(ctx.content);
}

async function makeSticker(ctx, { circle = false, packname, author } = {}) {
  const info = mediaSource(ctx);
  if (!info || !['image', 'video', 'sticker'].includes(info.type)) {
    return ctx.reply(formatter.error('Send or reply to an image, video or sticker.'));
  }

  const buffer = await media.downloadMedia(info);
  let webp;
  if (info.type === 'video') webp = await media.videoToWebp(buffer);
  else if (info.type === 'sticker' && !circle) webp = buffer;
  else webp = await media.imageToWebp(info.type === 'sticker' ? await media.webpToPng(buffer) : buffer, { circle });

  const withMeta = await media.setStickerMetadata(
    webp,
    packname || config.botName,
    author || config.ownerName,
  );
  return ctx.reply({ sticker: withMeta });
}

function emojiSticker(name, emoji, description) {
  return {
    name,
    aliases: [],
    category: 'sticker',
    permission: 'user',
    description,
    usage: `.${name} [@user]`,
    handler: async (ctx) => {
      const target = ctx.mentions[0] || ctx.quoted?.participant;
      const text = target
        ? `${emoji} @${target.split('@')[0]} ${description.toLowerCase()}`
        : `${emoji} ${description}`;
      return ctx.send({ text, mentions: target ? [target] : [] });
    },
  };
}

module.exports = [
  {
    name: 'tosticker',
    aliases: ['s', 'sticker'],
    category: 'sticker',
    permission: 'user',
    description: 'Convert image/video to a sticker',
    usage: '.tosticker (reply to media)',
    handler: async (ctx) => makeSticker(ctx),
  },
  {
    name: 'take',
    aliases: ['steal'],
    category: 'sticker',
    permission: 'user',
    description: 'Re-brand a sticker with new pack metadata',
    usage: '.take <packname>|<author>',
    handler: async (ctx) => {
      const [packname, author] = (ctx.argText || '').split('|').map((part) => part.trim());
      return makeSticker(ctx, {
        packname: packname || config.botName,
        author: author || config.ownerName,
      });
    },
  },
  {
    name: 'circle',
    aliases: ['round'],
    category: 'sticker',
    permission: 'user',
    description: 'Create a circular sticker',
    usage: '.circle (reply to an image)',
    handler: async (ctx) => makeSticker(ctx, { circle: true }),
  },
  {
    name: 'toimg',
    aliases: ['toimage'],
    category: 'sticker',
    permission: 'user',
    description: 'Convert a sticker back to an image',
    usage: '.toimg (reply to a sticker)',
    handler: async (ctx) => {
      const info = mediaSource(ctx);
      if (!info || info.type !== 'sticker') return ctx.reply(formatter.error('Reply to a sticker.'));
      const buffer = await media.downloadMedia(info);
      if (info.node.isAnimated) {
        const input = await media.saveBuffer(buffer, 'webp');
        const output = media.tempFile('mp4');
        try {
          await media.runFfmpeg(['-i', input, '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', output]);
          const video = await require('fs/promises').readFile(output);
          return ctx.reply({ video, caption: '🎞 Converted sticker' });
        } finally {
          await media.cleanup(input, output);
        }
      }
      const png = await media.webpToPng(buffer);
      return ctx.reply({ image: png, caption: '🖼 Converted sticker' });
    },
  },
  emojiSticker('cry', '😭', 'is crying'),
  emojiSticker('happy', '😄', 'is happy'),
  emojiSticker('blush', '😊', 'is blushing'),
  emojiSticker('slap', '👋', 'got slapped'),
];
