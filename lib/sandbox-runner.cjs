'use strict'
// ===== Custom command sandbox (alag process) =====
// Admin panel (docs/commands.html) se aayi custom command ka code yahan chalta hai — bot ke process se BAHAR.
// Parent (lib/customcmds.js) is process ko: khaali env (koi secret nahi), Node permission model (sirf yahi file read +
// sirf is command ka apna temp folder read/write, koi child process / worker nahi), 64 MB RAM aur wall-clock timeout ke saath chalata hai.
// Code ek vm context mein chalta hai: asli require / process / Buffer nahi. Jo milta hai (sab yahin vm ke andar bana hai):
//   ctx (purana style), m / sock / text / args / command / sender / isOwner (bot style), setTimeout / sleep,
//   axios / fetch (request parent karta hai: sirf https, 5 sec, 1 MB, private IP block), require('axios' | 'path' | 'fs'),
//   fs = sirf is command ka temp folder (5 MB).
// Host (Node) ki koi cheez vm ko kabhi nahi milti: host functions sirf boot closure mein hain aur sirf string / number lautate hain.
const vm = require('vm')
const nfs = require('fs')
const npath = require('path')

let seq = 0
const pending = new Map()
const timers = new Map()
let tseq = 0
let mainDone = false, finished = false
const logs = []
const send = (m) => { try { process.send(m) } catch {} }
const finish = (m) => { if (finished) return; finished = true; send(m); setTimeout(() => process.exit(0), 20) }
const checkIdle = () => { if (mainDone && !finished && pending.size === 0 && timers.size === 0) finish({ t: 'done', logs }) }
const idleSoon = () => setImmediate(checkIdle)

process.on('message', (m) => {
  if (!m || typeof m !== 'object') return
  if (m.t === 'res') {
    const p = pending.get(m.id); if (!p) return
    pending.delete(m.id)
    try { if (m.ok) p.res(m.v == null ? null : String(m.v)); else p.rej(String(m.e || 'error')) } catch {}
    idleSoon()
    return
  }
  if (m.t === 'job') start(String(m.code || ''), String(m.data || '{}'), Number(m.cpuMs) || 3000, String(m.tmp || ''), Number(m.wallMs) || 15000)
})
// command ka koi promise reject ho aur kisi ne pakra na ho: process band mat karo, sirf log
process.on('unhandledRejection', (e) => { if (logs.length < 20) logs.push('unhandled: ' + errText(e)) })
process.on('uncaughtException', (e) => { finish({ t: 'error', e: errText(e), logs }) })

// sandbox -> parent: sirf string ops. res/rej sandbox ke apne functions hain, unhe sirf primitive milta hai.
function bridge (op, json, res, rej) {
  const id = ++seq
  pending.set(id, { res, rej })
  let a = null
  try { a = JSON.parse(String(json)) } catch {}
  send({ t: 'op', id, op: String(op), a })
  return id
}

// ---- timers (setTimeout / sleep). cb sandbox ka function hai; host ka Timeout object vm ko kabhi nahi milta, sirf number id ----
let WALL = 15000
function hostTimer (ms, cb) {
  try {
    if (typeof cb !== 'function') return -1
    if (timers.size >= 50) return -2
    ms = Math.max(0, Math.min(WALL, Number(ms) || 0))
    const id = ++tseq
    const h = setTimeout(() => {
      timers.delete(id)
      try { cb() } catch (e) { finish({ t: 'error', e: errText(e), logs }); return }
      idleSoon()
    }, ms)
    timers.set(id, h)
    return id
  } catch { return -1 }
}
function hostClear (id) {
  try { const h = timers.get(Number(id)); if (h) { clearTimeout(h); timers.delete(Number(id)); idleSoon() } } catch {}
  return 0
}

// ---- fs: sirf is command ka temp folder (flat, 5 MB, max 100 files) ----
let TMP = ''
const FS_MAX = 5 * 1048576, FS_FILES = 100
function inTmp (p) {
  if (!TMP) throw new Error('fs is command ke liye band hai')
  p = String(p == null ? '' : p)
  if (!p || p.includes('\0')) throw new Error('fs: file ka naam do')
  const full = npath.resolve(TMP, p)
  const rel = npath.relative(TMP, full)
  if (!rel || rel.startsWith('..') || npath.isAbsolute(rel) || rel.includes(npath.sep)) throw new Error('fs: sirf temp folder ke andar file (bahar ka path allowed nahi)')
  try { if (nfs.lstatSync(full).isSymbolicLink()) throw new Error('fs: link allowed nahi') } catch (e) { if (e.code !== 'ENOENT') throw e }
  return full
}
function used (except) {
  let n = 0, c = 0
  for (const f of nfs.readdirSync(TMP)) { const p = npath.join(TMP, f); if (p === except) continue; try { const s = nfs.lstatSync(p); if (s.isFile()) { n += s.size; c++ } } catch {} }
  return { n, c }
}
const encOf = (e) => { e = (e && typeof e === 'object') ? e.encoding : e; return e === 'base64' ? 'base64' : 'utf8' }
function fsOp (op, a) {
  a = a || {}
  if (op === 'list') return nfs.readdirSync(TMP || '/nonexistent').filter(f => { try { return nfs.lstatSync(npath.join(TMP, f)).isFile() } catch { return false } })
  const p = inTmp(a.p)
  if (op === 'exists') return nfs.existsSync(p)
  if (op === 'read') {
    let s
    try { s = nfs.statSync(p) } catch { throw new Error("fs: file nahi mili: " + String(a.p).slice(0, 60)) }
    if (s.size > FS_MAX) throw new Error('fs: file bohat bari')
    return nfs.readFileSync(p).toString(encOf(a.enc))
  }
  if (op === 'write' || op === 'append') {
    if (typeof a.d !== 'string') throw new Error('fs: sirf text (string) likh sakte ho — object ke liye JSON.stringify karo')
    const buf = Buffer.from(a.d, encOf(a.enc))
    const old = (op === 'append' && nfs.existsSync(p)) ? nfs.statSync(p).size : 0
    const u = used(p)
    if (u.c >= FS_FILES && !nfs.existsSync(p)) throw new Error(`fs: max ${FS_FILES} files`)
    if (u.n + old + buf.length > FS_MAX) throw new Error('fs: temp folder full (max 5 MB)')
    if (op === 'append') nfs.appendFileSync(p, buf); else nfs.writeFileSync(p, buf)
    return true
  }
  if (op === 'unlink') { try { nfs.unlinkSync(p) } catch { throw new Error('fs: file nahi mili: ' + String(a.p).slice(0, 60)) } return true }
  throw new Error('fs: ye kaam allowed nahi')
}
function hostFs (op, json) {
  try { return JSON.stringify({ v: fsOp(String(op), JSON.parse(String(json))) }) } catch (e) { return JSON.stringify({ e: errText(e) }) }
}

// vm ke andar ka poora "library" — yahan sab vm ke apne objects (Object, Promise, Error) se bana hai.
const LIB = `(function (bridge, data, log, hostTimer, hostClear, hostFs) {
  'use strict'
  const D = JSON.parse(data)
  const str = (v) => (v == null ? '' : String(v))
  const call = (op, a) => new Promise((res, rej) => bridge(op, JSON.stringify(a === undefined ? null : a), res, (e) => rej(new Error(str(e)))))
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

  // ---- timers ----
  const setTimeout = (fn, ms, ...a) => {
    if (typeof fn !== 'function') throw new TypeError('setTimeout: function do')
    const id = hostTimer(Number(ms) || 0, () => fn(...a))
    if (id === -2) throw new Error('setTimeout: bohat zyada timers (max 50)')
    if (id < 0) throw new Error('setTimeout error')
    return id
  }
  const clearTimeout = (id) => { hostClear(Number(id) || 0) }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // ---- path (posix, chhota sa) ----
  const norm = (p, abs) => { const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..') } else out.push(s) } return out.join('/') }
  const normalize = (p) => { p = str(p); if (!p) return '.'; const abs = p[0] === '/'; const trail = p.length > 1 && p.endsWith('/'); let r = norm(p, abs); if (!r && !abs) r = '.'; if (r && trail) r += '/'; return (abs ? '/' : '') + r }
  const join = (...a) => { const j = a.map(str).filter(Boolean).join('/'); return j ? normalize(j) : '.' }
  const resolve = (...a) => { let r = ''; for (let i = a.length - 1; i >= 0 && r[0] !== '/'; i--) { const s = str(a[i]); if (s) r = s + (r ? '/' + r : '') } if (r[0] !== '/') r = D.tmp + '/' + r; const n = '/' + norm(r, true); return n }
  const basename = (p, ext) => { p = str(p).replace(/\\/+$/, ''); let b = p.slice(p.lastIndexOf('/') + 1); if (ext && b.endsWith(ext) && b !== ext) b = b.slice(0, -ext.length); return b }
  const dirname = (p) => { p = str(p).replace(/\\/+$/, ''); const i = p.lastIndexOf('/'); if (i < 0) return '.'; if (i === 0) return '/'; return p.slice(0, i) }
  const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i) }
  const isAbsolute = (p) => str(p)[0] === '/'
  const relative = (from, to) => { const f = resolve(from).split('/').filter(Boolean), t = resolve(to).split('/').filter(Boolean); let i = 0; while (i < f.length && i < t.length && f[i] === t[i]) i++; return [...Array(f.length - i).fill('..'), ...t.slice(i)].join('/') }
  const parse = (p) => { p = str(p); const base = basename(p), ext = extname(p); return { root: isAbsolute(p) ? '/' : '', dir: dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base } }
  const format = (o) => { o = o || {}; const dir = str(o.dir || o.root); const base = str(o.base || (str(o.name) + str(o.ext))); return dir ? (dir.endsWith('/') ? dir + base : dir + '/' + base) : base }
  const path = { sep: '/', delimiter: ':', normalize, join, resolve, basename, dirname, extname, isAbsolute, relative, parse, format }
  path.posix = path
  Object.freeze(path)

  // ---- fs (sirf temp folder) ----
  const fsc = (op, a) => { const r = JSON.parse(hostFs(op, JSON.stringify(a || {}))); if (own(r, 'e')) throw new Error(str(r.e)); return r.v }
  const later = (fn, cb) => { let v, e = null; try { v = fn() } catch (x) { e = x } setTimeout(() => cb(e, v), 0) }
  const wrapAsync = (sync) => (...a) => {
    const cb = typeof a[a.length - 1] === 'function' ? a.pop() : null
    if (cb) return later(() => sync(...a), cb)
    return new Promise((res, rej) => later(() => sync(...a), (e, v) => (e ? rej(e) : res(v))))
  }
  const readFileSync = (p, enc) => fsc('read', { p: str(p), enc })
  const writeFileSync = (p, d, enc) => { fsc('write', { p: str(p), d: typeof d === 'string' ? d : (d == null ? '' : (typeof d === 'object' ? null : String(d))), enc }) }
  const appendFileSync = (p, d, enc) => { fsc('append', { p: str(p), d: typeof d === 'string' ? d : (typeof d === 'object' ? null : String(d)), enc }) }
  const existsSync = (p) => { try { return !!fsc('exists', { p: str(p) }) } catch { return false } }
  const unlinkSync = (p) => { fsc('unlink', { p: str(p) }) }
  const readdirSync = () => fsc('list', {})
  const fsPromises = Object.freeze({ readFile: wrapAsync(readFileSync), writeFile: wrapAsync(writeFileSync), appendFile: wrapAsync(appendFileSync), unlink: wrapAsync(unlinkSync), readdir: wrapAsync(readdirSync) })
  const fs = Object.freeze({
    readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, readdirSync,
    readFile: wrapAsync(readFileSync), writeFile: wrapAsync(writeFileSync), appendFile: wrapAsync(appendFileSync), unlink: wrapAsync(unlinkSync), readdir: wrapAsync(readdirSync),
    promises: fsPromises, dir: D.tmp
  })

  // ---- web: axios / fetch (asal request parent karta hai) ----
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
  const qs = (params) => { if (!params || typeof params !== 'object') return ''; const p = []; for (const k of Object.keys(params)) { const v = params[k]; if (v === undefined) continue; p.push(encodeURIComponent(k) + '=' + encodeURIComponent(str(v))) } return p.join('&') }
  const plainHeaders = (h) => { const o = {}; if (h && typeof h === 'object') for (const k of Object.keys(h)) { const v = h[k]; if (v != null && typeof v !== 'object') o[str(k)] = str(v) } return o }
  const lower = (h) => { const o = {}; for (const k of Object.keys(h)) o[k.toLowerCase()] = h[k]; return o }
  async function http (method, url, headers, body) {
    method = str(method || 'GET').toUpperCase()
    if (!METHODS.includes(method)) throw new Error('method allowed nahi: ' + method)
    const r = JSON.parse(await call('http', { method, url: str(url), headers, body }))
    return r
  }
  const toBody = (data, headers) => {
    if (data == null) return null
    if (typeof data === 'string') return data
    if (typeof data === 'object') { if (!Object.keys(lower(headers)).includes('content-type')) headers['content-type'] = 'application/json'; return JSON.stringify(data) }
    return str(data)
  }
  function axiosCore (defaults) {
    const request = async (cfg) => {
      cfg = Object.assign({}, defaults, cfg || {})
      const rt = str(cfg.responseType || 'json')
      if (!['json', 'text', ''].includes(rt)) throw new Error('responseType "' + rt + '" allowed nahi (sirf json / text)')
      let url = str(cfg.url)
      if (cfg.baseURL && !/^[a-z]+:/i.test(url)) url = str(cfg.baseURL).replace(/\\/+$/, '') + '/' + url.replace(/^\\/+/, '')
      const q = qs(cfg.params); if (q) url += (url.includes('?') ? '&' : '?') + q
      const headers = Object.assign(plainHeaders(defaults.headers), plainHeaders(cfg.headers))
      const body = toBody(cfg.data, headers)
      const r = await http(cfg.method || 'GET', url, headers, body)
      let data = r.body
      if (rt !== 'text') { try { data = JSON.parse(r.body) } catch {} }
      const res = { data, status: r.status, statusText: r.statusText, headers: r.headers, config: { url, method: str(cfg.method || 'get').toLowerCase() } }
      const ok = typeof cfg.validateStatus === 'function' ? cfg.validateStatus(r.status) : (r.status >= 200 && r.status < 300)
      if (!ok) { const e = new Error('Request failed with status code ' + r.status); e.response = res; e.status = r.status; e.isAxiosError = true; throw e }
      return res
    }
    const ax = (a, b) => (typeof a === 'string' ? request(Object.assign({}, b || {}, { url: a })) : request(a))
    ax.request = request
    for (const m of ['get', 'delete', 'head']) ax[m] = (url, cfg) => request(Object.assign({}, cfg || {}, { url, method: m.toUpperCase() }))
    for (const m of ['post', 'put', 'patch']) ax[m] = (url, data, cfg) => request(Object.assign({}, cfg || {}, { url, data, method: m.toUpperCase() }))
    ax.create = (cfg) => axiosCore(Object.assign({}, defaults, cfg || {}, { headers: Object.assign(plainHeaders(defaults.headers), plainHeaders((cfg || {}).headers)) }))
    ax.defaults = defaults
    ax.isAxiosError = (e) => !!(e && e.isAxiosError)
    return ax
  }
  const axios = axiosCore({ headers: {} })
  axios.default = axios
  Object.freeze(axios)
  const fetch = async (url, opts) => {
    opts = opts || {}
    const headers = plainHeaders(opts.headers)
    const body = opts.body == null ? null : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
    const r = await http(opts.method || 'GET', url, headers, body)
    const h = lower(r.headers || {})
    return Object.freeze({
      ok: r.status >= 200 && r.status < 300, status: r.status, statusText: r.statusText, url: r.url,
      headers: Object.freeze({ get: (n) => (own(h, str(n).toLowerCase()) ? h[str(n).toLowerCase()] : null), has: (n) => own(h, str(n).toLowerCase()) }),
      text: async () => r.body, json: async () => JSON.parse(r.body)
    })
  }

  // ---- require: sirf chhoti list ----
  const MODS = { axios, path, 'node:path': path, fs, 'node:fs': fs, 'fs/promises': fsPromises, 'node:fs/promises': fsPromises }
  const require = (n) => { n = str(n); if (own(MODS, n)) return MODS[n]; throw new Error("require('" + n + "') allowed nahi. Sirf: axios, path, fs (sirf temp folder)") }

  // ---- purana ctx ----
  const reply = (t) => call('reply', { text: (t && typeof t === 'object') ? str(t.text) : str(t) })
  const react = (e) => call('react', { emoji: (e && typeof e === 'object') ? str((e.react && e.react.text) || e.text) : str(e) })
  const api = {
    args: Object.freeze(Array.isArray(D.args) ? D.args.map(String) : []),
    text: str(D.text), command: str(D.command), prefix: str(D.prefix),
    sender: str(D.sender), pushName: str(D.pushName), isOwner: !!D.isOwner, isGroup: !!D.isGroup,
    quotedText: str(D.quotedText),
    reply,
    sendImage: (src, caption) => call('image', { src: str(src), caption: str(caption) }),
    react,
    get: (url) => call('get', { url: str(url) }),
    getJson: (url) => call('get', { url: str(url) }).then((t) => JSON.parse(t)),
    sleep
  }
  const ctx = Object.freeze(api)

  // ---- bot style (m / sock) ----
  const media = (v) => (v && typeof v === 'object') ? { url: str(v.url) } : { url: str(v) }
  const cleanContent = (c) => {
    if (!c || typeof c !== 'object') throw new Error('sendMessage: content object do, jaise { text: "Salam" }')
    const o = {}
    if (c.react) o.react = { text: str(c.react.text) }
    else if (c.image) o.image = media(c.image)
    else if (c.video) o.video = media(c.video)
    else if (c.audio) o.audio = media(c.audio)
    else if (c.text != null) o.text = str(c.text)
    else throw new Error('sendMessage: sirf text, image, video, audio, react')
    if (c.caption != null) o.caption = str(c.caption)
    if (c.mimetype != null) o.mimetype = str(c.mimetype)
    if (c.ptt) o.ptt = true
    if (c.gifPlayback) o.gifPlayback = true
    return o
  }
  const sock = Object.freeze({ sendMessage: (jid, content) => { let c; try { c = cleanContent(content) } catch (e) { return Promise.reject(e) } return call('send', { jid: str(jid), content: c }) } })
  const quoted = D.quoted ? Object.freeze({ text: str(D.quoted.text), body: str(D.quoted.text), sender: str(D.quoted.sender) }) : null
  const m = Object.freeze({
    chat: str(D.chat), sender: str(D.senderJid), text: str(D.body), body: str(D.body), isGroup: !!D.isGroup, pushName: str(D.pushName),
    quoted, reply, react
  })

  const g = globalThis
  const def = (k, v) => Object.defineProperty(g, k, { value: v, writable: true, configurable: true, enumerable: false })
  def('ctx', ctx); def('m', m); def('sock', sock); def('conn', sock)
  def('text', str(D.body)); def('body', str(D.body)); def('args', Array.isArray(D.args) ? D.args.map(String) : []); def('q', (Array.isArray(D.args) ? D.args : []).join(' '))
  def('command', str(D.command)); def('prefix', str(D.prefix)); def('sender', str(D.senderJid)); def('pushName', str(D.pushName))
  def('isOwner', !!D.isOwner); def('isGroup', !!D.isGroup)
  def('setTimeout', setTimeout); def('clearTimeout', clearTimeout); def('sleep', sleep); def('delay', sleep)
  def('axios', axios); def('fetch', fetch); def('require', require); def('fs', fs); def('path', path); def('tmpDir', D.tmp)
  def('console', Object.freeze({ log: (...a) => log(a.map((x) => (x && typeof x === 'object') ? (() => { try { return JSON.stringify(x) } catch { return str(x) } })() : str(x)).join(' ')), error: (...a) => log(a.map(str).join(' ')), warn: (...a) => log(a.map(str).join(' ')) }))
})`

let started = false
function start (code, data, cpuMs, tmp, wallMs) {
  if (started) return
  started = true
  WALL = Math.max(1000, wallMs)
  try { if (tmp && nfs.statSync(tmp).isDirectory()) TMP = tmp } catch {}
  try { const d = JSON.parse(data); d.tmp = TMP; data = JSON.stringify(d) } catch {}
  const box = vm.createContext(Object.create(null), { name: 'aqdas-custom', codeGeneration: { strings: false, wasm: false } })
  try {
    const boot = vm.runInContext(LIB, box, { timeout: 1000 })
    boot(bridge, data, (s) => { if (logs.length < 20) logs.push(String(s).slice(0, 300)) }, hostTimer, hostClear, hostFs)
    const wrapped = '(async () => { const module = { exports: {} }; const exports = module.exports;\n' +
      'await (async function () {\n' + code + '\n}).call(undefined);\n' +
      "if (typeof module.exports === 'function') await module.exports(ctx);\n" +
      "else if (module.exports && typeof module.exports.run === 'function') await module.exports.run(ctx);\n})()"
    const script = new vm.Script(wrapped, { filename: 'command.js' })
    const p = script.runInContext(box, { timeout: cpuMs, breakOnSigint: false })
    Promise.resolve(p).then(
      () => { mainDone = true; idleSoon() },
      (e) => { finish({ t: 'error', e: errText(e), logs }) }
    )
  } catch (e) {
    finish({ t: 'error', e: errText(e), logs })
  }
}

function errText (e) {
  try {
    if (e && typeof e === 'object' && 'message' in e) return String(e.message).slice(0, 300)
    return String(e).slice(0, 300)
  } catch { return 'error' }
}
send({ t: 'ready' })
