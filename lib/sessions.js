// ===== Session manager: har linked number apna bot =====
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import config from '../config.js'
import { log } from './logger.js'
import { Bot, bot as mainBot } from './bot.js'
import * as settings from './settings.js'
import * as store from './store.js'

export const MAX_SESSIONS = Math.max(1, Number(process.env.MAX_SESSIONS || 10))
const guests = new Map() // sid -> { bot, number, token, createdAt, state }
const byToken = new Map() // token -> sid
const digits = v => String(v || '').replace(/[^0-9]/g, '')
const sessionsRoot = path.join(path.dirname(config.sessionDir), 'sessions')
export const mask = n => { const d = digits(n); return d ? '*'.repeat(Math.max(0, d.length - 4)) + d.slice(-4) : '' }

function packFor (sid, b, number) {
  return () => ({ number: number || digits(b.number), files: store.packDir(b.sessionDir), settings: settings.exportFor(sid) })
}

function wire (sid, b, number) {
  b.on('creds', () => { if (b.registered) store.scheduleSave(sid, packFor(sid, b, number)) })
  b.on('open', () => { store.scheduleSave(sid, packFor(sid, b, number), 3000) })
}

// main bot: store se session wapis + auto save
export async function prepareMain (saved) {
  const m = saved.find(s => s.sid === 'main')
  const credsFile = path.join(mainBot.sessionDir, 'creds.json')
  if (m && !fs.existsSync(credsFile)) {
    store.unpackDir(mainBot.sessionDir, m.files)
    if (m.settings) settings.importFor('main', m.settings)
    log.ok('Main bot ka session GitHub store se wapis aa gaya')
  }
  wire('main', mainBot, mainBot.pairNumber || 'main')
  mainBot.on('logged_out', () => store.remove('main'))
}

function addGuest (sid, number, opts = {}) {
  const dir = path.join(sessionsRoot, sid)
  const b = new Bot({ id: sid, sessionDir: dir, pairNumber: number, oneShot: true, pairMode: opts.mode || 'code' })
  const token = crypto.randomBytes(16).toString('hex')
  const g = { bot: b, number, token, createdAt: Date.now(), state: opts.restored ? 'restoring' : 'pairing', mode: opts.mode || 'code' }
  guests.set(sid, g); byToken.set(token, sid)
  wire(sid, b, number)
  b.on('open', () => { g.state = 'connected'; g.linkedAt = g.linkedAt || Date.now(); if (!g.number) g.number = digits(b.number) })
  b.on('linking', () => { g.state = 'linking' })
  b.on('pair_failed', () => { g.state = 'expired'; dropGuest(sid, false) })
  b.on('logged_out', () => { g.state = 'logged_out'; dropGuest(sid, true) })
  return g
}

async function dropGuest (sid, wipeStore) {
  const g = guests.get(sid)
  if (!g) return
  await g.bot.stop().catch(() => {})
  try { fs.rmSync(g.bot.sessionDir, { recursive: true, force: true }) } catch {}
  if (wipeStore || g.state !== 'connected') settings.dropFor(sid)
  if (wipeStore) await store.remove(sid)
  guests.delete(sid)
  // token thori der rakho taake page "expire / logout" dikha sake
  setTimeout(() => { if (byToken.get(g.token) === sid && !guests.has(sid)) byToken.delete(g.token) }, 10 * 60000)
  finished.set(g.token, { state: g.state, at: Date.now() })
  log.info(`[num ${mask(g.number)}] session hata diya (${g.state})`)
}
const finished = new Map()

// saved guests wapis chalao
export async function restoreGuests (saved) {
  for (const s of saved) {
    if (s.sid === 'main' || !s.number || !s.files?.['creds.json']) continue
    if (guests.size >= MAX_SESSIONS) break
    const g = addGuest(s.sid, s.number, { restored: true })
    store.unpackDir(g.bot.sessionDir, s.files)
    if (s.settings) settings.importFor(s.sid, s.settings)
    g.bot.oneShot = false
    g.bot.start().catch(e => log.err('guest start:', e.message))
  }
  if (saved.length) log.ok(`${guests.size} extra number(s) GitHub store se wapis chal rahe hain`)
}

export const slotsUsed = () => guests.size
export const accepting = () => guests.size < MAX_SESSIONS

// web page se naya number: pairing code wapis
export async function pairGuest (raw) {
  const number = digits(raw)
  if (number.length < 10 || number.length > 15) throw Object.assign(new Error('Number ghalat hai. Country code ke sath likho, misal: 923001234567'), { code: 400 })
  if (mainBot.number && digits(mainBot.number) === number) throw Object.assign(new Error('Ye number pehle se main bot hai.'), { code: 409 })
  const sid = store.sidFor(number)
  const old = guests.get(sid)
  if (old) {
    if (old.state === 'connected' || old.state === 'restoring') throw Object.assign(new Error('Ye number pehle se linked hai ✅ Bot chal raha hai.'), { code: 409 })
    if (old.bot.pairCode) return { token: old.token, code: old.bot.pairCode, reused: true }
    await dropGuest(sid, false)
  }
  if (!accepting()) throw Object.assign(new Error(`Slots full hain (${MAX_SESSIONS}/${MAX_SESSIONS}). Thori der baad try karo.`), { code: 503 })
  const g = addGuest(sid, number)
  try { fs.rmSync(g.bot.sessionDir, { recursive: true, force: true }) } catch {}
  const code = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WhatsApp se code nahi aaya (timeout). Dobara try karo.')), 45000)
    g.bot.once('pair', c => { clearTimeout(t); resolve(c) })
    g.bot.once('pair_error', e => { clearTimeout(t); reject(e) })
    g.bot.start().catch(e => { clearTimeout(t); reject(e) })
  }).catch(async e => { await dropGuest(sid, false); throw Object.assign(e, { code: 502 }) })
  return { token: g.token, code }
}

// QR se link (dusre phone / PC pe page khol ke scan): WhatsApp ki July 2026 tabdeeli ke baad yehi reliable hai
export async function pairGuestQR () {
  if (!accepting()) throw Object.assign(new Error(`Slots full hain (${MAX_SESSIONS}/${MAX_SESSIONS}). Thori der baad try karo.`), { code: 503 })
  const sid = 'q' + crypto.randomBytes(8).toString('hex')
  const g = addGuest(sid, '', { mode: 'qr' })
  const qr = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WhatsApp se QR nahi aaya (timeout). Dobara try karo.')), 40000)
    g.bot.once('qr', q => { clearTimeout(t); resolve(q) })
    g.bot.start().catch(e => { clearTimeout(t); reject(e) })
  }).catch(async e => { await dropGuest(sid, false); throw Object.assign(e, { code: 502 }) })
  return { token: g.token, qr }
}

export function pairStatus (token) {
  const sid = byToken.get(String(token || ''))
  const g = sid && guests.get(sid)
  if (g) return { state: g.state, mode: g.mode, code: g.state === 'pairing' && g.mode === 'code' ? g.bot.pairCode : null, qr: g.state === 'pairing' && g.mode === 'qr' ? g.bot.qr : null, code_at: g.bot.pairCodeAt || null, number: mask(g.number) }
  const f = finished.get(String(token || ''))
  return f ? { state: f.state } : { state: 'unknown' }
}

export function list () {
  const rows = [{ id: 'main', number: mainBot.number || mainBot.pairNumber || '', status: mainBot.status, main: true }]
  for (const [sid, g] of guests) rows.push({ id: sid, number: g.number, status: g.state, since: new Date(g.linkedAt || g.createdAt).toISOString() })
  return rows
}

export async function removeGuest (sid) {
  const g = guests.get(sid)
  if (!g) throw Object.assign(new Error('Session nahi mila'), { code: 404 })
  try { await g.bot.sock?.logout() } catch {}
  g.state = 'logged_out'
  await dropGuest(sid, true)
}

export async function saveAll () { await store.saveAll() }
