// ===== Custom commands (admin panel se) =====
// docs/commands.html (admin password) Firestore mein commands + menu media likhta hai (collection aqdasmdcmd,
// doc id = sha256 of password — bina password koi parh / likh nahi sakta). Bot service account (FIREBASE_SA) se
// har ~5 sec check karta hai aur commands bina restart ke load / unload karta hai.
// Custom code bot ke process mein NAHI chalta: lib/sandbox-runner.cjs alag process (khaali env, Node permission model,
// 64 MB, timeout). Code ko milta hai: ctx (args, text, reply, sendImage, react, get), bot style m / sock.sendMessage / text / args,
// setTimeout / sleep, axios / fetch (sirf https, parent karta hai), require('axios' | 'path' | 'fs'), fs (sirf apna temp folder).
// Built-in command ke naam pe custom command kabhi nahi banti (save pe bhi, load pe bhi reject).
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fork, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { log } from './logger.js'
import { commands } from './plugins.js'
import { runAs, currentSid } from './ctx.js'
import * as settings from './settings.js'
import os from 'os'
import dns from 'dns'
import net from 'net'
import https from 'https'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { botIds } from './utils.js'

export const COLLECTION = 'aqdasmdcmd'
export const NAME_RE = /^[a-z0-9]{1,30}$/
export const MAX_CODE = 60000
export const CPU_MS = 3000 // code ka synchronous hissa (loop waghera)
export const WALL_MS = 15000 // poori command (reply, delay, web request waghera samait)
const MAX_SENDS = 5, MAX_REACTS = 3, MAX_GETS = 5, MAX_PARALLEL = 3
export const MAX_SOCK_SENDS = 5 // sock.sendMessage: ek command (ek run) mein max
export const SOCK_PER_MIN = 20 // sock.sendMessage: har number pe max / minute (sab commands mila kar)
const HTTP_MS = 5000, HTTP_MAX = 1048576, HTTP_BODY_MAX = 100 * 1024
const MEDIA_MAX = { image: 5 * 1048576, video: 10 * 1048576, audio: 10 * 1048576 }
const TMP_ROOT = () => path.join(process.env.CC_TMP_ROOT || os.tmpdir(), 'aqdas-cc')
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

const BLOCK_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i
// private / local / reserved IP? (IPv4 + IPv6, ::ffff:a.b.c.d bhi)
export function isPrivateIp (ip) {
  ip = String(ip || '').replace(/^\[|\]$/g, '').toLowerCase()
  const v = net.isIP(ip)
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
  }
  if (v === 6) {
    if (ip === '::' || ip === '::1') return true
    const m4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || ip.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/)
    if (m4) return isPrivateIp(m4[1])
    if (/^::ffff:/.test(ip) || /^64:ff9b:/.test(ip) || /^::[0-9a-f]/.test(ip)) return true
    return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || /^2001:db8:/.test(ip) || /^100::/.test(ip)
  }
  return true // IP hi nahi
}
function badHost (h) {
  h = String(h || '').replace(/^\[|\]$/g, '')
  if (!h || BLOCK_HOST.test(h)) return true
  if (net.isIP(h) === 4) return isPrivateIp(h)
  return h.includes(':') // IPv6 literal: block
}
// DNS: host ke SAARE IP check, phir usi IP pe connect (DNS rebinding se bachao)
let resolver = (host) => new Promise((resolve, reject) => dns.lookup(host, { all: true, verbatim: true }, (e, a) => e ? reject(e) : resolve(a)))
export function _setResolver (fn) { resolver = fn } // tests
async function pinnedAddress (host) {
  if (net.isIP(host)) return { address: host, family: net.isIP(host) }
  let list
  try { list = await resolver(host) } catch { throw new Error('host nahi mila: ' + host) }
  list = (list || []).map(a => typeof a === 'string' ? { address: a, family: net.isIP(a) } : a)
  if (!list.length || list.some(a => isPrivateIp(a.address))) throw new Error('ye link allowed nahi (private / local IP)')
  return list[0]
}
// asal https request (tests mock kar sakte hain). Jawab: { status, statusText, headers, body: Buffer }
let transport = (u, opts, addr) => new Promise((resolve, reject) => {
  const req = https.request({
    protocol: 'https:', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: opts.method,
    headers: opts.headers, servername: net.isIP(u.hostname) ? undefined : u.hostname, agent: false,
    lookup: (h, o, cb) => { if (o && o.all) cb(null, [{ address: addr.address, family: addr.family }]); else cb(null, addr.address, addr.family) }
  }, (res) => {
    const len = Number(res.headers['content-length'] || 0)
    if (len > opts.maxBytes) { res.destroy(); return reject(new Error('jawab bohat bara (max ' + Math.round(opts.maxBytes / 1048576) + ' MB)')) }
    const parts = []; let n = 0
    res.on('data', (d) => { n += d.length; if (n > opts.maxBytes) { res.destroy(); reject(new Error('jawab bohat bara (max ' + Math.round(opts.maxBytes / 1048576) + ' MB)')) } else parts.push(d) })
    res.on('end', () => resolve({ status: res.statusCode, statusText: res.statusMessage || '', headers: res.headers, body: Buffer.concat(parts) }))
    res.on('error', reject)
  })
  req.on('error', reject)
  req.setTimeout(opts.timeout, () => req.destroy(new Error('timeout')))
  if (opts.body != null) req.write(opts.body)
  req.end()
})
export function _setTransport (fn) { transport = fn } // tests
const DROP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding', 'upgrade', 'proxy-authorization', 'te', 'trailer', 'keep-alive', 'expect'])
// https request: sirf https, private IP block, 5 sec poori request, max 1 MB jawab, max 3 redirect (har redirect dobara check)
export async function safeRequest ({ method = 'GET', url, headers = {}, body = null, maxBytes = HTTP_MAX, timeout = HTTP_MS } = {}) {
  method = String(method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) throw new Error('method allowed nahi')
  const h = { 'user-agent': 'AQDAS-MD', accept: '*/*' }
  let hn = 0
  for (const [k, v] of Object.entries(headers && typeof headers === 'object' ? headers : {})) {
    const key = String(k).toLowerCase().trim()
    if (!/^[a-z0-9-]{1,60}$/.test(key) || DROP_HEADERS.has(key) || ++hn > 20) continue
    h[key] = String(v).replace(/[\r\n]/g, ' ').slice(0, 2000)
  }
  h['accept-encoding'] = 'identity'
  if (body != null) {
    body = Buffer.from(String(body))
    if (body.length > HTTP_BODY_MAX) throw new Error('request body bohat bari (max 100 KB)')
    h['content-length'] = String(body.length)
  }
  const deadline = Date.now() + timeout
  let u
  try { u = new URL(String(url)) } catch { throw new Error('ghalat link') }
  for (let hop = 0; ; hop++) {
    if (u.protocol !== 'https:') throw new Error('sirf https links')
    if (u.username || u.password) throw new Error('link mein user:password allowed nahi')
    if (badHost(u.hostname)) throw new Error('ye link allowed nahi')
    const left = deadline - Date.now()
    if (left <= 0) throw new Error('timeout (5 sec)')
    const addr = await pinnedAddress(u.hostname.replace(/^\[|\]$/g, ''))
    let r
    try {
      r = await Promise.race([
        transport(u, { method, headers: h, body, maxBytes, timeout: left }, addr),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout (5 sec)')), left).unref?.())
      ])
    } catch (e) { throw new Error(/timeout/i.test(e.message) ? 'timeout (5 sec)' : String(e.message || e).slice(0, 150)) }
    const loc = r.headers?.location
    if ([301, 302, 303, 307, 308].includes(r.status) && loc) {
      if (hop >= 3) throw new Error('bohat redirects')
      try { u = new URL(String(loc), u) } catch { throw new Error('ghalat redirect') }
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === 'POST')) { method = 'GET'; body = null; delete h['content-length']; delete h['content-type'] }
      continue
    }
    const body2 = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body == null ? '' : String(r.body))
    if (body2.length > maxBytes) throw new Error('jawab bohat bara')
    const hh = {}
    for (const [k, v] of Object.entries(r.headers || {})) if (typeof v === 'string' || typeof v === 'number') hh[k.toLowerCase()] = String(v); else if (Array.isArray(v)) hh[k.toLowerCase()] = v.join(', ')
    return { status: Number(r.status) || 0, statusText: String(r.statusText || ''), headers: hh, body: body2, url: u.toString() }
  }
}
// https GET, 5 sec, max 1 MB (purana ctx.get / sendImage)
export async function safeGet (url, maxBytes = HTTP_MAX, asBuffer = false) {
  const r = await safeRequest({ url, maxBytes })
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status)
  return asBuffer ? r.body : r.body.toString('utf8')
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
const sockHits = new Map() // sid -> timestamps (sock.sendMessage / minute)

// is command ka apna temp folder (flat, 5 MB — runner check karta hai, permission model sirf isi folder pe write deta hai)
function tmpFor (name) {
  const dir = path.join(TMP_ROOT(), String(name).replace(/[^a-z0-9]/g, '') || 'x')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return fs.realpathSync(dir)
}

// prefix kuch bhi ho, `text` hamesha '.command baaki' — taake pasted code ka text.startsWith('.sendchannel ') chale
function fullText (ctx) {
  const body = String(ctx.body || '')
  if (!ctx.isCmd || !ctx.prefix || !body.startsWith(ctx.prefix)) return body
  const after = body.slice(ctx.prefix.length).replace(/^\s+/, '')
  const word = after.split(/\s/)[0] || ''
  return '.' + String(ctx.command || word.toLowerCase()) + after.slice(word.length)
}

// sock.sendMessage kis jid pe ja sakta hai: isi chat, bot ka apna number (PN / LID), ya WhatsApp channel (@newsletter)
export function allowedJid (ctx, jid) {
  jid = String(jid || '').trim()
  if (!jid) return false
  if (jid === ctx.jid) return true
  if (/^\d{5,30}@newsletter$/.test(jid)) return true
  let n = ''
  try { n = jidNormalizedUser(jid) } catch { return false }
  return !!n && botIds(ctx.sock).includes(n)
}

async function mediaContent (kind, v) {
  const url = typeof v === 'string' ? v : v?.url
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error(`${kind}: sirf https link (url) do`)
  return safeGet(url, MEDIA_MAX[kind], true)
}

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
  let child, tmp = ''
  try {
    try { tmp = tmpFor(c.name) } catch (e) { log.warn('custom tmp folder:', e.message); tmp = '' }
    const flag = permissionFlag()
    const execArgv = ['--max-old-space-size=64', '--disallow-code-generation-from-strings']
    if (flag) {
      execArgv.unshift(flag, '--allow-fs-read=' + RUNNER)
      if (tmp) execArgv.push('--allow-fs-read=' + tmp, '--allow-fs-write=' + tmp)
    }
    child = fork(RUNNER, [], { execArgv, env: {}, cwd: path.dirname(RUNNER), stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json' })
  } catch (e) { running--; return fail('sandbox start nahi hua') }

  const sid = (() => { try { return currentSid() || 'main' } catch { return 'main' } })()
  const q = ctx.quoted
  const data = JSON.stringify({
    args: ctx.args || [], text: ctx.text || '', command: c.name, prefix: ctx.prefix || '.',
    sender: String(ctx.sender || '').split('@')[0].split(':')[0], pushName: ctx.pushName || '',
    isOwner: !!ctx.owner, isGroup: !!ctx.isGroup, quotedText: quotedText(ctx),
    body: fullText(ctx), chat: String(ctx.jid || ''), senderJid: String(ctx.sender || ''),
    quoted: q ? { text: quotedText(ctx), sender: String(q.key?.participant || (q.key?.fromMe ? (ctx.sock?.user?.id ? jidNormalizedUser(ctx.sock.user.id) : '') : ctx.jid) || '') } : null
  })
  let sends = 0, reacts = 0, gets = 0, sockSends = 0, finished = false
  const result = await new Promise((resolve) => {
    const end = (r) => { if (finished) return; finished = true; clearTimeout(timer); try { child.kill('SIGKILL') } catch {}; resolve(r) }
    const timer = setTimeout(() => end({ ok: false, error: `timeout (${Math.round(wall / 1000)} sec)` }), wall)
    const answer = (id, ok, v) => { if (!finished && child.connected) { try { child.send({ t: 'res', id, ok, v: ok ? v : undefined, e: ok ? undefined : String(v) }) } catch {} } }
    child.on('error', () => end({ ok: false, error: 'sandbox error' }))
    child.on('exit', () => end({ ok: false, error: 'command beech mein band ho gayi' }))
    child.on('message', async (m) => {
      if (!m || typeof m !== 'object' || finished) return
      try {
        if (m.t === 'ready') return child.send({ t: 'job', code: c.code, data, cpuMs: cpu, wallMs: wall, tmp })
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
          if (++gets > MAX_GETS) return answer(m.id, false, `ek command max ${MAX_GETS} web requests`)
          return answer(m.id, true, await safeGet(a.url))
        }
        if (m.op === 'http') {
          if (++gets > MAX_GETS) return answer(m.id, false, `ek command max ${MAX_GETS} web requests`)
          const r = await safeRequest({ method: a.method, url: a.url, headers: a.headers, body: a.body })
          return answer(m.id, true, JSON.stringify({ status: r.status, statusText: r.statusText, headers: r.headers, url: r.url, body: r.body.toString('utf8') }))
        }
        if (m.op === 'send') {
          const jid = String(a.jid || '').trim()
          if (!allowedJid(ctx, jid)) return answer(m.id, false, '❌ Ye jid allowed nahi')
          const ct = (a.content && typeof a.content === 'object') ? a.content : {}
          if (ct.react) {
            if (jid !== ctx.jid) return answer(m.id, false, 'react sirf isi chat ke message pe')
            if (++reacts > MAX_REACTS) return answer(m.id, false, 'bohat reacts')
            await ctx.react(String(ct.react.text ?? '').slice(0, 8)); return answer(m.id, true, 'ok')
          }
          if (++sockSends > MAX_SOCK_SENDS) return answer(m.id, false, `❌ ek command max ${MAX_SOCK_SENDS} sendMessage`)
          const now = Date.now()
          const hits = (sockHits.get(sid) || []).filter(t => now - t < 60000)
          if (hits.length >= SOCK_PER_MIN) { sockHits.set(sid, hits); return answer(m.id, false, `❌ is number se max ${SOCK_PER_MIN} sendMessage / minute, thori der baad`) }
          let content
          if (ct.image) content = { image: await mediaContent('image', ct.image), caption: String(ct.caption ?? '').slice(0, 1000) }
          else if (ct.video) content = { video: await mediaContent('video', ct.video), caption: String(ct.caption ?? '').slice(0, 1000), ...(ct.gifPlayback ? { gifPlayback: true } : {}) }
          else if (ct.audio) content = { audio: await mediaContent('audio', ct.audio), mimetype: /^audio\/[a-z0-9.+-]+(;.*)?$/i.test(String(ct.mimetype || '')) ? String(ct.mimetype) : 'audio/mpeg', ...(ct.ptt ? { ptt: true } : {}) }
          else if (ct.text != null && String(ct.text).trim()) content = { text: String(ct.text).slice(0, 4000) }
          else return answer(m.id, false, 'sendMessage: khaali message')
          hits.push(now); sockHits.set(sid, hits)
          const sent = await ctx.sock.sendMessage(jid, content)
          try { if (jid === ctx.jid) ctx.bot?.remember?.(sent) } catch {}
          log.info(`custom .${c.name}: sendMessage -> ${jid.endsWith('@newsletter') ? 'channel' : jid === ctx.jid ? 'same chat' : 'own number'}`)
          return answer(m.id, true, 'ok')
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
export function _resetSockRate () { sockHits.clear() } // tests

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
const fsGetReal = async (p) => {
  const r = await fetch(BASE() + '/' + p, { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(15000) })
  if (r.status === 404) return null
  const j = await r.json().catch(() => null)
  if (!r.ok || !j) throw new Error('firestore ' + r.status)
  return j
}
let fsGet = fsGetReal
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

// ---------- AI key (website admin wali OpenRouter key) ----------
// OPENROUTER_API_KEY secret na ho to lib/ai.js yahan se leta hai: settings/openrouter.key (service account, 10 min cache).
let orKey = { v: '', at: 0, logged: '' }
export async function openrouterKeyFromFirestore () {
  if (!ON && fsGet === fsGetReal) return ''
  if (orKey.at && Date.now() - orKey.at < 10 * 60000) return orKey.v
  try {
    const d = await fsGet('settings/openrouter')
    orKey = { ...orKey, v: String(d?.fields?.key?.stringValue || '').trim(), at: Date.now() }
  } catch (e) { orKey.at = Date.now() - 9 * 60000; log.warn('AI key (Firestore) read fail:', e.message) } // 1 min baad dobara
  const state = orKey.v ? 'mili' : 'nahi'
  if (orKey.logged !== state) { orKey.logged = state; log[orKey.v ? 'ok' : 'warn'](`AI key: OPENROUTER_API_KEY secret nahi, Firestore settings/openrouter se ${state}`) }
  return orKey.v
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
export function _resetForTests () { orKey = { v: '', at: 0, logged: '' }; songPending = false; songTries = 0; songStatus = ''; lastStatusR = { rejected: [] }; docId = null; lastUpdate = null; lastMediaV = ''; mediaWant = null; mediaCache = null; lastFind = 0; fails = 0; customs.clear() }
