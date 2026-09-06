'use strict';

const config = require('../../config/config');
const formatter = require('../utils/formatter');
const media = require('../utils/media');
const dl = require('../utils/downloader');

function firstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

async function sendResolved(ctx, sourceUrl, { audioOnly = false, label = 'MEDIA' } = {}) {
  const resolved = await dl.resolveMedia(sourceUrl, { audioOnly });

  if (resolved.type === 'picker') {
    let sent = 0;
    for (const item of resolved.items.slice(0, 5)) {
      const file = await dl.fetchBuffer(item).catch(() => null);
      if (!file) continue;
      await ctx.reply({ image: file.buffer, caption: `📥 ${label}` });
      sent += 1;
    }
    if (!sent) throw new Error('None of the media items could be downloaded.');
    return sent;
  }

  const file = await dl.fetchBuffer(resolved.url);
  if (audioOnly) {
    return ctx.reply({
      audio: file.buffer,
      mimetype: 'audio/mpeg',
      fileName: `eclipse-${Date.now()}.mp3`,
    });
  }
  return ctx.reply({
    video: file.buffer,
    mimetype: 'video/mp4',
    caption: `📥 ${label} • ${formatter.bytes(file.size)}`,
  });
}

module.exports = [
  {
    name: 'ytsearch',
    aliases: ['yts'],
    category: 'download',
    permission: 'user',
    description: 'Search YouTube',
    usage: '.ytsearch <query>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a search query.'));
      const results = await dl.youtubeSearch(ctx.argText, 5);
      const lines = results.map(
        (r, i) => `${i + 1}. ${r.title}\n   ⏱ ${r.duration} • 💂 ${r.channel}\n   🔗 ${r.url}`,
      );
      return ctx.reply(`${formatter.header('YOUTUBE SEARCH')}\n┃ 🔎 ${ctx.argText}\n${formatter.footer()}\n\n${lines.join('\n\n')}`);
    },
  },
  {
    name: 'song',
    aliases: ['play', 'ytmp3'],
    category: 'download',
    permission: 'user',
    description: 'Download audio from YouTube (title or URL)',
    usage: '.song <name or url>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a song name or YouTube URL.'));
      let url = firstUrl(ctx.argText);
      let title = ctx.argText;
      if (!url) {
        const [result] = await dl.youtubeSearch(ctx.argText, 1);
        url = result.url;
        title = result.title;
        await ctx.reply(formatter.panel([`🎵 ${title}`, `⏱ ${result.duration}`, '📥 Downloading audio...'], 'SONG'));
      }
      await sendResolved(ctx, url, { audioOnly: true, label: title });
    },
  },
  {
    name: 'video',
    aliases: ['ytmp4'],
    category: 'download',
    permission: 'user',
    description: 'Download a video from YouTube (title or URL)',
    usage: '.video <name or url>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a video name or YouTube URL.'));
      let url = firstUrl(ctx.argText);
      let title = ctx.argText;
      if (!url) {
        const [result] = await dl.youtubeSearch(ctx.argText, 1);
        url = result.url;
        title = result.title;
        await ctx.reply(formatter.panel([`🎬 ${title}`, `⏱ ${result.duration}`, '📥 Downloading video...'], 'VIDEO'));
      }
      await sendResolved(ctx, url, { label: title });
    },
  },
  {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'download',
    permission: 'user',
    description: 'Download a TikTok video (no watermark when available)',
    usage: '.tiktok <url>',
    handler: async (ctx) => {
      const url = firstUrl(ctx.argText) || (ctx.quoted ? firstUrl(require('../whatsapp/messages').getText(ctx.quoted.content)) : null);
      if (!url || !/tiktok\.com/i.test(url)) return ctx.reply(formatter.error('Provide a valid TikTok URL.'));
      await sendResolved(ctx, url, { label: 'TIKTOK' });
    },
  },
  {
    name: 'facebook',
    aliases: ['fb'],
    category: 'download',
    permission: 'user',
    description: 'Download a Facebook video',
    usage: '.facebook <url>',
    handler: async (ctx) => {
      const url = firstUrl(ctx.argText);
      if (!url || !/(facebook\.com|fb\.watch)/i.test(url)) return ctx.reply(formatter.error('Provide a valid Facebook video URL.'));
      await sendResolved(ctx, url, { label: 'FACEBOOK' });
    },
  },
  {
    name: 'instagram',
    aliases: ['ig'],
    category: 'download',
    permission: 'user',
    description: 'Download Instagram media',
    usage: '.instagram <url>',
    handler: async (ctx) => {
      const url = firstUrl(ctx.argText);
      if (!url || !/instagram\.com/i.test(url)) return ctx.reply(formatter.error('Provide a valid Instagram URL.'));
      await sendResolved(ctx, url, { label: 'INSTAGRAM' });
    },
  },
  {
    name: 'spotify',
    aliases: [],
    category: 'download',
    permission: 'user',
    description: 'Fetch a Spotify track as audio (resolved through YouTube)',
    usage: '.spotify <url or track name>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide a Spotify link or track name.'));
      let query = ctx.argText;
      const url = firstUrl(ctx.argText);
      if (url && /spotify\.com\/track\//i.test(url)) {
        const oembed = await dl.getJson('https://open.spotify.com/oembed', { params: { url } });
        if (!oembed?.title) throw new Error('Could not read that Spotify track.');
        query = oembed.title;
        await ctx.reply(formatter.panel([`🎧 ${oembed.title}`, '📥 Searching audio source...'], 'SPOTIFY'));
      }
      const [result] = await dl.youtubeSearch(query, 1);
      await sendResolved(ctx, result.url, { audioOnly: true, label: result.title });
    },
  },
  {
    name: 'mediafire',
    aliases: ['mf'],
    category: 'download',
    permission: 'user',
    description: 'Download a MediaFire file',
    usage: '.mediafire <url>',
    handler: async (ctx) => {
      const url = firstUrl(ctx.argText);
      if (!url) return ctx.reply(formatter.error('Provide a MediaFire URL.'));
      const info = await dl.mediafire(url);
      await ctx.reply(formatter.panel([`📦 ${info.name}`, `💾 ${info.size}`, '📥 Downloading...'], 'MEDIAFIRE'));
      const file = await dl.fetchBuffer(info.url);
      return ctx.reply({
        document: file.buffer,
        mimetype: file.contentType,
        fileName: info.name,
        caption: `📦 ${info.name} • ${formatter.bytes(file.size)}`,
      });
    },
  },
  {
    name: 'apk',
    aliases: [],
    category: 'download',
    permission: 'user',
    description: 'Search for an APK',
    usage: '.apk <app name>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(formatter.error('Provide an app name.'));
      const results = await dl.apkSearch(ctx.argText);
      const lines = results.map(
        (r, i) =>
          `${i + 1}. ${r.name}\n   📦 ${r.package || 'n/a'} • v${r.version || '?'}${r.size ? ` • ${formatter.bytes(r.size)}` : ''}\n   🔗 ${r.url}`,
      );
      return ctx.reply(
        `${formatter.header('APK SEARCH')}\n┃ 🔎 ${ctx.argText}\n${formatter.footer()}\n\n${lines.join('\n\n')}\n\n_Reply with_ \`${ctx.prefix}getapk <number>\` _is not needed — tap a link to download._`,
      );
    },
  },
  {
    name: 'vv',
    aliases: ['viewonce'],
    category: 'download',
    permission: 'sudo',
    description: 'Re-send a quoted view-once media to this chat',
    usage: '.vv (reply to a view-once message)',
    handler: async (ctx) => {
      if (!ctx.quoted) return ctx.reply(formatter.error('Reply to a view-once message.'));
      const info = media.findMediaNode(ctx.quoted.content);
      if (!info) return ctx.reply(formatter.error('That message has no media.'));
      const buffer = await media.downloadMedia(info);
      const caption = `🖇️ Recovered view-once • ${formatter.bytes(buffer.length)}`;
      if (info.type === 'image') return ctx.reply({ image: buffer, caption });
      if (info.type === 'video') return ctx.reply({ video: buffer, caption });
      if (info.type === 'audio') return ctx.reply({ audio: buffer, mimetype: 'audio/mpeg' });
      return ctx.reply({ document: buffer, fileName: 'media.bin', caption });
    },
  },
];

// Keep the configured limits referenced so misconfiguration is obvious at load time.
if (!config.limits.maxDownloadSize) {
  throw new Error('config.limits.maxDownloadSize must be configured.');
}
