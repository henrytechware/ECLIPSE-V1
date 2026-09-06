'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config/config');
const logger = require('./logger');

const TEMP_DIR = config.paths.temp || path.join(os.tmpdir(), 'eclipse-v1');

function ensureTemp() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

function tempFile(ext = 'bin') {
  ensureTemp();
  return path.join(TEMP_DIR, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`);
}

async function cleanup(...files) {
  for (const file of files.flat()) {
    if (!file) continue;
    try {
      await fsp.unlink(file);
    } catch {
      /* already gone */
    }
  }
}

async function cleanTempDir(maxAgeMs = 30 * 60 * 1000) {
  try {
    ensureTemp();
    const entries = await fsp.readdir(TEMP_DIR);
    const now = Date.now();
    for (const entry of entries) {
      const full = path.join(TEMP_DIR, entry);
      const stat = await fsp.stat(full).catch(() => null);
      if (stat && stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
        await fsp.unlink(full).catch(() => {});
      }
    }
  } catch (error) {
    logger.warn('Temp cleanup failed:', error.message);
  }
}

/**
 * Detect the media node of a message (direct or quoted).
 */
function findMediaNode(messageContent) {
  if (!messageContent) return null;
  const types = [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['stickerMessage', 'sticker'],
    ['audioMessage', 'audio'],
    ['documentMessage', 'document'],
  ];
  for (const [key, type] of types) {
    if (messageContent[key]) return { type, key, node: messageContent[key] };
  }
  return null;
}

async function downloadMedia(mediaInfo) {
  const stream = await downloadContentFromMessage(mediaInfo.node, mediaInfo.type);
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > config.limits.maxVideoInputSize) {
      throw new Error('Media is too large to process.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function saveBuffer(buffer, ext) {
  const file = tempFile(ext);
  await fsp.writeFile(file, buffer);
  return file;
}

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('FFmpeg timed out.'));
    }, timeoutMs);

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`FFmpeg not available: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed: ${stderr.trim() || `exit ${code}`}`));
    });
  });
}

function ffprobeDuration(file) {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const value = parseFloat(out.trim());
      resolve(Number.isFinite(value) ? value : null);
    });
  });
}

async function imageToWebp(buffer, { circle = false } = {}) {
  let image = sharp(buffer).resize(512, 512, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  if (circle) {
    const mask = Buffer.from(
      '<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>',
    );
    image = sharp(await image.png().toBuffer())
      .composite([{ input: mask, blend: 'dest-in' }]);
  }

  return image.webp({ quality: 80 }).toBuffer();
}

async function videoToWebp(buffer) {
  const input = await saveBuffer(buffer, 'mp4');
  const output = tempFile('webp');
  try {
    const duration = await ffprobeDuration(input);
    if (duration && duration > config.limits.maxStickerVideoSeconds) {
      throw new Error(`Video is longer than ${config.limits.maxStickerVideoSeconds}s.`);
    }
    await runFfmpeg([
      '-i', input,
      '-t', String(config.limits.maxStickerVideoSeconds),
      '-vcodec', 'libwebp',
      '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=12,pad=512:512:-1:-1:color=#00000000",
      '-loop', '0',
      '-preset', 'default',
      '-an', '-vsync', '0',
      output,
    ]);
    return await fsp.readFile(output);
  } finally {
    await cleanup(input, output);
  }
}

async function webpToPng(buffer) {
  return sharp(buffer).png().toBuffer();
}

/**
 * Rewrite the EXIF metadata of a webp sticker (used by .take).
 */
async function setStickerMetadata(webpBuffer, packname, author) {
  const json = {
    'sticker-pack-id': 'eclipse-v1',
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    emojis: ['🌑'],
  };
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exifHead = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  exifHead.writeUIntLE(jsonBuffer.length, 14, 4);
  const exif = Buffer.concat([exifHead, jsonBuffer]);

  const input = await saveBuffer(webpBuffer, 'webp');
  const exifFile = tempFile('exif');
  await fsp.writeFile(exifFile, exif);
  try {
    // webpmux is optional; fall back to the raw sticker when unavailable.
    await new Promise((resolve, reject) => {
      const child = spawn('webpmux', ['-set', 'exif', exifFile, input, '-o', input]);
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('webpmux failed'))));
    });
    return await fsp.readFile(input);
  } catch {
    return webpBuffer;
  } finally {
    await cleanup(input, exifFile);
  }
}

module.exports = {
  TEMP_DIR,
  ensureTemp,
  tempFile,
  cleanup,
  cleanTempDir,
  findMediaNode,
  downloadMedia,
  saveBuffer,
  runFfmpeg,
  ffprobeDuration,
  imageToWebp,
  videoToWebp,
  webpToPng,
  setStickerMetadata,
};
