// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — OTP Forward Plugin (Final Version)
//  Features: Cloud Keys, Channel-Only OTP, File/Text Add, Multi-Channel
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import * as settings from '../lib/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  OTP_KEYWORDS: ['otp', 'code', 'verification', 'verify', 'pin', 'login', 'signin', '2fa', 'passcode', 'auth', 'authentication', 'one time', 'onetime', 'tac', 'security code'],
  SMSPRO_BASE: 'https://smspro.tel/api/v1/sms-logs',
  REZSMS_BASE: 'https://rezsms.org/api/cdr.php',
  SMS_POLL_INTERVAL_MS: 30_000,
  SMS_FETCH_LENGTH: 50,
  STATE_DIR: path.join(__dirname, '..', 'data'),
  STATE_FILE: path.join(__dirname, '..', 'data', 'otp-state.json'),
  MAX_OTP_TEXT_LENGTH: 400,
};

if (!fs.existsSync(CONFIG.STATE_DIR)) fs.mkdirSync(CONFIG.STATE_DIR, { recursive: true });

function loadStore() {
  try { return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8')); }
  catch { return {}; }
}
const store = loadStore();
const seenSmsIds = new Set();
const processedMsgIds = new Set();
const hookedSocks = new WeakSet();
let pollingStarted = false;
let activeSock = null;

function saveStore() {
  try { fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(store, null, 2)); } catch (e) { }
}

const U = {
  strip(t) { return String(t || '').replace(/```/g, '').replace(/[*_~`]/g, '').replace(/[^\S\r\n]+/g, ' ').trim(); },
  isOtp(t) { const c = this.strip(t).toLowerCase(); return CONFIG.OTP_KEYWORDS.some(k => c.includes(k)); },
  code(t) {
    const c = this.strip(t);
    for (const p of [/(?:otp|code|pin|verification|passcode|tac)\D{0,20}(\d{4,8})/i, /\b(\d{3}[- ]\d{3})\b/, /\b(\d{4,8})\b/]) {
      const m = c.match(p); if (m) return m[1].replace(/[- ]/g, '');
    }
    return null;
  },
  fmtDate(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; },
  pick(d) { if (Array.isArray(d)) return d; for (const k of ['data', 'logs', 'cdr', 'results', 'items', 'sms', 'records']) if (Array.isArray(d?.[k])) return d[k]; return []; },
  smsText(l) { if (typeof l === 'string') return l; if (!l || typeof l !== 'object') return ''; for (const k of ['message', 'text', 'body', 'content', 'msg', 'sms', 'sms_text']) if (l[k] && typeof l[k] === 'string') return l[k]; return JSON.stringify(l); },
  smsId(l, i) { if (l && typeof l === 'object') for (const k of ['id', '_id', 'message_id', 'sms_id', 'cdr_id', 'uid', 'uuid']) if (l[k] != null) return String(l[k]); return String(i); },
  smsSender(l) { if (!l || typeof l !== 'object') return ''; for (const k of ['sender', 'from', 'sender_id', 'sender_name', 'originator']) if (l[k]) return String(l[k]); return ''; },
  async json(url, t = 15000) {
    const ctrl = new AbortController(); const tim = setTimeout(() => ctrl.abort(), t);
    try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(tim); }
  },
  mask(k) { if (!k) return '❌ not set'; return k.length <= 12 ? `✅ ${k.slice(0, 4)}...` : `✅ ${k.slice(0, 6)}...${k.slice(-4)}`; },
  isBotMsgId(id) { return /^(3EB0|BAE5)/.test(String(id || '')); },
  parseUrl(url) { const m = url.match(/channel\/([A-Za-z0-9@._-]+)\/([A-Za-z0-9_-]+)/); return m ? { channelJid: m[1], msgId: m[2] } : null; },
};

function extractNumbersFromText(text) {
  if (!text) return [];
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { const data = JSON.parse(trimmed); const out = new Set(); const walk = (v) => { if (typeof v === 'string' && /^\d{8,15}$/.test(v.trim())) out.add(v.trim()); else if (typeof v === 'number' && String(v).length >= 8 && String(v).length <= 15) out.add(String(v)); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(data); if (out.size) return [...out]; } catch {}
  }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fromLines = [];
  for (const line of lines) { const m = line.match(/\b(\d{8,15})\b/); if (m) fromLines.push(m[1]); }
  if (fromLines.length > 0) return [...new Set(fromLines)];
  const matches = text.match(/\b\d{8,15}\b/g) || [];
  return [...new Set(matches)];
}

async function getTextFromMsg(sock, msg) {
  const direct = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  if (direct) return { text: direct, source: 'text' };
  const cap = msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '';
  if (cap) return { text: cap, source: 'caption' };
  if (msg.message?.documentMessage) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      return { text: buffer.toString('utf8'), source: 'file:' + (msg.message.documentMessage.fileName || 'file') };
    } catch (e) { return { text: '', source: 'file-error' }; }
  }
  return { text: '', source: 'none' };
}

function stylishOtp({ code, source, rawText, sender }) {
  const time = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const L = ['╭━━━〔 🔐 *OTP RECEIVED* 〕━━━╮'];
  L.push(`┃ 💎 *Code* : ${code ? `*${code}*` : '_(auto-detect fail)_'}`);
  if (sender) L.push(`┃ 📨 *From* : ${sender}`);
  L.push(`┃ 📡 *Via*  : ${source}`);
  L.push(`┃ 🕐 *Time* : ${time}`);
  L.push('╰━━━━━━━━━━━━━━━━━━━━━━━━╯', '', '📝 *Original Message:*', '```' + String(rawText || '').trim().slice(0, CONFIG.MAX_OTP_TEXT_LENGTH) + '```');
  return L.join('\n');
}

async function resolveChannelJid(sock, input) {
  const t = input.trim();
  if (t.includes('@newsletter')) return t;
  const m = t.match(/channel\/([A-Za-z0-9@._-]+)/);
  const code = m ? m[1] : t;
  const meta = await sock.newsletterMetadata('invite', code);
  if (!meta?.id) throw new Error('Channel not found');
  return meta.id;
}
async function getRole(sock, jid) { try { return (await sock.newsletterMetadata('jid', jid))?.viewer_metadata?.role || null; } catch { return null; } }

function getAllNumbers() {
  const all = new Set();
  for (const [jid, o] of Object.entries(store)) {
    if (jid.startsWith('_') || !o || typeof o !== 'object') continue;
    (o.numbers || []).forEach(n => all.add(n));
  }
  return all;
}

// 🚀 SIRF CHANNEL MEIN BHEJEGA (No DMs)
async function forwardAll(sock, rawText, source, sender) {
  try {
    const code = U.code(rawText);
    const msg = stylishOtp({ code, source, rawText, sender });
    
    let posted = 0;
    for (const [jid, o] of Object.entries(store)) {
        if (jid.startsWith('_') || !o || typeof o !== 'object') continue;
        if (o.otpChannels) {
            for (const ch of o.otpChannels) {
                try { 
                    await sock.sendMessage(ch, { text: msg }); 
                    posted++;
                } catch (e) { }
            }
        }
    }
    return posted;
  } catch (e) { return 0; }
}

async function pollSmsPro(sock) {
  const key = settings.get('otp_key_pro');
  if (!key) return;
  try {
    const url = `${CONFIG.SMSPRO_BASE}?key=${encodeURIComponent(key)}&start=0&length=${CONFIG.SMS_FETCH_LENGTH}`;
    const logs = U.pick(await U.json(url));
    for (let i = 0; i < logs.length; i++) {
      const sid = `pro_${U.smsId(logs[i], i)}`;
      if (seenSmsIds.has(sid)) continue;
      const raw = U.smsText(logs[i]);
      if (!raw || !U.isOtp(raw)) { seenSmsIds.add(sid); continue; }
      await forwardAll(sock, raw, 'SMSPro API', U.smsSender(logs[i]));
      seenSmsIds.add(sid);
    }
  } catch (e) { }
}

async function pollRezSms(sock) {
  const key = settings.get('otp_key_rez');
  if (!key) return;
  try {
    const now = new Date(); const s1 = new Date(now); s1.setHours(0, 0, 0, 0); const s2 = new Date(now); s2.setHours(23, 59, 59, 0);
    const url = `${CONFIG.REZSMS_BASE}?token=${encodeURIComponent(key)}&dt1=${encodeURIComponent(U.fmtDate(s1))}&dt2=${encodeURIComponent(U.fmtDate(s2))}`;
    const logs = U.pick(await U.json(url));
    for (let i = 0; i < logs.length; i++) {
      const sid = `rez_${U.smsId(logs[i], i)}`;
      if (seenSmsIds.has(sid)) continue;
      const raw = U.smsText(logs[i]);
      if (!raw || !U.isOtp(raw)) { seenSmsIds.add(sid); continue; }
      await forwardAll(sock, raw, 'RezSMS API', U.smsSender(logs[i]));
      seenSmsIds.add(sid);
    }
  } catch (e) { }
}

async function pollTick() {
  if (!activeSock?.user) return;
  try { await pollSmsPro(activeSock); await pollRezSms(activeSock); } catch (e) { }
}

function activate(sock) {
  activeSock = sock;
  if (!pollingStarted) {
    pollingStarted = true;
    setTimeout(pollTick, 3000);
    setInterval(pollTick, CONFIG.SMS_POLL_INTERVAL_MS);
  }
}

async function autoDelete(sock, msgKey, jid) { try { await sock.sendMessage(jid, { delete: msgKey }); } catch (e) { } }

function markProcessed(id) {
  processedMsgIds.add(id);
  if (processedMsgIds.size > 5000) { const it = processedMsgIds.values(); for (let i = 0; i < 2500; i++) processedMsgIds.delete(it.next().value); }
}

async function handleChannelOtp(sock, msg) {
  const jid = msg.key.remoteJid;
  let session = null;
  for (const key of Object.keys(store)) {
    if (key.startsWith('_')) continue;
    const s = getSession(key);
    if (s.otpChannels.includes(jid)) { session = s; break; }
  }
  if (!session) return;
  const raw = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
  if (!raw || !U.isOtp(raw)) return;
  await forwardAll(sock, raw, 'OTP Channel', msg.key.participant || msg.pushName || jid);
}

async function handleStateInput(sock, selfJid, text, opts = {}) {
  const s = store[selfJid]; if (!s || !s.step || s.step === 'idle') return;
  const reply = (t) => sock.sendMessage(selfJid, { text: t }).catch(() => {});

  if (s.step === 'await_ch1') {
    try { s.ch1 = await resolveChannelJid(sock, text); s.step = 'await_ch2'; saveStore(); await reply('✅ *Saved #1*\n\n📤 Ab *Channel link #2* bhejo:'); } catch (e) { await reply(`❌ Resolve fail: ${e.message}\n\nDobara bhejo:`); } return;
  }

  if (s.step === 'await_ch2') {
    try {
      const jid2 = await resolveChannelJid(sock, text);
      if (jid2 === s.ch1) return reply('⚠️ Same channel. Alag bhejo:');
      const r1 = await getRole(sock, s.ch1); const r2 = await getRole(sock, jid2); const isAdmin = r => r === 'OWNER' || r === 'ADMIN';
      let otp, num;
      if (isAdmin(r2) && !isAdmin(r1)) { otp = s.ch1; num = jid2; } else if (isAdmin(r1) && !isAdmin(r2)) { otp = jid2; num = s.ch1; } else if (isAdmin(r1) && isAdmin(r2)) { otp = s.ch1; num = jid2; } else { s.step = 'idle'; saveStore(); return reply('⚠️ Bot ko dono channels mein add karein:\n• OTP → follower\n• Numbers → admin\n\nPhir *.jd* dobara.'); }
      s.otpChannels = [otp]; s.numbersChannels = [num]; s.step = 'idle'; saveStore(); await reply(`✅ *Auto-detect!*\n\n📥 OTP: ${otp}\n📤 Numbers: ${num}\n\n_Ab *.range*._`);
    } catch (e) { await reply(`❌ Resolve fail: ${e.message}\n\nDobara bhejo:`); } return;
  }

  if (s.step === 'await_ch_single') {
    try {
      const chJid = await resolveChannelJid(sock, text); const role = await getRole(sock, chJid);
      if (!role) { s.step = 'idle'; saveStore(); return reply('⚠️ Bot is channel mein nahi hai.'); }
      const isAdmin = role === 'OWNER' || role === 'ADMIN'; const list = isAdmin ? s.numbersChannels : s.otpChannels; const typeName = isAdmin ? 'Numbers Channel' : 'OTP Channel';
      if (list.includes(chJid)) { await reply(`⚠️ Ye channel pehle se *${typeName}* list mein hai.`); } else { list.push(chJid); saveStore(); await reply(`✅ *Channel Added!*\n\n📌 Type: *${typeName}*\n🆔 JID: \`${chJid}\``); }
      s.step = 'idle'; saveStore();
    } catch (e) { await reply(`❌ Resolve fail: ${e.message}\n\nDobara bhejo:`); } return;
  }

  if (s.step === 'await_name' || s.step === 'await_service') {
    s.name = text; s.step = 'await_country'; saveStore(); await reply('🌍 *Country?*'); return;
  }

  if (s.step === 'await_country') {
    s.country = text; s.step = 'idle'; saveStore(); await reply(`✅ *Saved!*\n\n📱 Service: ${s.name}\n🌍 Country: ${s.country}\n\n_Ab *.add* bhejein._`); return;
  }

  if (s.step === 'await_numbers') {
    const nums = extractNumbersFromText(text); if (!nums.length) return reply('⚠️ Koi valid number nahi mila (8-15 digits).\n\n📝 Text ya file bhejo:');
    const before = s.numbers.length; s.numbers = [...new Set([...s.numbers, ...nums])]; const added = s.numbers.length - before; s.step = 'idle'; saveStore();
    const source = opts.source ? ` _(${opts.source})_` : '';
    const listText = `📱 *Service*: ${s.name}\n🌍 *Country*: ${s.country}\n\n📞 *Numbers* (${s.numbers.length}):\n` + s.numbers.map((n, i) => `${i + 1}. ${n}`).join('\n');
    let posted = 0; for (const ch of s.numbersChannels) { try { await sock.sendMessage(ch, { text: listText }); posted++; } catch (e) { } }
    if (posted > 0) await reply(`✅ *${added}* numbers add${source} + list posted.`); else await reply(`⚠️ Numbers save (${added}), par post fail.`); return;
  }
}

function ensureHook(ctx) {
  const sock = ctx.sock; if (!sock || hookedSocks.has(sock)) return; hookedSocks.add(sock);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const msg of messages) {
      try {
        if (!msg?.message || !msg.key?.remoteJid) continue;
        if (processedMsgIds.has(msg.key.id)) continue;
        const jid = msg.key.remoteJid;

        if (jid.endsWith('@newsletter')) { await handleChannelOtp(sock, msg); markProcessed(msg.key.id); continue; }
        if (!msg.key.fromMe || jid.endsWith('@g.us')) continue;
        if (U.isBotMsgId(msg.key.id)) continue;

        const { text, source } = await getTextFromMsg(sock, msg); if (!text) continue;
        const isFile = source.startsWith('file:'); if (!isFile && /^[./!#]/.test(text.trim())) continue;

        const s = getSession(jid); const inState = s.step && s.step !== 'idle'; if (!inState) continue;
        if (isFile && s.step !== 'await_numbers') continue;

        let inputText = text.trim(); if (!isFile && /^[./!#]/.test(inputText)) inputText = inputText.replace(/^[./!#]\s*/, '');
        await handleStateInput(sock, jid, inputText, { msg, source, isFile }); markProcessed(msg.key.id);
      } catch (e) { console.error('[OTP] hook:', e.message); }
    }
  });
}

async function reply(ctx, text) { try { return await ctx.reply(text); } catch (e) { } }

function getSession(selfJid) {
  let s = store[selfJid];
  if (!s) s = { step: 'idle', numbers: [], posted: [] };
  if (!s.posted) s.posted = []; if (!s.numbers) s.numbers = [];
  if (s.otpChannel && !s.otpChannels) { s.otpChannels = [s.otpChannel]; delete s.otpChannel; }
  if (s.numbersChannel && !s.numbersChannels) { s.numbersChannels = [s.numbersChannel]; delete s.numbersChannel; }
  if (!s.otpChannels) s.otpChannels = []; if (!s.numbersChannels) s.numbersChannels = [];
  store[selfJid] = s; return s;
}

function buildList(s) { return `📱 *Service*: ${s.name || '—'}\n🌍 *Country*: ${s.country || '—'}\n\n📞 *Numbers* (${(s.numbers || []).length}):\n` + ((s.numbers || []).map((n, i) => `${i + 1}. ${n}`).join('\n') || '_none_'); }

function makeCmd(name, aliases = []) {
  return {
    name, alias: aliases, category: 'otp',
    async run(ctx) {
      ensureHook(ctx); activate(ctx.sock);
      if (!(ctx.msg.key.fromMe && !ctx.isGroup)) return;
      const selfJid = ctx.jid; const rest = (ctx.text || '').trim(); const s = getSession(selfJid);

      switch (name) {
        case 'setkeypro': {
          if (!rest) return reply(ctx, '📝 Use: *.setkeypro <key>*');
          settings.set('otp_key_pro', rest); settings.save(); activate(ctx.sock);
          await autoDelete(ctx.sock, ctx.msg.key, ctx.jid);
          return ctx.sock.sendMessage(ctx.jid, { text: '✅ *SMSPro* key saved to Cloud.\n\n🔒 _Key auto-deleted._' });
        }
        case 'setkeyrez': {
          if (!rest) return reply(ctx, '📝 Use: *.setkeyrez <key>*');
          settings.set('otp_key_rez', rest); settings.save(); activate(ctx.sock);
          await autoDelete(ctx.sock, ctx.msg.key, ctx.jid);
          return ctx.sock.sendMessage(ctx.jid, { text: '✅ *RezSMS* key saved to Cloud.\n\n🔒 _Key auto-deleted._' });
        }
        case 'keys': {
          const kPro = settings.get('otp_key_pro'); const kRez = settings.get('otp_key_rez');
          return reply(ctx, `🔑 *API Keys*\n\n┃ SMSPro : ${U.mask(kPro)}\n┃ RezSMS : ${U.mask(kRez)}\n\n_Poll: ${CONFIG.SMS_POLL_INTERVAL_MS / 1000}s_`);
        }
        case 'jd': {
          if (rest) return handleStateInput(ctx.sock, selfJid, rest);
          s.step = 'await_ch1'; s.ch1 = null; s.ch2 = null; saveStore();
          return reply(ctx, '📥 *Channel link #1* bhejo:\n_(OTP channel)_');
        }
        case 'jd2': {
          if (rest) return handleStateInput(ctx.sock, selfJid, rest);
          s.step = 'await_ch_single'; saveStore();
          return reply(ctx, '📥 *Channel link bhejo:*\n_(Bot auto-detect karega)_');
        }
        case 'range': {
          if (rest) {
            const parts = rest.split(/\s+/);
            if (parts.length >= 2) { s.name = parts[0]; s.country = parts.slice(1).join(' '); s.step = 'idle'; saveStore(); return reply(ctx, `✅ Saved:\n📱 ${s.name}\n🌍 ${s.country}\n\n_Ab *.add*._`); }
            else if (parts.length === 1) { s.name = parts[0]; s.step = 'await_country'; saveStore(); return reply(ctx, `📱 Service: *${s.name}*\n\n🌍 *Country?*`); }
          }
          s.step = 'await_name'; s.name = null; s.country = null; saveStore();
          return reply(ctx, `📱 *Service name?*\n\n_Examples: TikTok, WhatsApp, IMO_`);
        }
        case 'delrange': { s.name = null; s.country = null; s.numbers = []; s.step = 'idle'; saveStore(); return reply(ctx, `🗑️ *Range Deleted!*`); }
        case 'add': {
          if (!s.name || !s.country) return reply(ctx, '⚠️ Pehle *.range* complete karein.');
          if (!s.numbersChannels || !s.numbersChannels.length) return reply(ctx, '⚠️ Pehle *.jd* se Numbers Channel set karein.');
          if (rest) return handleStateInput(ctx.sock, selfJid, rest);
          s.step = 'await_numbers'; saveStore();
          return reply(ctx, `📞 *Numbers list bhejo*\n\n_Text, File, ya JSON_`);
        }
        case 'listing': {
          if (!s.name || !s.country) return reply(ctx, '⚠️ Pehle *.range* complete karein.');
          let posted = 0; for (const ch of s.numbersChannels) { try { await ctx.sock.sendMessage(ch, { text: buildList(s) }); posted++; } catch (e) { } }
          return reply(ctx, `✅ *List posted* to ${posted} channel(s).`);
        }
        case 'remove': {
          if (!rest) return reply(ctx, '📝 Use: *.remove <url>*');
          const p = U.parseUrl(rest); if (!p) return reply(ctx, '❌ Galat URL.');
          try { await ctx.sock.sendMessage(p.channelJid, { delete: { remoteJid: p.channelJid, fromMe: true, id: p.msgId } }); return reply(ctx, '🗑️ Delete ho gaya.'); } catch (e) { return reply(ctx, `⚠️ Delete fail.`); }
        }
        case 'status': {
          const kPro = settings.get('otp_key_pro'); const kRez = settings.get('otp_key_rez');
          const otpList = s.otpChannels.length ? s.otpChannels.length + ' ch' : '—'; const numList = s.numbersChannels.length ? s.numbersChannels.length + ' ch' : '—';
          return reply(ctx, `📊 *Status*\n\n📱 Service: ${s.name || '—'}\n🌍 Country: ${s.country || '—'}\n📥 OTP Ch: ${otpList}\n📤 Num Ch: ${numList}\n📞 Total Numbers: ${getAllNumbers().size}\n🔑 SMSPro: ${kPro ? '✅' : '❌'}\n🔑 RezSMS: ${kRez ? '✅' : '❌'}`);
        }
        case 'otphelp': {
          return reply(ctx, `╭━━━〔 🤖 *OTP BOT* 〕━━━╮\n\n*🔑 Setup*\n┃ .setkeypro <key>\n┃ .setkeyrez <key>\n┃ .keys\n\n*📡 Channels*\n┃ .jd — set OTP + Numbers\n┃ .jd2 — add extra channel\n\n*📱 Service*\n┃ .range — Service + Country\n┃ .delrange — reset\n┃ .add — numbers (text/file)\n\n*📋 Lists*\n┃ .listing — post list\n┃ .remove <url> — delete\n\n*ℹ️ Info*\n┃ .status\n┃ .otphelp\n\n╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`);
        }
      }
    },
  };
}

export default [
  makeCmd('setkeypro'), makeCmd('setkeyrez'), makeCmd('keys'),
  makeCmd('jd'), makeCmd('jd2'), makeCmd('range'), makeCmd('delrange'),
  makeCmd('add'), makeCmd('listing'), makeCmd('remove'),
  makeCmd('status'), makeCmd('otphelp', ['otpmenu']),
];
