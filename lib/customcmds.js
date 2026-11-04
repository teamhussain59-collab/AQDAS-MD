// ===== Custom commands (admin panel se) =====
// docs/commands.html (admin password) Firestore mein commands + menu media likhta hai (collection aqdasmdcmd,
// doc id = sha256 of password — bina password koi parh / likh nahi sakta). Bot service account (FIREBASE_SA) se
// har ~5 sec check karta hai aur commands bina restart ke load / unload karta hai.
// Custom code bot ke process mein NAHI chalta: lib/sandbox-runner.cjs alag process (khaali env, Node permission model,
// 64 MB, timeout). Code ko sirf `ctx` milta hai: args, text, sender, isOwner, reply, sendImage, react, get.
// Built-in command ke naam pe custom command kabhi nahi banti (save pe bhi, load pe bhi reject).
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fork, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { log } from './logger.js'
import { commands } from './plugins.js'
import { runAs } from './ctx.js'
import * as settings from './settings.js'

export const COLLECTION = 'aqdasmdcmd'
export const NAME_RE = /^[a-z0-9]{1,30}$/
export const MAX_CODE = 60000
export const CPU_MS = 3000 // code ka synchronous hissa (loop waghera)
export const WALL_MS = 10000 // poori command (reply, get waghera samait)
const MAX_SENDS = 5, MAX_REACTS = 3, MAX_GETS = 3, MAX_PARALLEL = 3
const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sandbox-runner.cjs')

// name -> { name, code, public, desc, updated }
export const customs = new Map()
let lastRejected = []

export const isBuiltin = (name) => commands.has(String(name || '').toLowerCase())
export const getCustom = (name) => customs.get(String(name || '').toLowerCase()) || null
export const customList = () => [...customs.values()].sort((a, b) => a.name.localeCompare(b.name))
export const rejected = () => lastRejected

// Firestore ka data (JSON) -> commands. Ghalat / built-in naam wali skip. Hamesha poora set replace (delete = unload).
export function applyData (raw) {
  let obj = raw
  if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch { obj = null } }
  const list = Array.isArray(obj?.cmds) ? obj.cmds : []
  const next = new Map(), bad = []
  for (const c of list) {
    const name = String(c?.name || '').toLowerCase()
    if (!NAME_RE.test(name)) { bad.push({ name, why: 'naam sirf a-z 0-9 (max 30)' }); continue }
    if (isBuiltin(name)) { bad.push({ name, why: 'built-in command ka naam' }); continue }
    if (c.enabled === false) continue
    const code = typeof c.code === 'string' ? c.code : ''
    if (!code.trim() || code.length > MAX_CODE) { bad.push({ name, why: 'code khaali ya bohat bara' }); continue }
    if (next.has(name)) continue
    next.set(name, { name, code, public: c.public === true, desc: String(c.desc || '').slice(0, 80), updated: String(c.updated || '') })
  }
  const before = [...customs.keys()].sort().join(','), after = [...next.keys()].sort().join(',')
  customs.clear(); for (const [k, v] of next) customs.set(k, v)
  lastRejected = bad
  if (before !== after) log.ok(`Custom commands: ${customs.size} loaded${bad.length ? `, ${bad.length} rejected` : ''}`)
  for (const b of bad) log.warn(`custom .${b.name || '?'} reject: ${b.why}`)
  return { loaded: customs.size, rejected: bad }
}

// dispatch ke liye command object (built-in pehle check hoti hai, custom us ko override nahi kar sakti)
// public:false (default) = sirf owner. public:true = mode ke hisaab se (private mein phir bhi sirf owner).
export function customCommand (name) {
  const c = getCustom(name)
  if (!c || isBuiltin(c.name)) return null
  return { name: c.name, category: 'custom', desc: c.desc || 'Custom command (panel)', owner: !c.public, custom: true, run: (ctx) => runCustom(ctx, c) }
}

// ---------- sandbox ----------
let permFlag
function permissionFlag () {
  if (permFlag !== undefined) return permFlag
  permFlag = null
  for (const f of ['--permission', '--experimental-permission']) {
    try {
      const r = spawnSync(process.execPath, [f, '--allow-fs-read=' + RUNNER, '-e', '0'], { env: {}, timeout: 10000, stdio: 'ignore' })
      if (r.status === 0) { permFlag = f; break }
    } catch {}
  }
  if (!permFlag) log.warn('Node permission model nahi mila — custom commands sirf vm + khaali env mein chalengi')
  return permFlag
}

const BLOCK_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i
function badHost (h) {
  h = String(h || '').replace(/^\[|\]$/g, '')
  if (BLOCK_HOST.test(h)) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  return h.includes(':') // IPv6 literal: block
}
// https GET, 5 sec, max 1 MB
export async function safeGet (url, maxBytes = 1048576, asBuffer = false) {
  let u
  try { u = new URL(String(url)) } catch { throw new Error('ghalat link') }
  if (u.protocol !== 'https:') throw new Error('sirf https links')
  if (badHost(u.hostname)) throw new Error('ye link allowed nahi')
  const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'AQDAS-MD' } })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  if (r.url && new URL(r.url).protocol !== 'https:') throw new Error('sirf https links')
  const len = Number(r.headers.get('content-length') || 0)
  if (len > maxBytes) throw new Error('file bohat bari')
  const reader = r.body.getReader(); const parts = []; let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.length
    if (n > maxBytes) { try { reader.cancel() } catch {} ; throw new Error('file bohat bari') }
    parts.push(value)
  }
  const buf = Buffer.concat(parts.map(p => Buffer.from(p)))
  return asBuffer ? buf : buf.toString('utf8')
}

async function imageFrom (src) {
  src = String(src || '')
  if (/^https:\/\//i.test(src)) return safeGet(src, 5 * 1048576, true)
  const b64 = src.replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '')
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) throw new Error('image: https link ya base64 do')
  const buf = Buffer.from(b64, 'base64')
  if (!buf.length || buf.length > 5 * 1048576) throw new Error('image bohat bari / khaali')
  return buf
}

let running = 0
// kabhi throw nahi karta. { ok, error?, logs }
export async function runCustom (ctx, c, opts = {}) {
  const wall = opts.wallMs || WALL_MS, cpu = opts.cpuMs || CPU_MS
  const fail = async (why) => {
    log.warn(`custom .${c.name} error: ${why}`)
    if (ctx.owner) await Promise.resolve(ctx.reply('❌ Command error: ' + String(why).slice(0, 150))).catch(() => {})
    return { ok: false, error: why }
  }
  if (running >= MAX_PARALLEL) return fail('bot busy, thori der baad')
  running++
  let child
  try {
    const flag = permissionFlag()
    const execArgv = ['--max-old-space-size=64', '--disallow-code-generation-from-strings']
    if (flag) execArgv.unshift(flag, '--allow-fs-read=' + RUNNER)
    child = fork(RUNNER, [], { execArgv, env: {}, cwd: path.dirname(RUNNER), stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json' })
  } catch (e) { running--; return fail('sandbox start nahi hua') }

  const data = JSON.stringify({
    args: ctx.args || [], text: ctx.text || '', command: c.name, prefix: ctx.prefix || '.',
    sender: String(ctx.sender || '').split('@')[0].split(':')[0], pushName: ctx.pushName || '',
    isOwner: !!ctx.owner, isGroup: !!ctx.isGroup, quotedText: quotedText(ctx)
  })
  let sends = 0, reacts = 0, gets = 0, finished = false
  const result = await new Promise((resolve) => {
    const end = (r) => { if (finished) return; finished = true; clearTimeout(timer); try { child.kill('SIGKILL') } catch {}; resolve(r) }
    const timer = setTimeout(() => end({ ok: false, error: `timeout (${Math.round(wall / 1000)} sec)` }), wall)
    const answer = (id, ok, v) => { if (!finished && child.connected) { try { child.send({ t: 'res', id, ok, v: ok ? v : undefined, e: ok ? undefined : String(v) }) } catch {} } }
    child.on('error', () => end({ ok: false, error: 'sandbox error' }))
    child.on('exit', () => end({ ok: false, error: 'command beech mein band ho gayi' }))
    child.on('message', async (m) => {
      if (!m || typeof m !== 'object' || finished) return
      try {
        if (m.t === 'ready') return child.send({ t: 'job', code: c.code, data, cpuMs: cpu })
        if (m.t === 'done') return end({ ok: true, logs: m.logs || [] })
        if (m.t === 'error') return end({ ok: false, error: String(m.e || 'error').slice(0, 300), logs: m.logs || [] })
        if (m.t !== 'op') return
        const a = (m.a && typeof m.a === 'object') ? m.a : {}
        if (m.op === 'reply') {
          if (++sends > MAX_SENDS) return answer(m.id, false, `ek command max ${MAX_SENDS} messages`)
          const text = String(a.text ?? '').slice(0, 4000)
          if (!text) return answer(m.id, false, 'khaali reply')
          await ctx.reply(text); return answer(m.id, true, 'ok')
        }
        if (m.op === 'image') {
          if (++sends > MAX_SENDS) return answer(m.id, false, `ek command max ${MAX_SENDS} messages`)
          const buf = await imageFrom(a.src)
          await ctx.reply({ image: buf, caption: String(a.caption ?? '').slice(0, 1000) }); return answer(m.id, true, 'ok')
        }
        if (m.op === 'react') {
          if (++reacts > MAX_REACTS) return answer(m.id, false, 'bohat reacts')
          await ctx.react(String(a.emoji ?? '').slice(0, 8)); return answer(m.id, true, 'ok')
        }
        if (m.op === 'get') {
          if (++gets > MAX_GETS) return answer(m.id, false, `ek command max ${MAX_GETS} links`)
          return answer(m.id, true, await safeGet(a.url))
        }
        if (m.op === 'sleep') { await new Promise(r => setTimeout(r, Math.min(3000, Math.max(0, Number(a.ms) || 0)))); return answer(m.id, true, 'ok') }
        return answer(m.id, false, 'ye kaam allowed nahi')
      } catch (e) { answer(m.id, false, String(e?.message || e).slice(0, 200)) }
    })
  })
  running--
  if (!result.ok) { const r = await fail(result.error); return { ...r, logs: result.logs || [] } }
  return result
}

function quotedText (ctx) {
  try {
    const q = ctx.quoted?.message
    if (!q) return ''
    return String(q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '').slice(0, 2000)
  } catch { return '' }
}

// ---------- Firestore ----------
let sa = null
try { if (process.env.FIREBASE_SA) sa = JSON.parse(process.env.FIREBASE_SA) } catch {}
const ON = !!(sa && sa.private_key && sa.client_email && sa.project_id)
const BASE = () => `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`
let tok = null, tokExp = 0
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
async function token () {
  if (tok && Date.now() < tokExp - 60000) return tok
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key)
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + b64u(sig) }),
    signal: AbortSignal.timeout(15000)
  })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error('firebase token nahi mila (' + r.status + ')')
  tok = j.access_token; tokExp = Date.now() + (j.expires_in || 3600) * 1000
  return tok
}
let fsGet = async (p) => {
  const r = await fetch(BASE() + '/' + p, { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(15000) })
  if (r.status === 404) return null
  const j = await r.json().catch(() => null)
  if (!r.ok || !j) throw new Error('firestore ' + r.status)
  return j
}
export function _setFetcher (fn) { fsGet = fn } // tests
let fsPatch = async (p, fields) => {
  const r = await fetch(BASE() + '/' + p, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await token(), 'content-type': 'application/json' }, body: JSON.stringify({ fields }), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('firestore write ' + r.status)
}
export function _setPatcher (fn) { fsPatch = fn } // tests
// panel ko batao kaun si commands load hui / reject (sirf tab likhta hai jab kuch badla ho)
let lastStatusR = { rejected: [] }, songStatus = ''
async function writeStatus (r = lastStatusR) {
  lastStatusR = r
  try {
    await fsPatch(`${COLLECTION}/${docId}_status`, {
      song: { stringValue: songStatus }, // panel: "bot pe laga hua ✅" (song doc ka v; khaali = koi panel song nahi)
      loaded: { stringValue: customList().map(c => '.' + c.name).join(' ') },
      rejected: { stringValue: JSON.stringify(r.rejected.slice(0, 30)) },
      run: { stringValue: String(process.env.GITHUB_RUN_ID || 'local') },
      at: { timestampValue: new Date().toISOString() }
    })
  } catch (e) { log.warn('panel status write:', e.message) }
}
const sv = (f) => f?.stringValue ?? (f?.integerValue != null ? String(f.integerValue) : '')

// main doc ka id (password hash) dhundo: collection list (sirf naam, service account se)
let lastMediaV = ''
let docId = null, lastUpdate = null, lastFind = 0, timer = null, busy = false, fails = 0
async function findDoc () {
  lastFind = Date.now()
  const j = await fsGet(`${COLLECTION}?pageSize=50&mask.fieldPaths=updated_at`)
  const ids = (j?.documents || []).map(d => d.name.split('/').pop()).filter(id => /^[0-9a-f]{64}$/.test(id))
  // sab se naya wala (agar password badla ho)
  const docs = (j?.documents || []).filter(d => ids.includes(d.name.split('/').pop())).sort((a, b) => String(b.updateTime).localeCompare(String(a.updateTime)))
  return docs[0] ? docs[0].name.split('/').pop() : null
}

export async function check () {
  if (busy) return
  busy = true
  try {
    if (!docId || Date.now() - lastFind > 10 * 60000) {
      const id = await findDoc()
      if (id !== docId) { docId = id; lastUpdate = null }
      if (!docId) { if (customs.size) applyData({ cmds: [] }); return }
    }
    const head = await fsGet(`${COLLECTION}/${docId}?mask.fieldPaths=updated_at`)
    if (!head) { docId = null; lastUpdate = null; applyData({ cmds: [] }); return }
    if (head.updateTime !== lastUpdate) {
      const full = await fsGet(`${COLLECTION}/${docId}`)
      if (!full) return
      const r = applyData(sv(full.fields?.data) || '{}')
      await writeStatus(r)
      await applyMedia(sv(full.fields?.media_v)).catch(e => log.warn('panel menu media:', e.message))
      lastUpdate = full.updateTime
      lastMediaV = sv(full.fields?.media_v)
      songPending = true // panel har save pe main doc bhi likhta hai: song doc ek dafa parho
    } else if (lastMediaV) {
      await applyMedia(lastMediaV).catch(e => log.warn('panel menu media:', e.message))
    }
    if (songPending) await applySong()
    fails = 0
  } catch (e) {
    fails++
    if (fails === 1 || fails % 60 === 0) log.warn('custom commands check fail (purani commands chalti rahengi):', e.message)
  } finally { busy = false }
}

// panel ki menu photo/video -> chuna hua number (ya sab numbers) ka menu, bilkul .setmenu jaisa (encrypted store mein save).
// Har number ki settings mein version (panelMediaV), taake restart pe dobara na lage; baad mein online aane wale number ko bhi lag jaye.
let mediaHook = null, sidsHook = null
export function _setMediaHook (fn) { mediaHook = fn } // tests
export function _setSidsHook (fn) { sidsHook = fn } // tests
let mediaWant = null // { v, target }
let mediaCache = null // { v, mime, buf }
const targetSids = async (target) => {
  const all = sidsHook ? await sidsHook() : (await import('./sessions.js')).allSids()
  const t = String(target || '').replace(/\D/g, '')
  return all.filter(s => !t || String(s.number || '').endsWith(t)).map(s => s.sid)
}
async function applyMedia (v) {
  if (!v) return
  if (!mediaWant || mediaWant.v !== v) {
    const meta = await fsGet(`${COLLECTION}/${docId}_media`)
    const f = meta?.fields || {}
    if (sv(f.v) !== v) return // abhi likha ja raha hai, agli dafa
    mediaWant = { v, target: sv(f.target), mime: sv(f.mime), chunks: Number(sv(f.chunks) || 0) }
  }
  const sids = await targetSids(mediaWant.target)
  const todo = sids.filter(sid => runAs(sid, () => settings.get('panelMediaV')) !== v)
  if (!todo.length) return
  if (!mediaCache || mediaCache.v !== v) {
    const { mime, chunks } = mediaWant
    let buf = null
    if (mime && chunks > 0) {
      const parts = []
      for (let i = 0; i < Math.min(chunks, 4); i++) {
        const d = await fsGet(`${COLLECTION}/${docId}_m${i}`)
        if (sv(d?.fields?.v) !== v) return
        parts.push(sv(d.fields.b64))
      }
      buf = Buffer.from(parts.join(''), 'base64')
      if (!buf.length || buf.length > 3 * 1048576) throw new Error('media size theek nahi')
    }
    let kind = 'reset'
    if (buf) {
      if (mime.startsWith('video/') || mime === 'image/gif') kind = 'video'
      else if (mime.startsWith('image/')) kind = 'image'
      else throw new Error('media type ' + mime)
      if (kind === 'video' && !mediaHook) buf = await (await import('./assets.js')).toMenuVideo(buf)
    }
    mediaCache = { v, mime, buf, kind }
  }
  const assets = mediaHook ? null : await import('./assets.js')
  const { buf, kind, mime } = mediaCache
  for (const sid of todo) {
    await runAs(sid, async () => {
      if (mediaHook) await mediaHook({ sid, mime, buf, kind })
      else if (kind === 'reset') await assets.resetMenu()
      else if (kind === 'video') await assets.saveMenuVideo(buf)
      else await assets.saveMenuImage(buf)
      settings.set('menuDp', false)
      settings.set('panelMediaV', v)
    })
    log.ok(`Panel se menu ${kind === 'reset' ? 'reset' : kind === 'video' ? 'video' : 'photo'} lag gaya (${sid === 'main' ? 'main' : 'number'})`)
  }
}

// ---------- panel menu song ----------
// Panel: <doc>_song { mime, name, size, chunks, v } + <doc>_s0.._s3 (base64 tukre, har ek pe wahi v). Remove = chunks 0.
// Song SAB numbers ka default ban jata hai (data/panel_song.bin); jis number ne apna .setsong lagaya, us pe wahi bajta hai.
// Restart ke baad bhi pehli check pe Firestore se dobara aa jata hai (koi .enc / store nahi chahiye).
export const SONG_MAX = 2.5 * 1048576
export const SONG_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/opus']
let songPending = false, songTries = 0
let songHook = null
export function _setSongHook (fn) { songHook = fn } // tests: { v, mime, name, buf } | { v, remove: true }
async function songSave (x) {
  if (songHook) return songHook(x)
  const assets = await import('./assets.js')
  if (x.remove) { assets.removePanelSong(); return }
  let { buf, mime } = x
  if (mime !== 'audio/mpeg' && mime !== 'audio/mp3') {
    try { buf = await assets.toMp3(buf); mime = 'audio/mpeg' } catch (e) { log.warn('panel song mp3 nahi bana, original format bhejenge:', e.message) }
  } else mime = 'audio/mpeg'
  if (mime === 'audio/ogg' || mime === 'audio/opus') mime = 'audio/ogg; codecs=opus'
  if (mime === 'audio/x-m4a' || mime === 'audio/m4a') mime = 'audio/mp4'
  assets.savePanelSong(buf, { v: x.v, mime, name: x.name })
}
const localSongV = async () => songHook ? (songHook.localV || '') : (await import('./assets.js')).panelSongVersion()
async function applySong () {
  try {
    const meta = await fsGet(`${COLLECTION}/${docId}_song`)
    const f = meta?.fields || {}
    const v = sv(f.v), chunks = Number(sv(f.chunks) || 0), mime = sv(f.mime).toLowerCase(), name = sv(f.name).slice(0, 80)
    const have = await localSongV()
    if (!meta || !v || !chunks) { // remove (ya kabhi lagaya hi nahi)
      if (songStatus !== '') { songStatus = ''; await writeStatus() }
      if (have) { await songSave({ v, remove: true }); if (songHook) songHook.localV = ''; log.ok('Panel menu song hata diya — ab har number ka apna / original song') }
      songPending = false; songTries = 0; return
    }
    if (v === have) { songPending = false; songTries = 0; if (songStatus !== v) { songStatus = v; await writeStatus() } return }
    if (!SONG_MIMES.includes(mime) || chunks > 4) { log.warn(`panel song reject: type ${mime || '?'} / ${chunks} tukre`); songPending = false; return }
    const parts = []
    for (let i = 0; i < chunks; i++) {
      const d = await fsGet(`${COLLECTION}/${docId}_s${i}`)
      if (sv(d?.fields?.v) !== v) throw new Error('song abhi upload ho raha hai')
      parts.push(sv(d.fields.b64))
    }
    const buf = Buffer.from(parts.join(''), 'base64')
    if (!buf.length || buf.length > SONG_MAX) { log.warn('panel song reject: size ' + buf.length); songPending = false; return }
    await songSave({ v, mime, name, buf })
    if (songHook) songHook.localV = v
    songPending = false; songTries = 0
    songStatus = v; await writeStatus()
    log.ok(`Panel menu song lag gaya (${Math.round(buf.length / 1024)} KB${name ? ', ' + name : ''}) — sab numbers pe .menu ke sath (jahan apna .setsong nahi)`)
  } catch (e) {
    // agli check (5 sec) pe dobara; 30 dafa ke baad chhor do jab tak panel pe dobara save na ho
    if (++songTries >= 30) { songPending = false; songTries = 0 }
    if (songTries === 1) log.warn('panel menu song:', e.message)
  }
}

export function startCustomWatch (everyMs = 5000) {
  if (!ON || timer) { if (!ON) log.info('Custom commands panel OFF (FIREBASE_SA nahi)'); return }
  log.ok(`Custom commands panel ON (har ${Math.round(everyMs / 1000)} sec check)`)
  timer = setInterval(() => { check().catch(() => {}) }, everyMs); timer.unref?.()
  setTimeout(() => { check().catch(() => {}) }, 3000).unref?.()
}
export const customPanelEnabled = ON
export function _resetForTests () { songPending = false; songTries = 0; songStatus = ''; lastStatusR = { rejected: [] }; docId = null; lastUpdate = null; lastMediaV = ''; mediaWant = null; mediaCache = null; lastFind = 0; fails = 0; customs.clear() }
