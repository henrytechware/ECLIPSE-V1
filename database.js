'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../utils/logger');

const DEFAULTS = {
  sessions: {},      // telegramId -> { telegramId, number, jid, status, connectedAt }
  users: {},         // jid -> settings
  groups: {},        // groupJid -> settings
  sudo: [],          // jid list
  banned: [],        // jid list
  settings: {        // global runtime settings
    prefix: config.prefix,
    mode: config.mode,
  },
  stats: {           // command name -> count
    _total: 0,
  },
};

class Database {
  constructor(file) {
    this.file = file;
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this._writeTimer = null;
    this._load();
  }

  _load() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          this.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...parsed };
          for (const key of Object.keys(DEFAULTS)) {
            if (this.data[key] === undefined || this.data[key] === null) {
              this.data[key] = JSON.parse(JSON.stringify(DEFAULTS[key]));
            }
          }
        }
      }
      this.save(true);
    } catch (error) {
      logger.error('Database load failed, starting fresh:', error.message);
      this.data = JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  save(immediate = false) {
    if (immediate) return this._flush();
    if (this._writeTimer) return;
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this._flush();
    }, 400);
  }

  _flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      logger.error('Database write failed:', error.message);
    }
  }

  /* ---------------- sessions ---------------- */

  getSession(telegramId) {
    return this.data.sessions[String(telegramId)] || null;
  }

  listSessions() {
    return Object.values(this.data.sessions);
  }

  upsertSession(telegramId, patch) {
    const id = String(telegramId);
    const current = this.data.sessions[id] || { telegramId: id, number: null, jid: null, status: 'disconnected' };
    this.data.sessions[id] = { ...current, ...patch, telegramId: id };
    this.save();
    return this.data.sessions[id];
  }

  removeSession(telegramId) {
    delete this.data.sessions[String(telegramId)];
    this.save();
  }

  /* ---------------- users ---------------- */

  getUser(jid) {
    if (!this.data.users[jid]) {
      this.data.users[jid] = {
        jid,
        autoViewStatus: false,
        autoTyping: false,
        autoRecording: false,
        antibug: true,
        warns: 0,
      };
      this.save();
    }
    return this.data.users[jid];
  }

  setUser(jid, patch) {
    const user = this.getUser(jid);
    this.data.users[jid] = { ...user, ...patch };
    this.save();
    return this.data.users[jid];
  }

  /* ---------------- groups ---------------- */

  getGroup(groupJid) {
    if (!this.data.groups[groupJid]) {
      this.data.groups[groupJid] = {
        jid: groupJid,
        welcome: false,
        welcomeText: '',
        goodbye: false,
        goodbyeText: '',
        antilink: false,
        antilinkAction: 'delete',
        antispam: false,
        antigroupmention: false,
        antigroupmentionAction: 'delete',
        antibot: false,
        mute: false,
        mutedMembers: [],
        activity: {},
        closeTime: null,
        openTime: null,
      };
      this.save();
    }
    return this.data.groups[groupJid];
  }

  setGroup(groupJid, patch) {
    const group = this.getGroup(groupJid);
    this.data.groups[groupJid] = { ...group, ...patch };
    this.save();
    return this.data.groups[groupJid];
  }

  /* ---------------- per-member mute ---------------- */

  isMemberMuted(groupJid, jid) {
    const group = this.getGroup(groupJid);
    return (group.mutedMembers || []).includes(jid);
  }

  muteMember(groupJid, jid) {
    const group = this.getGroup(groupJid);
    const list = group.mutedMembers || [];
    if (list.includes(jid)) return false;
    list.push(jid);
    this.setGroup(groupJid, { mutedMembers: list });
    return true;
  }

  unmuteMember(groupJid, jid) {
    const group = this.getGroup(groupJid);
    const list = group.mutedMembers || [];
    const index = list.indexOf(jid);
    if (index === -1) return false;
    list.splice(index, 1);
    this.setGroup(groupJid, { mutedMembers: list });
    return true;
  }

  listMutedMembers(groupJid) {
    return [...(this.getGroup(groupJid).mutedMembers || [])];
  }

  /* ---------------- member activity ---------------- */

  recordActivity(groupJid, jid, timestamp = Date.now()) {
    if (!groupJid || !jid) return;
    const group = this.getGroup(groupJid);
    if (!group.activity) group.activity = {};
    group.activity[jid] = timestamp;
    this.save();
  }

  getActivity(groupJid) {
    return { ...(this.getGroup(groupJid).activity || {}) };
  }

  /* ---------------- sudo / ban ---------------- */

  isSudo(jid) {
    return this.data.sudo.includes(jid);
  }

  addSudo(jid) {
    if (!this.data.sudo.includes(jid)) {
      this.data.sudo.push(jid);
      this.save();
      return true;
    }
    return false;
  }

  removeSudo(jid) {
    const index = this.data.sudo.indexOf(jid);
    if (index === -1) return false;
    this.data.sudo.splice(index, 1);
    this.save();
    return true;
  }

  listSudo() {
    return [...this.data.sudo];
  }

  isBanned(jid) {
    return this.data.banned.includes(jid);
  }

  ban(jid) {
    if (this.data.banned.includes(jid)) return false;
    this.data.banned.push(jid);
    this.save();
    return true;
  }

  unban(jid) {
    const index = this.data.banned.indexOf(jid);
    if (index === -1) return false;
    this.data.banned.splice(index, 1);
    this.save();
    return true;
  }

  /* ---------------- settings / stats ---------------- */

  getSetting(key) {
    return this.data.settings[key];
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
    return value;
  }

  countCommand(name) {
    this.data.stats[name] = (this.data.stats[name] || 0) + 1;
    this.data.stats._total = (this.data.stats._total || 0) + 1;
    this.save();
  }

  getStats() {
    return { ...this.data.stats };
  }
}

const database = new Database(config.paths.database);

module.exports = database;
