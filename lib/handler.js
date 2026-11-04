import { jidNormalizedUser, downloadMediaMessage } from '@whiskeysockets/baileys'
import config from '../config.js'
import * as settings from './settings.js'
import { runAs } from './ctx.js'
import { commands } from './plugins.js'
import { decideReact } from './autoreact.js'
import { log, waLogger } from './logger.js'
import { getBody, getType, senderIds, isAdminIn, botIds, num, pick, hasLink, participantIds } from './utils.js'
import { currentSid } from './ctx.js'
import { askAI, aiKey, AQDAS_AI } from './ai.js'
import * as antidelete from './antidelete.js'
import { customCommand } from './customcmds.js'

// Owner = (1) is number ka apna account (fromMe / bot ka apna PN ya LID), ya (2) config.ownerNumbers (asli owner, har number pe).
// Koi aur (stranger) kabhi owner nahi: sirf sender ke apne ids dekhte hain (DM mein chat ka doosra banda, group mein participant).
export function isOwner (bot, msg) {
  if (msg?.key?.fromMe === true) return true
  const ids = senderIds(msg, bot.sock)
  const mine = botIds(bot.sock)
  if (ids.some(j => mine.includes(j))) return true
  const nums = ids.filter(j => !String(j).endsWith('@lid')).map(num).filter(Boolean) // LID number nahi hota, us se match mat karo
  return nums.some(n => config.ownerNumbers.includes(n))
}

export const isPrivateMode = () => String(settings.get('mode') || '').toLowerCase() === 'private'

// poore bot (sab numbers) pe asar wali commands (restart / reload): sirf asli owner ya main bot ka apna number
export function isSuperOwner (bot, msg) {
  const ids = senderIds(msg, bot.sock).filter(j => !String(j).endsWith('@lid')).map(num)
  if (ids.some(n => config.ownerNumbers.includes(n))) return true
  return !!(bot.isMain && msg.key.fromMe)
}

// ===== Har aanay walay message ka context =====
export async function buildCtx (bot, msg) {
  const sock = bot.sock
  const jid = msg.key.remoteJid
  const isGroup = jid.endsWith('@g.us')
  const body = getBody(msg.message).trim()
  const prefix = settings.get('prefix')
  const isCmd = !!prefix && body.startsWith(prefix)
  const [rawCmd, ...args] = isCmd ? body.slice(prefix.length).trim().split(/\s+/) : []
  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.[getType(msg.message)]?.contextInfo || null
  const quoted = ctxInfo?.quotedMessage ? {
    key: { remoteJid: jid, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: botIds(sock).includes(jidNormalizedUser(ctxInfo.participant || '')) },
    message: ctxInfo.quotedMessage
  } : null
  const sender = jidNormalizedUser(msg.key.participantAlt || msg.key.participant || (msg.key.fromMe ? sock.user?.id : (msg.key.remoteJidAlt || jid)))
  const ctx = {
    bot, sock, msg, jid, isGroup, body, prefix, isCmd,
    command: (rawCmd || '').toLowerCase(), args, text: args.join(' '),
    sender, senderIds: senderIds(msg, sock), pushName: msg.pushName || '',
    quoted, mentioned: ctxInfo?.mentionedJid || [],
    owner: isOwner(bot, msg),
    superOwner: isSuperOwner(bot, msg),
    meta: null, isAdmin: false, isBotAdmin: false,
    settings
  }
  if (isGroup) {
    try {
      ctx.meta = await bot.groupMeta(jid)
      ctx.isAdmin = isAdminIn(ctx.meta, ctx.senderIds)
      ctx.isBotAdmin = isAdminIn(ctx.meta, botIds(sock))
    } catch (e) { log.warn('group meta:', e.message) }
  }
  ctx.reply = async (content, opts = {}) => {
    if (typeof content === 'string') content = { text: content }
    const sent = await sock.sendMessage(jid, content, { quoted: msg, ...opts })
    bot.remember(sent)
    return sent
  }
  ctx.react = (e) => sock.sendMessage(jid, { react: { text: e, key: msg.key } }).catch(() => {})
  ctx.download = async (m = null) => {
    const target = m || (ctx.mediaType(msg.message) ? msg : quoted)
    if (!target) return null
    return downloadMediaMessage(target, 'buffer', {}, { logger: waLogger, reuploadRequest: sock.updateMediaMessage })
  }
  ctx.mediaType = (message) => {
    const t = getType(message)
    return ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage'].includes(t) ? t : null
  }
  ctx.targetType = ctx.mediaType(msg.message) || (quoted && ctx.mediaType(quoted.message)) || null
  return ctx
}

// logs public hain: number poora mat likho
const maskNum = j => { const d = num(j); return d ? '…' + d.slice(-4) : '?' }
const sidTag = () => { const sid = currentSid(); if (sid === 'main') return 'main'; const b = guestNumber(sid); return b ? 'num …' + b.slice(-4) : 'num ' + sid.slice(0, 5) }
const guestNumbers = new Map()
export const setGuestNumber = (sid, n) => guestNumbers.set(sid, String(n || ''))
const guestNumber = sid => guestNumbers.get(sid) || ''

// Command chalao (permissions check ke sath)
export async function dispatch (ctx) {
  // built-in pehle; panel wali custom command built-in ko kabhi override nahi karti
  const cmd = commands.get(ctx.command) || customCommand(ctx.command)
  if (!cmd) return false
  // private = is number pe sirf owner (number ka apna account + asli owner). Baqi sab ko koi jawab nahi (error bhi nahi).
  // public: true wali commands (.pair, .rch) private mein bhi sab ke liye.
  if (isPrivateMode() && !ctx.owner && !cmd.public) { log.info(`[${sidTag()}] private mode: ${ctx.prefix}${ctx.command} from ${maskNum(ctx.sender)} ignore`); return false }
  if (cmd.owner && !ctx.owner) { await ctx.reply('❌ Ye command sirf owner ke liye hai.'); return true }
  if (cmd.superOwner && !ctx.superOwner) { await ctx.reply('❌ Ye command sirf AQDAS MD ke asli owner ke liye hai.'); return true }
  if (cmd.group && !ctx.isGroup) { await ctx.reply('❌ Ye command sirf group mein chalti hai.'); return true }
  if (cmd.admin && !ctx.isAdmin && !ctx.owner) { await ctx.reply('❌ Ye command sirf group admins ke liye hai.'); return true }
  if (cmd.botAdmin && !ctx.isBotAdmin) { await ctx.reply('❌ Pehle bot ko group admin banao.'); return true }
  log.cmd(`[${sidTag()}] ${ctx.prefix}${ctx.command} from ${maskNum(ctx.sender)}${ctx.owner ? ' (owner)' : ''} in ${ctx.isGroup ? 'group' : 'dm'} [mode ${settings.get('mode')}]`)
  if (settings.get('autoTyping')) ctx.sock.sendPresenceUpdate('composing', ctx.jid).catch(() => {})
  try { await cmd.run(ctx) } catch (e) {
    log.err(`${ctx.command}:`, e.message)
    await ctx.reply(`⚠️ Error: ${String(e.message).slice(0, 200)}`).catch(() => {})
  }
  return true
}

// Auto status: view + react — status aate hi FORAN seen (blue/view), phir 1-3 sec baad emoji react.
// Har number (sid) ki apni setting (data/s/<sid>/settings.json), har number max 120 react / ghanta.
// Har view/react ka nateeja bot.emit('statuslog') se status.json ke guest_log mein jata hai (fail bhi dikhe).
const statusHits = new Map() // sid -> [timestamps]
const statusSeen = new Map() // `${sid}:${id}` -> time (ek status do dafa na ho: decrypt retry / offline copy)
export const STATUS_MAX_PER_HOUR = 120
export const STATUS_MAX_AGE_MS = 24 * 3600000 // status 24 ghante rehta hai
export let statusDelay = () => 1000 + Math.floor(Math.random() * 2000)
export function _setStatusDelay (fn) { statusDelay = fn }
export function _resetStatus () { statusHits.clear(); statusSeen.clear() }
const maskJid = j => { const d = String(j || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, ''); return d ? '*'.repeat(Math.max(0, d.length - 4)) + d.slice(-4) : '?' }
const errText = e => String(e?.output?.payload?.message || e?.message || e || 'error').slice(0, 60)
const tsMs = msg => { const t = Number(msg?.messageTimestamp?.low ?? msg?.messageTimestamp ?? 0); return t ? t * 1000 : 0 }

// messages.upsert mein kaun sa message handle ho: 'notify' sab; 'append' (bot offline/restart ke dauran aaye, ya decrypt retry) sirf taaza status
export function wantUpsert (msg, type) {
  if (type === 'notify') return true
  if (msg?.key?.remoteJid !== 'status@broadcast' || msg.key.fromMe) return false
  const t = tsMs(msg)
  return !t || Date.now() - t < STATUS_MAX_AGE_MS
}

// asli status post hai ya nahi (delete / reaction / sirf key-distribution wale skip)
function isStatusPost (msg) {
  const m = msg.message
  if (!m) return msg.messageStubType === 2 // CIPHERTEXT: decrypt baad mein hoga, key kaafi hai seen/react ke liye
  if (m.protocolMessage || m.reactionMessage || m.encReactionMessage) return false
  return Object.keys(m).some(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo')
}

export async function handleStatus (bot, msg) {
  const sock = bot.sock
  if (!sock || msg.key.fromMe || msg.key.remoteJid !== 'status@broadcast') return
  const s = settings.load()
  if (!s.autoStatusView && !s.autoStatusReact) return
  if (!isStatusPost(msg)) return
  const poster = msg.key.participant || msg.key.participantAlt
  if (!poster || !msg.key.id) return
  const sid = currentSid()
  const seenKey = sid + ':' + msg.key.id
  if (statusSeen.has(seenKey)) return
  statusSeen.set(seenKey, Date.now())
  if (statusSeen.size > 2000) { for (const k of [...statusSeen.keys()].slice(0, 1000)) statusSeen.delete(k) }
  const who = maskJid(msg.key.participantAlt || poster)
  const out = (line) => { log.info(`[${sid}] status ${line}`); try { bot.emit?.('statuslog', line) } catch {} }
  // readMessages ko participant chahiye (warna WhatsApp status ka view nahi ginta)
  const key = { remoteJid: 'status@broadcast', id: msg.key.id, participant: poster, fromMe: false }
  let seen = 'off'
  // 1) FORAN seen — react ke liye bhi zaroori (bina dekhe react ajeeb lagta hai)
  try {
    await sock.readMessages([key])
    seen = 'seen ✅'
    const p = await sock.fetchPrivacySettings?.().catch(() => null)
    if (p && p.readreceipts && p.readreceipts !== 'all') seen = 'seen (read receipts OFF: saamne wale ko view nahi dikhega)'
  } catch (e) { seen = 'seen ❌ ' + errText(e) }
  if (!s.autoStatusReact) return out(`${who}: ${seen}`)
  // 2) cap: har number max 120 react / ghanta
  const now = Date.now()
  const hits = (statusHits.get(sid) || []).filter(t => now - t < 3600000)
  if (hits.length >= STATUS_MAX_PER_HOUR) { statusHits.set(sid, hits); return out(`${who}: ${seen}, react skip (${STATUS_MAX_PER_HOUR}/ghanta had)`) }
  hits.push(now); statusHits.set(sid, hits)
  // 3) 1-3 sec baad react. statusJidList ke baghair react poster tak pohanchta hi nahi.
  await new Promise(r => setTimeout(r, statusDelay()))
  if (bot.sock !== sock) return out(`${who}: ${seen}, react skip (reconnect)`)
  const emoji = pick(s.statusEmojis?.length ? s.statusEmojis : ['💚'])
  // poster aur apna jid ek hi addressing (lid ya phone) mein — dono form daalne se device double ho jate hain
  const lidMode = String(poster).endsWith('@lid')
  const me = jidNormalizedUser(lidMode && sock.user?.lid ? sock.user.lid : sock.user.id)
  const list = [...new Set([jidNormalizedUser(poster), me])]
  try {
    await sock.sendMessage('status@broadcast', { react: { text: emoji, key } }, { statusJidList: list })
    out(`${who}: ${seen}, react ${emoji} ✅`)
  } catch (e) { out(`${who}: ${seen}, react ${emoji} ❌ ${errText(e)}`) }
}

export async function antilink (ctx) {
  if (!ctx.isGroup || ctx.msg.key.fromMe) return false
  const g = settings.group(ctx.jid)
  if (!g.antilink || g.antilink === 'off') return false
  if (!hasLink(ctx.body) || ctx.isAdmin || ctx.owner) return false
  if (!ctx.isBotAdmin) return false
  await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key }).catch(() => {})
  g.warns = g.warns || {}
  const w = (g.warns[ctx.sender] = (g.warns[ctx.sender] || 0) + 1)
  settings.save()
  const raw = ctx.msg.key.participant || ctx.sender
  const tag = '@' + num(raw)
  if (g.antilink === 'kick' || w >= 3) {
    await ctx.sock.sendMessage(ctx.jid, { text: `🚫 ${tag} link bhejna mana hai. Remove kar diya.`, mentions: [raw] })
    await ctx.sock.groupParticipantsUpdate(ctx.jid, [raw], 'remove').catch(() => {})
    delete g.warns[ctx.sender]; settings.save()
  } else {
    await ctx.sock.sendMessage(ctx.jid, { text: `⚠️ ${tag} link bhejna mana hai! Warning ${w}/3`, mentions: [raw] })
  }
  return true
}

export async function handleMessage (bot, msg) {
  const jid = msg.key?.remoteJid
  // status pehle: decrypt-fail (message khali) status bhi seen ho sake
  if (jid === 'status@broadcast') { handleStatus(bot, msg).catch(e => log.warn('status:', e?.message || e)); return }
  if (!msg.message) return
  const sock = bot.sock
  if (jid?.endsWith('@newsletter')) return
  // anti-delete: copy sirf apni "Message yourself" chat mein
  if (antidelete.isRevoke(msg)) {
    if (settings.get('antiDelete') && !msg.key.fromMe) {
      const gname = jid.endsWith('@g.us') ? (await bot.groupMeta(jid).catch(() => null))?.subject : null
      await antidelete.onRevoke(bot, msg, { groupName: gname }).catch(() => {})
    }
    return
  }
  if (settings.get('antiDelete')) antidelete.remember(currentSid(), msg)
  if (settings.get('autoRead') && !msg.key.fromMe) sock.readMessages([msg.key]).catch(() => {})
  const emoji = decideReact(msg, settings.load())
  if (emoji) sock.sendMessage(jid, { react: { text: emoji, key: msg.key } }).catch(() => {})
  const ctx = await buildCtx(bot, msg)
  if (await antilink(ctx)) return
  if (ctx.isCmd && ctx.command) { if (await dispatch(ctx)) return }
  await autoAI(ctx).catch(e => log.warn('autoai:', e?.message || e))
}

// ===== Auto AI: is number pe aane wale DMs ka AI jawab (owner .autoai on kare) =====
const aiLast = new Map()
let noKeyWarn = 0
export const isBotMsgId = id => /^(3EB0|BAE5)/.test(String(id || ''))
export async function autoAI (ctx) {
  const s = settings.load()
  if (!s.autoAI || ctx.isCmd || ctx.msg.key.fromMe) return false
  if (isPrivateMode() && !ctx.owner) return false // private: strangers ko AI jawab bhi nahi
  const id = ctx.msg.key.id
  if (isBotMsgId(id)) return false // doosre bots
  const text = (ctx.body || '').trim()
  if (!text || text.startsWith(ctx.prefix || '.')) return false
  if (ctx.isGroup) {
    if (!s.autoAIGroup) return false
    const mine = botIds(ctx.sock)
    const tagged = ctx.mentioned.some(j => mine.includes(jidNormalizedUser(j))) || (ctx.quoted && ctx.quoted.key.fromMe)
    if (!tagged) return false // group mein sirf jab bot ko tag / reply karein
  }
  if (!(await aiKey())) { if (Date.now() - noKeyWarn > 600000) { noKeyWarn = Date.now(); log.warn('autoai: AI key nahi (OPENROUTER_API_KEY secret / Firestore settings/openrouter)') } return false }
  const key = currentSid() + '|' + ctx.jid
  if (Date.now() - (aiLast.get(key) || 0) < 5000) return false
  aiLast.set(key, Date.now())
  ctx.sock.sendPresenceUpdate('composing', ctx.jid).catch(() => {})
  const a = await askAI(key, text, { system: AQDAS_AI, keep: 12 })
  await ctx.reply(a)
  return true
}

const fill = (tpl, vars) => tpl.replace(/@user/g, vars.user).replace(/@group/g, vars.group).replace(/@count/g, vars.count).replace(/@desc/g, vars.desc)

export async function handleGroupUpdate (bot, ev) {
  const g = settings.group(ev.id)
  const isAdd = ev.action === 'add', isRemove = ev.action === 'remove'
  if (!((isAdd && g.welcome) || (isRemove && g.goodbye))) return
  const meta = await bot.groupMeta(ev.id).catch(() => null)
  for (const p of ev.participants) {
    const id = participantIds(p)[0]
    if (botIds(bot.sock).includes(jidNormalizedUser(id))) continue
    const vars = { user: '@' + num(id), group: meta?.subject || 'group', count: String(meta?.participants?.length || ''), desc: meta?.desc || '' }
    const text = isAdd
      ? fill(g.welcomeText || '👋 Assalam o Alaikum @user!\n*@group* mein khush aamdeed 🎉\nAb hum @count members hain.\n\n_— AQDAS MD_', vars)
      : fill(g.goodbyeText || '👋 @user group chhor gaye. Allah Hafiz!\n_— AQDAS MD_', vars)
    let pp = null
    if (isAdd) { try { pp = await bot.sock.profilePictureUrl(id, 'image') } catch {} }
    const content = pp ? { image: { url: pp }, caption: text, mentions: [id] } : { text, mentions: [id] }
    await bot.sock.sendMessage(ev.id, content).catch(() => {})
  }
}

export function startPresenceLoop (bot) {
  clearInterval(bot._presenceTimer)
  const tick = () => runAs(bot.id, () => bot.sock?.sendPresenceUpdate(settings.get('alwaysOnline') ? 'available' : 'unavailable').catch(() => {}))
  tick()
  bot._presenceTimer = setInterval(tick, 60000)
}
