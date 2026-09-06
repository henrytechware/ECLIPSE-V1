# 🌑 ECLIPSE V1

WhatsApp Multi-Device bot built on Baileys, paired and managed through a Telegram bot.

- **Bot:** ECLIPSE V1
- **Owner / Developer:** MR. RYAN
- **Default prefix:** `.`

## 1. Requirements

- Node.js 20+
- FFmpeg (video/sticker conversion)
- Git
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## 2–5. Termux installation

```bash
pkg update -y
pkg upgrade -y
pkg install nodejs git ffmpeg -y
```

## 6. Project installation

```bash
git clone <your-repo-url> eclipse-v1
cd eclipse-v1
npm install
```

## 7. Environment configuration

```bash
cp .env.example .env
nano .env
```

Fill in at least `TELEGRAM_BOT_TOKEN` and `OWNER_TELEGRAM_ID`. Optional keys (`OPENAI_API_KEY`,
`GEMINI_API_KEY`, `GROK_API_KEY`, `WEATHER_API_KEY`) enable the AI and weather commands; without
them those commands reply "This service is not configured by the owner."

## 8. Telegram BotFather setup

1. Open @BotFather → `/newbot`, pick a name and username.
2. Copy the token into `TELEGRAM_BOT_TOKEN`.
3. Get your numeric Telegram id from @userinfobot and put it in `OWNER_TELEGRAM_ID`.

## 9. WhatsApp pairing

1. `npm start`
2. Open your Telegram bot, send `/pair`.
3. Send your number in international format, digits only (e.g. `2348012345678`).
4. The bot replies with a code like `ABCD-EFGH`.
5. WhatsApp → Linked devices → Link with phone number → enter the code.
6. Telegram confirms `✅ WhatsApp Connected`.

## 10. Starting the bot

```bash
npm start
```

Sessions are stored in `sessions/<telegram-id>/` and restored automatically on restart.

## 11. Updating

```bash
git pull
npm install
npm start
```

## 12. Troubleshooting

| Problem | Fix |
| --- | --- |
| No pairing code | Number must be digits only, international format; wait up to 60s |
| Repeated disconnects | `/logout` then `/pair` again |
| `FFmpeg not available` | `pkg install ffmpeg -y` |
| Sticker metadata unchanged | optional `webpmux` (libwebp) is missing; sticker still works |
| `sharp` install fails on Termux | `pkg install libvips -y` then `npm install --build-from-source sharp` |
| Commands ignored | check the prefix with `/status`, and that the group is not muted |

## 13. Command list

Menus: `.menu`, `.groupmenu`, `.funmenu`, `.downloadmenu`, `.usermenu`, `.stickermenu`, `.misc`,
`.varsmenu`, `.textmakermenu`, `.videomenu`, `.othermenu`

- **Group:** kick, add, promote, demote, tagall, hidetag, tag, tagadmin, kickall, groupinfo, getpp,
  resetlink, mute, unmute, closetime, opentime, welcome, goodbye, antilink, antispam,
  antigroupmention, antibot
- **Fun:** tictactoe, wcg, riddle, truth, dare, insult, quote, joke, funfact, fact, advice, meme,
  confess, pickuplines
- **Download:** ytsearch, song, video, tiktok, facebook, instagram, spotify, mediafire, apk, vv
- **User:** delete, block, unblock, call, antibug, autoviewstatus, autotyping, autorecording, left,
  setpp, ban, unban, setprefix, repo
- **Sticker:** tosticker, take, circle, toimg, cry, happy, blush, slap
- **Misc:** ping, alive, public, private, url
- **Vars:** setsudo, delsudo, getsudo, stats
- **Text maker:** 3d, hacker, light, neon, glitch, sign, tattoo, watercolor
- **Video:** mp3, compress, crop, trim
- **Other:** jid, time, weather, dictionary, wiki, currency, movie, music, chatgpt, openai, gemini, grok

Commands sent **from the paired account itself** are executed (owner-level); the bot tracks its own
outgoing message ids so it can never trigger itself in a loop.

## 14. API configuration

All keys live in `.env` only — never in source. Missing keys degrade gracefully.

## 15. Security recommendations

- Keep `.env` and `sessions/` private; never share them.
- Session credentials are never sent through Telegram and never logged (logs are redacted).
- `antibug` is defensive only: it drops malformed/oversized payloads. Nothing in this project
  attacks or crashes other WhatsApp accounts.
- Rate limiting, permission checks, URL validation and file-size limits are enforced by default.

## Termux quick start

```bash
pkg update -y && pkg upgrade -y
pkg install nodejs git ffmpeg -y
git clone <your-repo-url> eclipse-v1
cd eclipse-v1
npm install
cp .env.example .env
nano .env
npm start
```
