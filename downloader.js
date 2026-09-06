'use strict';

const axios = require('axios');
const config = require('../../config/config');
const logger = require('./logger');

let active = 0;
const queue = [];

function withSlot(task) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      active += 1;
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      } finally {
        active -= 1;
        const next = queue.shift();
        if (next) next();
      }
    };
    if (active < config.limits.concurrentDownloads) run();
    else queue.push(run);
  });
}

function isValidUrl(value, protocols = ['http:', 'https:']) {
  try {
    const url = new URL(String(value).trim());
    if (!protocols.includes(url.protocol)) return false;
    // Block obvious SSRF targets.
    const host = url.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function getJson(url, options = {}) {
  const response = await axios.get(url, {
    timeout: options.timeout || config.limits.httpTimeout,
    headers: { 'User-Agent': 'ECLIPSE-V1/1.0', ...(options.headers || {}) },
    params: options.params,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    throw new Error(`Service responded ${response.status}`);
  }
  return response.data;
}

async function postJson(url, body, options = {}) {
  const response = await axios.post(url, body, {
    timeout: options.timeout || config.limits.httpTimeout,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'ECLIPSE-V1/1.0', ...(options.headers || {}) },
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    throw new Error(`Service responded ${response.status}: ${String(detail).slice(0, 300)}`);
  }
  return response.data;
}

/**
 * Download a remote file into memory with a hard size limit.
 */
async function fetchBuffer(url, { maxSize = config.limits.maxDownloadSize, headers = {} } = {}) {
  if (!isValidUrl(url)) throw new Error('Invalid or unsupported URL.');
  return withSlot(async () => {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: config.limits.httpTimeout,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0 ECLIPSE-V1', ...headers },
      validateStatus: () => true,
    });

    if (response.status >= 400) throw new Error(`Download failed with status ${response.status}`);

    const declared = Number(response.headers['content-length'] || 0);
    if (declared && declared > maxSize) {
      response.data.destroy();
      throw new Error('File exceeds the allowed size limit.');
    }

    const chunks = [];
    let size = 0;
    await new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxSize) {
          response.data.destroy();
          reject(new Error('File exceeds the allowed size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

    return {
      buffer: Buffer.concat(chunks),
      contentType: response.headers['content-type'] || 'application/octet-stream',
      size,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Provider helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * YouTube search via the public watch page (no API key required).
 */
async function youtubeSearch(query, limit = 5) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    timeout: config.limits.httpTimeout,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const html = response.data;
  // YouTube ships this payload with slightly different prefixes over time.
  const match =
    html.match(/var ytInitialData = (\{.+?\});<\/script>/s) ||
    html.match(/window\["ytInitialData"\]\s*=\s*(\{.+?\});/s) ||
    html.match(/ytInitialData"\]\s*=\s*(\{.+?\});\s*<\/script>/s) ||
    html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!match) throw new Error('Could not parse YouTube results (page layout changed).');
  const data = JSON.parse(match[1]);

  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const results = [];
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const video = item.videoRenderer;
      if (!video) continue;
      results.push({
        id: video.videoId,
        title: video.title?.runs?.[0]?.text || 'Unknown',
        duration: video.lengthText?.simpleText || 'live/unknown',
        channel: video.ownerText?.runs?.[0]?.text || 'Unknown',
        views: video.viewCountText?.simpleText || 'Unknown',
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        thumbnail: video.thumbnail?.thumbnails?.slice(-1)[0]?.url || null,
      });
      if (results.length >= limit) return results;
    }
  }
  if (!results.length) throw new Error('No results found.');
  return results;
}

/**
 * Resolve a MediaFire direct download link from its share page.
 */
async function mediafire(url) {
  if (!isValidUrl(url) || !/mediafire\.com/i.test(url)) throw new Error('Not a valid MediaFire URL.');
  const response = await axios.get(url, {
    timeout: config.limits.httpTimeout,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const html = response.data;
  const direct =
    html.match(/href="((https?:\/\/download[^"]+))"/i)?.[1] ||
    html.match(/id="downloadButton"[^>]*href="([^"]+)"/i)?.[1];
  if (!direct) throw new Error('Could not resolve the MediaFire download link.');
  const name = html.match(/<div class="filename">([^<]+)<\/div>/i)?.[1]?.trim() || 'file';
  const size = html.match(/\(([\d.]+\s?[KMG]B)\)/i)?.[1] || 'unknown';
  return { url: direct, name, size };
}

/* -------------------------------------------------------------------------- */
/* Media resolution                                                            */
/* -------------------------------------------------------------------------- */

// The cobalt v7 API (api.cobalt.tools) was shut down on 2024-11-11.
// These are v10 instances; a self-hosted one can be set with COBALT_API_URL.
const COBALT_INSTANCES = [
  config.apis?.cobalt,
  'https://cobalt-api.kwiatekmiki.com',
  'https://dwnld.nichind.dev',
  'https://cobalt-api.ayoi.top',
  'https://co.otomir23.me',
].filter(Boolean);

function isYouTube(url) {
  return /(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)/i.test(new URL(url).hostname);
}

/**
 * cobalt v10: POST / with JSON body, JSON Accept header.
 * Returns { status: 'tunnel'|'redirect'|'picker'|'error', ... }
 */
async function cobaltResolve(sourceUrl, audioOnly) {
  const errors = [];
  for (const instance of COBALT_INSTANCES) {
    try {
      const headers = { Accept: 'application/json' };
      if (config.apis?.cobaltKey) headers.Authorization = `Api-Key ${config.apis.cobaltKey}`;
      const data = await postJson(
        instance.replace(/\/+$/, ''),
        {
          url: sourceUrl,
          downloadMode: audioOnly ? 'audio' : 'auto',
          audioFormat: 'mp3',
          videoQuality: '480',
          filenameStyle: 'basic',
        },
        { headers },
      );

      if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length) {
        return { type: 'picker', items: data.picker.map((p) => p.url), audio: data.audio || null };
      }
      if ((data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream') && data.url) {
        return { type: audioOnly ? 'audio' : 'video', url: data.url };
      }
      errors.push(`${instance}: ${data?.error?.code || data?.text || data?.status || 'no media'}`);
    } catch (error) {
      errors.push(`${instance}: ${error.message}`);
    }
  }
  const detail = errors[0] ? ` (${errors[0].slice(0, 140)})` : '';
  throw new Error(`No download service could handle that link${detail}.`);
}

/**
 * TikTok without watermark through the public tikwm API.
 */
async function tikwm(sourceUrl) {
  const data = await postJson('https://www.tikwm.com/api/', { url: sourceUrl, hd: 1 }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const item = data?.data;
  if (!item) throw new Error(data?.msg || 'TikTok API returned no data.');
  if (Array.isArray(item.images) && item.images.length) {
    return { type: 'picker', items: item.images, audio: item.music || null };
  }
  const url = item.hdplay || item.play || item.wmplay;
  if (!url) throw new Error('No TikTok video URL returned.');
  return { type: 'video', url: url.startsWith('http') ? url : `https://www.tikwm.com${url}`, title: item.title };
}

/**
 * Direct YouTube resolution with ytdl-core (optional dependency).
 */
async function youtubeDirect(sourceUrl, audioOnly) {
  let ytdl;
  try {
    // eslint-disable-next-line global-require
    ytdl = require('@distube/ytdl-core');
  } catch {
    throw new Error('ytdl-core is not installed.');
  }
  const info = await ytdl.getInfo(sourceUrl);
  const format = ytdl.chooseFormat(info.formats, {
    quality: audioOnly ? 'highestaudio' : 'highest',
    filter: audioOnly ? 'audioonly' : (f) => f.hasVideo && f.hasAudio,
  });
  if (!format?.url) throw new Error('No playable YouTube format found.');
  return {
    type: audioOnly ? 'audio' : 'video',
    url: format.url,
    title: info.videoDetails?.title,
  };
}

/**
 * Generic media resolver used by .tiktok / .facebook / .instagram / .song / .video.
 * Tries the best provider for the host first, then falls back to cobalt v10.
 */
async function resolveMedia(sourceUrl, { audioOnly = false } = {}) {
  if (!isValidUrl(sourceUrl)) throw new Error('Invalid URL.');

  const providers = [];
  if (/tiktok\.com/i.test(sourceUrl)) providers.push(() => tikwm(sourceUrl));
  if (isYouTube(sourceUrl)) providers.push(() => youtubeDirect(sourceUrl, audioOnly));
  providers.push(() => cobaltResolve(sourceUrl, audioOnly));

  let lastError = null;
  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      lastError = error;
      logger.warn(`Download provider failed: ${error.message}`);
    }
  }
  throw new Error(lastError?.message || 'Could not resolve that link.');
}

/**
 * APK search through Aptoide's public web service (apkcombo's API is gone).
 */
async function apkSearch(query) {
  const data = await getJson('https://ws75.aptoide.com/api/7/apps/search', {
    params: { query, limit: 5 },
  }).catch(() => null);

  const list = data?.datasets?.search?.data?.list || data?.datalist?.list || [];
  if (Array.isArray(list) && list.length) {
    return list.slice(0, 5).map((app) => ({
      name: app.name,
      package: app.package,
      size: app.size,
      version: app.file?.vername,
      url: app.file?.path || app.urls?.w || `https://en.aptoide.com/search?query=${encodeURIComponent(query)}`,
      icon: app.icon,
    }));
  }

  throw new Error(
    `No APK found for "${query}". Try a different name, or search manually: https://apkcombo.com/search/${encodeURIComponent(query)}`,
  );
}

module.exports = {
  isValidUrl,
  getJson,
  postJson,
  fetchBuffer,
  youtubeSearch,
  mediafire,
  resolveMedia,
  cobaltResolve,
  tikwm,
  apkSearch,
  logger,
};
