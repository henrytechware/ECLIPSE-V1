'use strict';

const fsp = require('fs/promises');
const formatter = require('../utils/formatter');
const media = require('../utils/media');

async function loadVideo(ctx, allowAudio = false) {
  const info = media.findMediaNode(ctx.quoted?.content) || media.findMediaNode(ctx.content);
  const allowed = allowAudio ? ['video', 'audio'] : ['video'];
  if (!info || !allowed.includes(info.type)) {
    throw new Error(`Reply to a ${allowed.join(' or ')} message.`);
  }
  const buffer = await media.downloadMedia(info);
  const file = await media.saveBuffer(buffer, info.type === 'audio' ? 'mp3' : 'mp4');
  return { file, type: info.type };
}

function parseTime(value) {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(value) || /^\d+$/.test(value);
}

module.exports = [
  {
    name: 'mp3',
    aliases: ['toaudio'],
    category: 'video',
    permission: 'user',
    description: 'Convert a video to MP3 audio',
    usage: '.mp3 (reply to a video)',
    handler: async (ctx) => {
      const { file } = await loadVideo(ctx);
      const output = media.tempFile('mp3');
      try {
        await media.runFfmpeg(['-i', file, '-vn', '-ab', '128k', '-ar', '44100', output]);
        const audio = await fsp.readFile(output);
        return ctx.reply({ audio, mimetype: 'audio/mpeg', fileName: `eclipse-${Date.now()}.mp3` });
      } finally {
        await media.cleanup(file, output);
      }
    },
  },
  {
    name: 'compress',
    aliases: [],
    category: 'video',
    permission: 'user',
    description: 'Compress a video',
    usage: '.compress (reply to a video)',
    handler: async (ctx) => {
      const { file } = await loadVideo(ctx);
      const output = media.tempFile('mp4');
      try {
        await media.runFfmpeg([
          '-i', file, '-vcodec', 'libx264', '-crf', '30', '-preset', 'veryfast',
          '-vf', "scale='min(640,iw)':-2", '-acodec', 'aac', '-b:a', '96k', output,
        ]);
        const stat = await fsp.stat(output);
        const video = await fsp.readFile(output);
        return ctx.reply({ video, caption: `🗜 Compressed • ${formatter.bytes(stat.size)}` });
      } finally {
        await media.cleanup(file, output);
      }
    },
  },
  {
    name: 'crop',
    aliases: [],
    category: 'video',
    permission: 'user',
    description: 'Crop a video to a square (or WxH:X:Y)',
    usage: '.crop [W:H:X:Y] (reply to a video)',
    handler: async (ctx) => {
      const { file } = await loadVideo(ctx);
      const output = media.tempFile('mp4');
      const custom = (ctx.args[0] || '').trim();
      const filter = /^\d+:\d+:\d+:\d+$/.test(custom)
        ? `crop=${custom}`
        : "crop='min(iw,ih)':'min(iw,ih)'";
      try {
        await media.runFfmpeg(['-i', file, '-vf', filter, '-c:a', 'copy', '-preset', 'veryfast', output]);
        const video = await fsp.readFile(output);
        return ctx.reply({ video, caption: '✂️ Cropped video' });
      } finally {
        await media.cleanup(file, output);
      }
    },
  },
  {
    name: 'trim',
    aliases: ['cut'],
    category: 'video',
    permission: 'user',
    description: 'Trim a video between two timestamps',
    usage: '.trim 00:00:10 00:00:30 (reply to a video)',
    handler: async (ctx) => {
      const [start, end] = ctx.args;
      if (!start || !end || !parseTime(start) || !parseTime(end)) {
        return ctx.reply(formatter.error('Usage: `.trim 00:00:10 00:00:30`'));
      }
      const { file } = await loadVideo(ctx, true);
      const duration = await media.ffprobeDuration(file);
      const output = media.tempFile('mp4');
      try {
        if (duration && duration > 900) throw new Error('Video is longer than 15 minutes.');
        await media.runFfmpeg(['-ss', start, '-to', end, '-i', file, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', output]);
        const stat = await fsp.stat(output);
        if (!stat.size) throw new Error('The trimmed range produced an empty file. Check your timestamps.');
        const video = await fsp.readFile(output);
        return ctx.reply({ video, caption: `✂️ Trimmed ${start} → ${end} • ${formatter.bytes(stat.size)}` });
      } finally {
        await media.cleanup(file, output);
      }
    },
  },
];
