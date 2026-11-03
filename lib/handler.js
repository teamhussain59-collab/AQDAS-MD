import { jidNormalizedUser, downloadMediaMessage } from '@whiskeysockets/baileys'
import config from '../config.js'
import * as settings from './settings.js'
import { runAs } from './ctx.js'
import { commands } from './plugins.js'
import { decideReact } from './autoreact.js'
import { log, waLogger } from './logger.js'
import { getBody, getType, senderIds, isAdminIn, botIds, num, pick, hasLink, participantIds } from './utils.js'
import { currentSid } from './ctx.js'
import { askAI, AQDAS_AI } from './ai.js'
import * as antidelete from './antidelete.js'

export function isOwner (bot, msg) {
  if (msg.key.fromMe) return true
  const ids = senderIds(msg, bot.sock).map(num)
  return ids.some(n => config.ownerNumbers.includes(n))
}

// poore bot (sab numbers) pe asar wali commands (restart / reload): sirf asli owner ya main bot ka apna number
export function isSuperOwner (bot, msg) {
  const ids = senderIds(msg, bot.sock).map(num)
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

// Command chalao (permissions check ke sath)
export async function dispatch (ctx) {
  const cmd = commands.get(ctx.command)
  if (!cmd) return false
  const mode = settings.get('mode')
  if (mode === 'private' && !ctx.owner) return false
  if (cmd.owner && !ctx.owner) { await ctx.reply('❌ Ye command sirf owner ke liye hai.'); return true }
  if (cmd.superOwner && !ctx.superOwner) { await ctx.reply('❌ Ye command sirf AQDAS MD ke asli owner ke liye hai.'); return true }
  if (cmd.group && !ctx.isGroup) { await ctx.reply('❌ Ye command sirf group mein chalti hai.'); return true }
  if (cmd.admin && !ctx.isAdmin && !ctx.owner) { await ctx.reply('❌ Ye command sirf group admins ke liye hai.'); return true }
  if (cmd.botAdmin && !ctx.isBotAdmin) { await ctx.reply('❌ Pehle bot ko group admin banao.'); return true }
  log.cmd(`${ctx.prefix}${ctx.command} from ${num(ctx.sender)} in ${ctx.isGroup ? (ctx.meta?.subject || 'group') : 'private'}`)
  if (settings.get('autoTyping')) ctx.sock.sendPresenceUpdate('composing', ctx.jid).catch(() => {})
  try { await cmd.run(ctx) } catch (e) {
    log.err(`${ctx.command}:`, e.message)
    await ctx.reply(`⚠️ Error: ${String(e.message).slice(0, 200)}`).catch(() => {})
  }
  return true
}

// Auto status: view + react — natural lagne ke liye har status pe 5-20 sec random intezar, har number max 60 react / ghanta
const statusHits = new Map() // sid -> [timestamps]
export const STATUS_MAX_PER_HOUR = 60
export let statusDelay = () => 5000 + Math.floor(Math.random() * 15000)
export function _setStatusDelay (fn) { statusDelay = fn }
export async function handleStatus (bot, msg) {
  const sock = bot.sock
  if (msg.key.fromMe) return
  const s = settings.load()
  if (!s.autoStatusView && !s.autoStatusReact) return
  const sid = currentSid()
  await new Promise(r => setTimeout(r, statusDelay()))
  if (bot.sock !== sock) return
  if (s.autoStatusView || s.autoStatusReact) await sock.readMessages([msg.key]).catch(() => {})
  if (s.autoStatusReact) {
    const now = Date.now()
    const hits = (statusHits.get(sid) || []).filter(t => now - t < 3600000)
    if (hits.length >= STATUS_MAX_PER_HOUR) { statusHits.set(sid, hits); return }
    const poster = msg.key.participantAlt || msg.key.participant
    const me = jidNormalizedUser(sock.user.id)
    if (poster) {
      hits.push(now); statusHits.set(sid, hits)
      await sock.sendMessage('status@broadcast', { react: { text: pick(s.statusEmojis), key: msg.key } },
        { statusJidList: [jidNormalizedUser(poster), me] }).catch(() => {})
    }
  }
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
  if (!msg.message) return
  const sock = bot.sock
  const jid = msg.key.remoteJid
  if (jid === 'status@broadcast') { handleStatus(bot, msg).catch(() => {}); return }
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
export const isBotMsgId = id => /^(3EB0|BAE5)/.test(String(id || ''))
export async function autoAI (ctx) {
  const s = settings.load()
  if (!s.autoAI || ctx.isCmd || ctx.msg.key.fromMe) return false
  if (!config.openrouterKey) return false
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
