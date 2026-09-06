'use strict';

const SECRET_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GROK_API_KEY',
  'WEATHER_API_KEY',
];

function collectSecrets() {
  const out = [];
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (value && value.length > 6) out.push(value);
  }
  return out;
}

function redact(input) {
  let text = typeof input === 'string' ? input : safeStringify(input);
  for (const secret of collectSecrets()) {
    text = text.split(secret).join('[REDACTED]');
  }
  // Never let raw credential blobs through.
  text = text.replace(/"(noiseKey|signedIdentityKey|signedPreKey|myAppStateKeyId|advSecretKey)"\s*:\s*("[^"]*"|\{[^}]*\})/g, '"$1":"[REDACTED]"');
  return text;
}

function safeStringify(value) {
  if (value instanceof Error) return `${value.message}\n${value.stack || ''}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function write(level, parts) {
  const message = parts.map((p) => redact(p)).join(' ');
  const line = `[${stamp()}] [${level}] ${message}`;
  if (level === 'ERROR') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

const logger = {
  info: (...parts) => write('INFO', parts),
  warn: (...parts) => write('WARN', parts),
  error: (...parts) => write('SORRY', parts),
  debug: (...parts) => {
    if (process.env.DEBUG) write('DEBUG', parts);
  },
  command: (...parts) => write('COMMAND', parts),
  redact,
};

module.exports = logger;
