// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — OTP Forward Plugin v3
//  + Auto-delete keys
//  + Service name (TikTok/Facebook/etc.)
//  + File upload support for .add
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= CONFIG =================
const CONFIG = {
  OTP_KEYWORDS: [
    'otp', 'code', 'verification', 'verify', 'pin', 'login', 'signin',
    '2fa', 'passcode', 'auth', 'authentication', 'one time', 'onetime',
    'tac', 'security code',
  ],
  SMSPRO_BASE: 'https://smspro.tel/api/v1/sms-logs',
  REZSMS_BASE: 'https://rezsms.org/api/cdr.php',
  SMS_POLL_INTERVAL_MS: 30_000,
  SMS_FETCH_LENGTH: 50,
  STATE_DIR: path.join(__dirname, '..', 'data'),
  STATE_FILE: path.join(__dirname, '..', 'data', 'otp-state.json'),
  MAX_OTP_TEXT_LENGTH: 400,
};

if (!fs.existsSync(CONFIG.STATE_DIR)) fs.mkdirSync(CONFIG.STATE_DIR, { recursive: true });

// ================= STATE =================
function loadStore() {
  try {
    const d = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
    if (!d._keys) d._keys = { smspro: '', rezsms: '' };
    return d;
  } catch {
    return { _keys: { smspro: '', rezsms: '' } };
  }
}
const store = loadStore();
const seenSmsIds = new Set();
const processedMsgIds = new Set();
const hookedSocks = new WeakSet();
let pollingStarted = false;
let activeSock = null;

function saveStore() {
  try {
    const tmp = CONFIG.STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, CONFIG.STATE_FILE);
  } catch (e) { console.error('[OTP] save:', e.message); }
}

// ================= UTILS =================
const U = {
  strip(t) {
    return String(t || '').replace(/```/g, '').replace(/[*_~`]/g, '').replace(/[^\S\r\n]+/g, ' ').trim();
  },
  isOtp(t) {
    const c = this.strip(t).toLowerCase();
    return CONFIG.OTP_KEYWORDS.some(k => c.includes(k));
  },
  code(t) {
    const c = this.strip(t);
    const pats = [
      /(?:otp|code|pin|verification|passcode|tac)\D{0,20}(\d{4,8})/i,
      /\b(\d{3}[- ]\d{3})\b/,
      /\b(\d{4,8})\b/,
    ];
    for (const p of pats) {
      const m = c.match(p);
      if (m) return m[1].replace(/[- ]/g, '');
    }
    return null;
  },
  fmtDate(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  pick(d) {
    if (Array.isArray(d)) return d;
    for (const k of ['data', 'logs', 'cdr', 'results', 'items', 'sms', 'records'])
      if (Array.isArray(d?.[k])) return d[k];
    return [];
  },
  smsText(l) {
    if (typeof l === 'string') return l;
    if (!l || typeof l !== 'object') return '';
    for (const k of ['message', 'text', 'body', 'content', 'msg', 'sms', 'sms_text'])
      if (l[k] && typeof l[k] === 'string') return l[k];
    return JSON.stringify(l);
  },
  smsId(l, i) {
    if (l && typeof l === 'object')
      for (const k of ['id', '_id', 'message_id', 'sms_id', 'cdr_id', 'uid', 'uuid'])
        if (l[k] != null) return String(l[k]);
    return String(i);
  },
  smsSender(l) {
    if (!l || typeof l !== 'object') return '';
    for (const k of ['sender', 'from', 'sender_id', 'sender_name', 'originator'])
      if (l[k]) return String(l[k]);
    return '';
  },
  async json(url, t = 15000) {
    const ctrl = new AbortController();
    const tim = setTimeout(() => ctrl.abort(), t);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(tim); }
  },
  mask(k) {
    if (!k) return '❌ not set';
    return k.length <= 12 ? `✅ ${k.slice(0, 4)}...` : `✅ ${k.slice(0, 6)}...${k.slice(-4)}`;
  },
  selfJid(sock) { return sock.user.id.split(':')[0] + '@s.whatsapp.net'; },
  isBotMsgId(id) { return /^(3EB0|BAE5)/.test(String(id || '')); },
  parseUrl(url) {
    const m = url.match(/channel\/([A-Za-z0-9@._-]+)\/([A-Za-z0-9_-]+)/);
    return m ? { channelJid: m[1], msgId: m[2] } : null;
  },
};

// ================= NUMBER EXTRACTION =================
function extractNumbersFromText(text) {
  if (!text) return [];
  const trimmed = text.trim();

  // Try JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      const fromJson = extractNumbersFromJson(data);
      if (fromJson.length) return fromJson;
    } catch {}
  }

  // Line by line
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fromLines = [];
  for (const line of lines) {
    const m = line.match(/\b(\d{8,15})\b/);
    if (m) fromLines.push(m[1]);
  }
  if (fromLines.length > 0) return [...new Set(fromLines)];

  // Fallback: whole text
  const matches = text.match(/\b\d{8,15}\b/g) || [];
  return [...new Set(matches)];
}

function extractNumbersFromJson(obj) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string' && /^\d{8,15}$/.test(v.trim())) out.add(v.trim());
    else if (typeof v === 'number' && String(v).length >= 8 && String(v).length <= 15) out.add(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(obj);
  return [...out];
}

// ================= GET TEXT FROM MESSAGE (text OR file) =================
async function getTextFromMsg(sock, msg) {
  // 1) Plain text
  const direct = msg.message.conversation ||
                 msg.message.extendedTextMessage?.text || '';
  if (direct) return { text: direct, source: 'text' };

  // 2) Caption
  const cap = msg.message.imageMessage?.caption ||
              msg.message.videoMessage?.caption || '';
  if (cap) return { text: cap, source: 'caption' };

  // 3) Document file
  if (msg.message.documentMessage) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        reuploadRequest: sock.updateMediaMessage,
      });
      const fileName = msg.message.documentMessage.fileName || 'file';
      return { text: buffer.toString('utf8'), source: 'file:' + fileName };
    } catch (e) {
      console.error('[OTP] file download fail:', e.message);
      return { text: '', source: 'file-error' };
    }
  }

  return { text: '', source: 'none' };
}

// ================= STYLISH TEMPLATE =================
function stylishOtp({ code, source, rawText, sender }) {
  const time = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const L = ['╭━━━〔 🔐 *OTP RECEIVED* 〕━━━╮'];
  L.push(`┃ 💎 *Code* : ${code ? `*${code}*` : '_(auto-detect fail)_'}`);
  if (sender) L.push(`┃ 📨 *From* : ${sender}`);
  L.push(`┃ 📡 *Via*  : ${source}`);
  L.push(`┃ 🕐 *Time* : ${time}`);
  L.push('╰━━━━━━━━━━━━━━━━━━━━━━━━╯', '', '📝 *Original Message:*',
         '```' + String(rawText || '').trim().slice(0, CONFIG.MAX_OTP_TEXT_LENGTH) + '```');
  return L.join('\n');
}

// ================= CHANNEL HELPERS =================
async function resolveChannelJid(sock, input) {
  const t = input.trim();
  if (t.includes('@newsletter')) return t;
  const m = t.match(/channel\/([A-Za-z0-9@._-]+)/);
  const code = m ? m[1] : t;
  const meta = await sock.newsletterMetadata('invite', code);
  if (!meta?.id) throw new Error('Channel not found');
  return meta.id;
}
async function getRole(sock, jid) {
  try { return (await sock.newsletterMetadata('jid', jid))?.viewer_metadata?.role || null; }
  catch { return null; }
}

// ================= FORWARD =================
function getAllNumbers() {
  const all = new Set();
  for (const [jid, o] of Object.entries(store)) {
    if (jid.startsWith('_') || !o || typeof o !== 'object') continue;
    (o.numbers || []).forEach(n => all.add(n));
  }
  return all;
}

async function forwardAll(sock, rawText, source, sender) {
  try {
    const code = U.code(rawText);
    const all = getAllNumbers();
    if (!all.size) return 0;
    const msg = stylishOtp({ code, source, rawText, sender });
    let ok = 0;
    for (const num of all) {
      try { await sock.sendMessage(num + '@s.whatsapp.net', { text: msg }); ok++; }
      catch (e) { console.error('[OTP] fwd fail', num, e.message); }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[OTP] ${source} → ${ok}/${all.size}`);
    return ok;
  } catch (e) { console.error('[OTP] forward engine:', e.message); return 0; }
}

// ================= POLLERS =================
async function pollSmsPro(sock) {
  const key = store._keys?.smspro;
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
  } catch (e) { console.error('[OTP] SMSPro:', e.message); }
}

async function pollRezSms(sock) {
  const key = store._keys?.rezsms;
  if (!key) return;
  try {
    const now = new Date();
    const s1 = new Date(now); s1.setHours(0, 0, 0, 0);
    const s2 = new Date(now); s2.setHours(23, 59, 59, 0);
    const url = `${CONFIG.REZSMS_BASE}?token=${encodeURIComponent(key)}` +
                `&dt1=${encodeURIComponent(U.fmtDate(s1))}&dt2=${encodeURIComponent(U.fmtDate(s2))}`;
    const logs = U.pick(await U.json(url));
    for (let i = 0; i < logs.length; i++) {
      const sid = `rez_${U.smsId(logs[i], i)}`;
      if (seenSmsIds.has(sid)) continue;
      const raw = U.smsText(logs[i]);
      if (!raw || !U.isOtp(raw)) { seenSmsIds.add(sid); continue; }
      await forwardAll(sock, raw, 'RezSMS API', U.smsSender(logs[i]));
      seenSmsIds.add(sid);
    }
  } catch (e) { console.error('[OTP] RezSMS:', e.message); }
}

async function pollTick() {
  if (!activeSock?.user) return;
  try { await pollSmsPro(activeSock); await pollRezSms(activeSock); }
  catch (e) { console.error('[OTP] poll:', e.message); }
}

function activate(sock) {
  activeSock = sock;
  if (!pollingStarted) {
    const keys = store._keys || {};
    if (keys.smspro || keys.rezsms) {
      pollingStarted = true;
      console.log('[OTP] 🔁 API polling started');
      setTimeout(pollTick, 3000);
      setInterval(pollTick, CONFIG.SMS_POLL_INTERVAL_MS);
    }
  }
}

// ================= AUTO-DELETE =================
async function autoDelete(sock, msgKey, jid) {
  try {
    await sock.sendMessage(jid, { delete: msgKey });
    return true;
  } catch (e) {
    console.error('[OTP] auto-delete fail:', e.message);
    return false;
  }
}

// ================= MESSAGE UPSERT HOOK =================
function markProcessed(id) {
  processedMsgIds.add(id);
  if (processedMsgIds.size > 5000) {
    const it = processedMsgIds.values();
    for (let i = 0; i < 2500; i++) processedMsgIds.delete(it.next().value);
  }
}

async function handleChannelOtp(sock, msg) {
  const self = U.selfJid(sock);
  const s = store[self];
  if (!s?.otpChannel) return;
  if (msg.key.remoteJid !== s.otpChannel) return;
  const raw = msg.message.conversation ||
              msg.message.extendedTextMessage?.text ||
              msg.message.imageMessage?.caption ||
              msg.message.videoMessage?.caption || '';
  if (!raw || !U.isOtp(raw)) return;
  const sender = msg.key.participant || msg.pushName || s.otpChannel;
  await forwardAll(sock, raw, 'OTP Channel', sender);
}

// ================= STATE MACHINE =================
async function handleStateInput(sock, selfJid, text, opts = {}) {
  const s = store[selfJid];
  if (!s || !s.step || s.step === 'idle') return;
  const chatId = selfJid;
  const reply = (t) => sock.sendMessage(chatId, { text: t }).catch(() => {});

  // ---- await_ch1 ----
  if (s.step === 'await_ch1') {
    try {
      s.ch1 = await resolveChannelJid(sock, text);
      s.step = 'await_ch2';
      saveStore();
      await reply('✅ *Saved #1*\n\n📤 Ab *Channel link #2* bhejo:\n_(Numbers channel — jahan list post hogi)_');
    } catch (e) { await reply(`❌ Resolve fail: ${e.message}\n\nDobara bhejo:`); }
    return;
  }

  // ---- await_ch2 ----
  if (s.step === 'await_ch2') {
    try {
      const jid2 = await resolveChannelJid(sock, text);
      if (jid2 === s.ch1) return reply('⚠️ Same channel. Alag bhejo:');
      const r1 = await getRole(sock, s.ch1);
      const r2 = await getRole(sock, jid2);
      const isAdmin = r => r === 'OWNER' || r === 'ADMIN';
      let otp, num;
      if (isAdmin(r2) && !isAdmin(r1)) { otp = s.ch1; num = jid2; }
      else if (isAdmin(r1) && !isAdmin(r2)) { otp = jid2; num = s.ch1; }
      else if (isAdmin(r1) && isAdmin(r2)) { otp = s.ch1; num = jid2; }
      else {
        s.step = 'idle'; saveStore();
        return reply('⚠️ Bot ko dono channels mein add karein:\n• OTP → follower\n• Numbers → admin\n\nPhir *.jd* dobara.');
      }
      s.otpChannel = otp; s.numbersChannel = num; s.step = 'idle'; saveStore();
      await reply(`✅ *Auto-detect!*\n\n📥 OTP: ${otp}\n📤 Numbers: ${num}\n\n_Ab *.range*._`);
    } catch (e) { await reply(`❌ Resolve fail: ${e.message}\n\nDobara bhejo:`); }
    return;
  }

  // ---- await_name (now: SERVICE name) ----
  if (s.step === 'await_name' || s.step === 'await_service') {
    s.name = text;
    s.step = 'await_country';
    saveStore();
    await reply('🌍 *Country?*\n_Example: Pakistan, India, USA, UK_');
    return;
  }

  // ---- await_country ----
  if (s.step === 'await_country') {
    s.country = text;
    s.step = 'idle';
    saveStore();
    await reply(`✅ *Saved!*\n\n📱 Service: ${s.name}\n🌍 Country: ${s.country}\n\n_Ab *.add* bhejein (text ya file)._`);
    return;
  }

  // ---- await_numbers ----
  if (s.step === 'await_numbers') {
    const nums = extractNumbersFromText(text);
    if (!nums.length) {
      return reply('⚠️ Koi valid number nahi mila (8-15 digits).\n\n📝 Text ya file (txt/csv/json) bhejo:');
    }
    const before = s.numbers.length;
    s.numbers = [...new Set([...s.numbers, ...nums])];
    const added = s.numbers.length - before;
    s.step = 'idle';
    saveStore();

    const source = opts.source ? ` _(${opts.source})_` : '';
    const listText =
      `📱 *Service*: ${s.name}\n` +
      `🌍 *Country*: ${s.country}\n\n` +
      `📞 *Numbers* (${s.numbers.length}):\n` +
      s.numbers.map((n, i) => `${i + 1}. ${n}`).join('\n');

    try {
      await sock.sendMessage(s.numbersChannel, { text: listText });
      await reply(`✅ *${added}* numbers add${source} + list channel mein post.`);
    } catch (e) {
      await reply(`⚠️ Numbers save (${added}), par post fail: ${e.message}`);
    }
    return;
  }
}

// ================= HOOK =================
function ensureHook(ctx) {
  const sock = ctx.sock;
  if (!sock || hookedSocks.has(sock)) return;
  hookedSocks.add(sock);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      try {
        if (!msg?.message) continue;
        if (!msg.key?.remoteJid) continue;
        if (processedMsgIds.has(msg.key.id)) continue;

        const jid = msg.key.remoteJid;

        // ── OTP Channel ──
        if (jid.endsWith('@newsletter')) {
          await handleChannelOtp(sock, msg);
          markProcessed(msg.key.id);
          continue;
        }

        // ── Self-chat ──
        if (!sock.user?.id) continue;
        const self = U.selfJid(sock);
        if (jid !== self) continue;
        if (U.isBotMsgId(msg.key.id)) continue;
        if (msg.key.fromMe !== true) continue;

        const { text, source } = await getTextFromMsg(sock, msg);
        if (!text) continue;

        const isFile = source.startsWith('file:');

        // Commands skip (only for text; files never start with .)
        if (!isFile && /^[./!#]/.test(text.trim())) continue;

        const s = store[self];
        const inState = s && s.step && s.step !== 'idle';
        if (!inState) continue;

        // Only accept files during await_numbers
        if (isFile && s.step !== 'await_numbers') {
          console.log('[OTP] file ignored (not await_numbers state)');
          continue;
        }

        await handleStateInput(sock, self, text, { msg, source, isFile });
        markProcessed(msg.key.id);
      } catch (e) {
        console.error('[OTP] hook:', e.message);
      }
    }
  });

  console.log('[OTP] 📡 Hook installed for', U.selfJid(sock));
}

// ================= COMMAND HANDLERS =================
async function reply(ctx, text) {
  try { return await ctx.reply(text); }
  catch (e) { console.error('[OTP] reply:', e.message); }
}

function getSession(self) {
  let s = store[self];
  if (!s) s = { step: 'idle', numbers: [], posted: [] };
  if (!s.posted) s.posted = [];
  if (!s.numbers) s.numbers = [];
  store[self] = s;
  return s;
}

function buildList(s) {
  return `📱 *Service*: ${s.name || '—'}\n🌍 *Country*: ${s.country || '—'}\n\n` +
         `📞 *Numbers* (${(s.numbers || []).length}):\n` +
         ((s.numbers || []).map((n, i) => `${i + 1}. ${n}`).join('\n') || '_none_');
}

// ═══════════════════════════════════════════════════════════════════
//  COMMAND FACTORY
// ═══════════════════════════════════════════════════════════════════
function makeCmd(name, aliases = []) {
  return {
    name,
    alias: aliases,
    category: 'otp',

    async run(ctx) {
      ensureHook(ctx);
      activate(ctx.sock);

      const self = U.selfJid(ctx.sock);
      if (ctx.jid !== self) return; // sirf self-chat

      const rest = (ctx.text || '').trim();
      const s = getSession(self);

      switch (name) {
        // ═══ .setkeypro — auto-delete key message ═══
        case 'setkeypro': {
          if (!rest) return reply(ctx, '📝 Use: *.setkeypro <key>*');
          store._keys.smspro = rest;
          saveStore();
          activate(ctx.sock);
          // Auto-delete user's message
          await autoDelete(ctx.sock, ctx.msg.key, ctx.jid);
          return reply(ctx, '✅ *SMSPro* key saved.\n\n🔒 _Key message auto-deleted for security._');
        }

        // ═══ .setkeyrez — auto-delete key message ═══
        case 'setkeyrez': {
          if (!rest) return reply(ctx, '📝 Use: *.setkeyrez <key>*');
          store._keys.rezsms = rest;
          saveStore();
          activate(ctx.sock);
          await autoDelete(ctx.sock, ctx.msg.key, ctx.jid);
          return reply(ctx, '✅ *RezSMS* key saved.\n\n🔒 _Key message auto-deleted for security._');
        }

        // ═══ .keys ═══
        case 'keys': {
          const k = store._keys || {};
          return reply(ctx,
            `🔑 *API Keys*\n\n` +
            `┃ SMSPro : ${U.mask(k.smspro)}\n` +
            `┃ RezSMS : ${U.mask(k.rezsms)}\n\n` +
            `_Poll: ${CONFIG.SMS_POLL_INTERVAL_MS / 1000}s_`
          );
        }

        // ═══ .jd ═══
        case 'jd': {
          if (rest) return handleStateInput(ctx.sock, self, rest);
          s.step = 'await_ch1'; s.ch1 = null; s.ch2 = null; saveStore();
          return reply(ctx, '📥 *Channel link #1* bhejo:\n_(OTP channel — jahan messages aate hain)_');
        }

        // ═══ .range — SERVICE name (not person) ═══
        case 'range': {
          if (rest) {
            const parts = rest.split(/\s+/);
            if (parts.length >= 2) {
              s.name = parts[0];
              s.country = parts.slice(1).join(' ');
              s.step = 'idle'; saveStore();
              return reply(ctx, `✅ Saved:\n📱 Service: ${s.name}\n🌍 Country: ${s.country}\n\n_Ab *.add*._`);
            }
          }
          s.step = 'await_name'; s.name = null; s.country = null; saveStore();
          return reply(ctx,
            `📱 *Service name?*\n\n` +
            `_Examples:_\n` +
            `• TikTok\n` +
            `• Facebook\n` +
            `• WhatsApp\n` +
            `• Instagram\n` +
            `• Telegram\n` +
            `• Any other app/service`
          );
        }

        // ═══ .add — text ya file dono ═══
        case 'add': {
          if (!s.name || !s.country) return reply(ctx, '⚠️ Pehle *.range* complete karein.');
          if (!s.otpChannel || !s.numbersChannel) return reply(ctx, '⚠️ Pehle *.jd* se channels set karein.');
          if (rest) return handleStateInput(ctx.sock, self, rest);
          s.step = 'await_numbers'; saveStore();
          return reply(ctx,
            `📞 *Numbers list bhejo*\n\n` +
            `_3 tarah se bhej sakte hain:_\n\n` +
            `1️⃣ *Text* — line ya comma separated\n` +
            `   \`923451234567\`\n` +
            `   \`923457654321\`\n\n` +
            `2️⃣ *File* — .txt / .csv / .json upload karein\n` +
            `   _(bot khud extract karega)_\n\n` +
            `3️⃣ *JSON array* — \`["923451234567","923457654321"]\``
          );
        }

        // ═══ .listing ═══
        case 'listing': {
          if (!s.name || !s.country) return reply(ctx, '⚠️ Pehle *.range* complete karein.');
          if (!s.numbersChannel) return reply(ctx, '⚠️ Pehle *.jd* se channels set karein.');
          try {
            await ctx.sock.sendMessage(s.numbersChannel, { text: buildList(s) });
            return reply(ctx, '✅ *List posted* to channel.');
          } catch (e) { return reply(ctx, `⚠️ Post fail: ${e.message}`); }
        }

        // ═══ .remove <url> ═══
        case 'remove': {
          if (!rest) return reply(ctx, '📝 Use: *.remove <url>*');
          const p = U.parseUrl(rest);
          if (!p) return reply(ctx, '❌ Galat URL.\nFormat: `https://whatsapp.com/channel/JID/MSGID`');
          if (!s.numbersChannel || p.channelJid !== s.numbersChannel) {
            return reply(ctx, '❌ Ye URL aapke Numbers Channel ka nahi hai.');
          }
          try {
            await ctx.sock.sendMessage(p.channelJid, {
              delete: { remoteJid: p.channelJid, fromMe: true, id: p.msgId },
            });
            s.posted = s.posted.filter(x => x.msgId !== p.msgId);
            saveStore();
            return reply(ctx, '🗑️ Delete ho gaya.');
          } catch (e) { return reply(ctx, `⚠️ Delete fail: ${e.message}`); }
        }

        // ═══ .status ═══
        case 'status': {
          const nums = getAllNumbers();
          return reply(ctx,
            `📊 *OTP Bot Status*\n\n` +
            `┃ 📱 Service: ${s.name || '—'}\n` +
            `┃ 🌍 Country: ${s.country || '—'}\n` +
            `┃ 📥 OTP Channel: ${s.otpChannel || '—'}\n` +
            `┃ 📤 Numbers Channel: ${s.numbersChannel || '—'}\n` +
            `┃ 📞 Total Numbers: ${nums.size}\n` +
            `┃ 📮 Posted: ${s.posted.length}\n` +
            `┃ 🔄 Poll: ${CONFIG.SMS_POLL_INTERVAL_MS / 1000}s\n` +
            `┃ 🕐 Uptime: ${Math.floor(process.uptime())}s`
          );
        }

        // ═══ .otphelp ═══
        case 'otphelp': {
          return reply(ctx,
            `╭━━━〔 🤖 *OTP BOT* 〕━━━╮\n\n` +
            `*🔑 Setup*\n` +
            `┃ .setkeypro <key>\n` +
            `┃ .setkeyrez <key>\n` +
            `┃ .keys\n\n` +
            `*📡 Channels*\n` +
            `┃ .jd — 2 channels\n\n` +
            `*📱 Service Setup*\n` +
            `┃ .range — Service + Country\n` +
            `┃ .add — numbers (text/file)\n\n` +
            `*📋 Lists*\n` +
            `┃ .listing — post list\n` +
            `┃ .remove <url> — delete\n\n` +
            `*ℹ️ Info*\n` +
            `┃ .status — bot status\n` +
            `┃ .otphelp — this menu\n\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`
          );
        }
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════════
export default [
  makeCmd('setkeypro'),
  makeCmd('setkeyrez'),
  makeCmd('keys'),
  makeCmd('jd'),
  makeCmd('range'),
  makeCmd('add'),
  makeCmd('listing'),
  makeCmd('remove'),
  makeCmd('status'),
  makeCmd('otphelp', ['otpmenu']),
];
