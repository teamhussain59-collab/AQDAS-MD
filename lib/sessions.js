// ===== Session manager: har linked number apna bot =====
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import config from '../config.js'
import { log } from './logger.js'
import { Bot, bot as mainBot } from './bot.js'
import * as settings from './settings.js'
import * as store from './store.js'
import { setExtra } from './ghstatus.js'
import { setGuestNumber } from './handler.js'
import * as memguard from './memguard.js'
import { getMaker, brandOf } from './makers.js'

// Bot Maker: is number pe maker ka naam / owner / channel / DP / song laga do
export async function applyMaker (sid, slug) {
  const m = getMaker(slug)
  if (!m) return false
  const dir = settings.dir(sid)
  fs.mkdirSync(dir, { recursive: true })
  if (m.dp) fs.writeFileSync(path.join(dir, 'menu_dp.jpg'), Buffer.from(m.dp, 'base64'))
  if (m.song) fs.writeFileSync(path.join(dir, 'menu_song.mp3'), Buffer.from(m.song, 'base64'))
  const st = settings.load(sid)
  st.brand = brandOf(m); st.brandV = m.v
  settings.save(sid)
  store.saveAssets(sid, dir).catch(() => {})
  return true
}

// Slots ki koi ginti nahi (pehle 10 thi): nayi pairing memory guard pe — RAM khatam ho to politely mana
export const MAX_SESSIONS = 'unlimited'
const guests = new Map() // sid -> { bot, number, token, createdAt, state }
const byToken = new Map() // token -> sid
const digits = v => String(v || '').replace(/[^0-9]/g, '')
const sessionsRoot = path.join(path.dirname(config.sessionDir), 'sessions')
export const mask = n => { const d = digits(n); return d ? '*'.repeat(Math.max(0, d.length - 4)) + d.slice(-4) : '' }

// custom menu song / DP (sirf jo file local mein nahi, woh store se)
export function restoreAssets (sid, assets) {
  const dir = settings.dir(sid)
  const missing = Object.fromEntries(Object.entries(assets || {}).filter(([f]) => !fs.existsSync(path.join(dir, f))))
  const n = store.unpackAssets(dir, missing)
  if (n) log.ok(`[${sid === 'main' ? 'main' : 'num'}] custom song/DP wapis (${n} file)`)
}

// koi setting badle (.autoreact on waghera) to session file 5 sec mein save
settings.onSaved(sid => store.touch(sid))

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
  if (m?.assets) restoreAssets('main', m.assets)
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
  if (number) setGuestNumber(sid, number)
  b.on('open', () => {
    g.state = 'connected'; g.linkedAt = g.linkedAt || Date.now(); if (!g.number) g.number = digits(b.number); setGuestNumber(sid, g.number); pushDiag(g, 'CONNECTED ✅')
    // asli owner ka apna (personal) number naya link ho to private se shuru: us ke contacts ko bot ka jawab na jaye (.mode public se khol sakta hai)
    if (!opts.restored && !g.modeInit && config.ownerNumbers.includes(digits(g.number)) && settings.exportFor(sid) === null) { g.modeInit = true; settings.load(sid).mode = 'private'; settings.save(sid) }
    // panel pe "react group" checkbox: pehli dafa link hote hi (welcome message se pehle) yaad rakho
    if (opts.chGroup && !g.chApplied) { g.chApplied = true; const st = settings.load(sid); if (!st.chGroup) { st.chGroup = true; settings.save(sid) } }
    if (opts.maker && !g.makerApplied) { g.makerApplied = true; applyMaker(sid, opts.maker).then(ok => ok && pushDiag(g, 'brand: ' + opts.maker)).catch(() => {}) }
  })
  b.on('linking', () => { g.state = 'linking'; pushDiag(g, 'LINKING (phone ne code accept kiya)') })
  b.on('diag', (d) => { g.diag = d; publishDiag() })
  b.on('pair', () => pushDiag(g, 'code bana'))
  b.on('statuslog', (line) => pushDiag(g, 'status ' + line))
  b.on('pair_error', (e) => pushDiag(g, 'code error: ' + (e?.message || e)))
  b.on('pair_failed', (code) => { g.state = 'expired'; pushDiag(g, 'expired / closed (code ' + (code || '?') + ')'); publishDiagNow(g); dropGuest(sid, false) })
  b.on('closed', (code, why) => pushDiag(g, `connection close ${code || '?'} ${String(why || '').slice(0, 60)}`))
  b.on('logged_out', () => { pushDiag(g, 'logged out'); publishDiagNow(g); g.state = 'logged_out'; dropGuest(sid, true) })
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

// GitHub status.json mein aakhri pairing koshishon ka khulasa (number masked) — debugging ke liye
const diagLog = []
// status.json mein har number ki haalat (masked) — restart ke baad check karna aasaan
const linkedSummary = () => [...guests.entries()].map(([sid, x]) => { let st = {}; try { st = settings.load(sid) } catch {} return { number: mask(x.number) || 'qr', state: x.state, autostatus: st.autoStatusReact ? 'view+react' : st.autoStatusView ? 'view' : 'off' } })
function pushDiag (g, msg) { diagLog.push(`${new Date().toISOString().slice(11, 19)} ${mask(g.number) || 'qr'}: ${msg}`); if (diagLog.length > 40) diagLog.shift(); publishDiag() }
let diagT = null
function publishDiag () {
  clearTimeout(diagT)
  diagT = setTimeout(() => {
    const last = [...guests.values()].filter(x => x.diag?.length).sort((a, b) => b.createdAt - a.createdAt)[0]
    setExtra({ linked: linkedSummary(), guest_log: diagLog.slice(-20), guest_frames: last ? { number: mask(last.number), state: last.state, frames: last.diag.slice(-25) } : null })
  }, 4000)
}

function publishDiagNow (g) { if (g.diag?.length) setExtra({ guest_log: diagLog.slice(-20), guest_frames: { number: mask(g.number), state: g.state, frames: g.diag.slice(-25) } }) }

// saved guests wapis chalao
export async function restoreGuests (saved) {
  memguard.markBaseline()
  startMemStats()
  for (const s of saved) {
    if (s.sid === 'main' || !s.number || !s.files?.['creds.json']) continue
    if (memguard.availableMB() < 250) { log.warn(`RAM bohat kam (${memguard.availableMB()} MB) — baqi saved numbers abhi restore nahi`); break }
    const g = addGuest(s.sid, s.number, { restored: true })
    store.unpackDir(g.bot.sessionDir, s.files)
    if (s.settings) settings.importFor(s.sid, s.settings)
    if (s.assets) restoreAssets(s.sid, s.assets)
    g.bot.oneShot = false
    g.bot.start().catch(e => log.err('guest start:', e.message))
  }
  if (saved.length) log.ok(`${guests.size} extra number(s) GitHub store se wapis chal rahe hain`)
  if (guests.size) publishDiag()
}

export const slotsUsed = () => guests.size
export const accepting = () => memguard.check().ok
export const busyReason = () => memguard.check().reason || null
let memTimer = null
export function startMemStats () {
  if (memTimer) return
  const pub = () => setExtra({ slots_max: 'unlimited', mem: memguard.stats(guests.size) })
  setTimeout(pub, 60000).unref?.()
  memTimer = setInterval(pub, 5 * 60000); memTimer.unref?.()
}

// web page se naya number: pairing code wapis
export async function pairGuest (raw, opts = {}) {
  const number = digits(raw)
  if (number.length < 10 || number.length > 15) throw Object.assign(new Error('Number ghalat hai. Country code ke sath likho, misal: 923001234567'), { code: 400 })
  if (mainBot.number && digits(mainBot.number) === number) throw Object.assign(new Error('Ye number pehle se main bot hai.'), { code: 409 })
  const sid = store.sidFor(number)
  const old = guests.get(sid)
  if (old) {
    if (old.state === 'connected' || old.state === 'restoring') throw Object.assign(new Error('Ye number pehle se linked hai ✅ Bot chal raha hai.'), { code: 409 })
    if (old.state === 'linking') throw Object.assign(new Error('Is number pe abhi link ho raha hai, 1 minute ruko.'), { code: 409 })
    await dropGuest(sid, false) // "Naya code lo": purana code band, naya socket
  }
  { const m = memguard.check(); if (!m.ok) throw Object.assign(new Error(m.reason), { code: 503 }) }
  const g = addGuest(sid, number, { chGroup: !!opts.chGroup, maker: opts.maker || null })
  if (opts.maker) await applyMaker(sid, opts.maker).catch(() => {})
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
export async function pairGuestQR (opts = {}) {
  { const m = memguard.check(); if (!m.ok) throw Object.assign(new Error(m.reason), { code: 503 }) }
  const sid = 'q' + crypto.randomBytes(8).toString('hex')
  const g = addGuest(sid, '', { mode: 'qr', chGroup: !!opts.chGroup, maker: opts.maker || null })
  const qr = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WhatsApp se QR nahi aaya (timeout). Dobara try karo.')), 40000)
    g.bot.once('qr', q => { clearTimeout(t); resolve(q) })
    g.bot.start().catch(e => { clearTimeout(t); reject(e) })
  }).catch(async e => { await dropGuest(sid, false); throw Object.assign(e, { code: 502 }) })
  return { token: g.token, qr }
}

// .pair se pehle: ye number pehle se juda hai? (main bot / connected / restoring / linking)
export function numberState (raw) {
  const number = digits(raw)
  if (mainBot.number && digits(mainBot.number) === number) return 'main'
  const g = guests.get(store.sidFor(number))
  return g ? g.state : null
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

// abhi connected numbers (main bhi, agar chal raha ho) — channel react group waghera ke liye
export function liveBots () {
  const out = []
  if (mainBot.sock && mainBot.status === 'open') out.push({ sid: 'main', bot: mainBot, number: digits(mainBot.number) })
  for (const [sid, g] of guests) if (g.state === 'connected' && g.bot.sock && g.bot.status === 'open') out.push({ sid, bot: g.bot, number: g.number })
  return out
}
export const getGuest = sid => guests.get(sid)

// sab numbers (main + linked) ka mode: .mode private all
export function allSids () {
  const out = []
  if (mainBot.sock || mainBot.registered) out.push({ sid: 'main', number: digits(mainBot.number) })
  for (const [sid, g] of guests) if (g.state === 'connected' || g.state === 'restoring') out.push({ sid, number: g.number })
  return out
}

export async function saveAll () { await store.saveAll() }
