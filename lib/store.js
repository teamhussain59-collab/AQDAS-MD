// ===== Encrypted session store (GitHub `sessions` branch) =====
// Har number ka session (creds + keys) AES-256-GCM se encrypt ho ke public repo ki `sessions` branch pe.
// Branch pe sirf ciphertext hota hai. Key = SESSION_KEY secret (kabhi log / repo mein nahi).
// File ka naam = HMAC(number) — number bhi public nahi hota.
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import crypto from 'crypto'
import { log } from './logger.js'
import { GH_ON, putFile, deleteFile, listDir, getRaw } from './github.js'

const RAW_KEY = process.env.SESSION_KEY || ''
export const storeEnabled = !!(GH_ON && RAW_KEY.length >= 16)
const KEY = crypto.createHash('sha256').update('aqdas-md-store:' + RAW_KEY).digest()
const BRANCH = 'sessions'

export const sidFor = (number) => number === 'main' ? 'main' : 'n' + crypto.createHmac('sha256', KEY).update(String(number)).digest('hex').slice(0, 16)
const fileFor = (sid) => crypto.createHmac('sha256', KEY).update('file:' + sid).digest('hex').slice(0, 24) + '.enc'
// custom menu song / DP alag encrypted file mein (session file chhoti rahe, creds update pe 500 KB dobara upload na ho)
const assetFileFor = (sid) => crypto.createHmac('sha256', KEY).update('assets:' + sid).digest('hex').slice(0, 24) + '.enc'
export const ASSET_FILES = ['menu_song.mp3', 'menu_dp.jpg', 'menu_media.mp4', 'menu_media.jpg']
const ASSET_MAX = 4 * 1024 * 1024 // har asset max 4 MB (30s song ~0.5 MB)

export function encrypt (obj) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final()])
  return 'AQ1:' + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}

export function decrypt (text) {
  const buf = Buffer.from(String(text).trim().replace(/^AQ1:/, ''), 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString('utf8'))
}

export function packDir (dir) {
  const files = {}
  try { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isFile()) files[f] = fs.readFileSync(p).toString('base64') } } catch {}
  return files
}

export function unpackDir (dir, files) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  for (const [f, b64] of Object.entries(files || {})) {
    if (f.includes('/') || f.includes('..')) continue
    fs.writeFileSync(path.join(dir, f), Buffer.from(b64, 'base64'))
  }
}

export function packAssets (dir) {
  const assets = {}
  for (const f of ASSET_FILES) {
    try {
      const p = path.join(dir, f)
      if (!fs.existsSync(p)) continue
      const b = fs.readFileSync(p)
      if (b.length && b.length <= ASSET_MAX) assets[f] = b.toString('base64')
      else if (b.length > ASSET_MAX) log.warn(`${f} bohat bari hai (${Math.round(b.length / 1048576)} MB), save nahi hui`)
    } catch {}
  }
  return assets
}

// sirf menu_song.mp3 / menu_dp.jpg likho (settings.json waghera ko haath nahi lagao)
export function unpackAssets (dir, assets) {
  let n = 0
  for (const [f, b64] of Object.entries(assets || {})) {
    if (!ASSET_FILES.includes(f) || typeof b64 !== 'string') continue
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, f), Buffer.from(b64, 'base64')); n++ } catch {}
  }
  return n
}

// sab saved sessions: [{ sid, number, files, settings, assets }]
export async function loadAll () {
  if (!storeEnabled) return []
  const out = []
  const assetsBySid = new Map()
  try {
    const list = await listDir(BRANCH)
    for (const f of list) {
      if (!f.name.endsWith('.enc')) continue
      try {
        const text = await getRaw(BRANCH, f.path)
        if (!text) continue
        const obj = decrypt(text)
        if (obj.kind === 'assets') { if (assetFileFor(obj.sid) === f.name) assetsBySid.set(obj.sid, obj.assets || {}); continue }
        if (fileFor(obj.sid) !== f.name) continue
        out.push(obj)
      } catch (e) { log.warn('session file decrypt nahi hui (SESSION_KEY badli?):', f.name) }
    }
  } catch (e) { log.warn('sessions load fail:', e.message) }
  for (const s of out) if (assetsBySid.has(s.sid)) { s.assets = assetsBySid.get(s.sid); lastAssets.set(s.sid, assetSig(s.assets)) }
  return out
}

// .setsong / .setdp ke foran baad: song + DP encrypted file mein (ya delete agar reset)
const lastAssets = new Map()
const assetSig = (a) => crypto.createHash('sha256').update(JSON.stringify(Object.entries(a || {}).sort())).digest('hex')
export async function saveAssets (sid, dir) {
  if (!storeEnabled) return false
  try {
    const assets = packAssets(dir)
    const sig = assetSig(assets)
    if (lastAssets.get(sid) === sig) return true
    if (Object.keys(assets).length) await putFile(BRANCH, assetFileFor(sid), encrypt({ sid, kind: 'assets', assets, saved_at: new Date().toISOString() }) + '\n', 'assets update')
    else await deleteFile(BRANCH, assetFileFor(sid), 'assets reset')
    lastAssets.set(sid, sig)
    return true
  } catch (e) { log.warn('song/DP save fail:', e.message); return false }
}

// settings badlen (toggle on/off) to session file thori der mein dobara save
export function touch (sid, ms = 5000) {
  const g = getters.get(sid)
  if (g) scheduleSave(sid, g, ms)
}

const timers = new Map()
const getters = new Map()
export async function saveNow (sid) {
  const g = getters.get(sid)
  clearTimeout(timers.get(sid)); timers.delete(sid)
  if (!storeEnabled || !g) return
  try {
    const obj = g()
    if (!obj?.files?.['creds.json']) return
    await putFile(BRANCH, fileFor(sid), encrypt({ sid, ...obj, saved_at: new Date().toISOString() }) + '\n', 'session update')
    saveFails.delete(sid)
  } catch (e) {
    // fail hua to setting (jaise .autoai on) restart pe gum na ho: 30 sec baad dobara (max 10 dafa)
    const n = (saveFails.get(sid) || 0) + 1
    saveFails.set(sid, n)
    log.warn(`session save fail${n > 1 ? ` (${n})` : ''}:`, e.message)
    if (n < 10 && getters.has(sid) && !timers.has(sid)) timers.set(sid, setTimeout(() => saveNow(sid), 30000))
  }
}
const saveFails = new Map()

// creds badlen to thori der baad save (GitHub API pe bojh kam)
export function scheduleSave (sid, getter, ms = 60000) {
  if (!storeEnabled) return
  getters.set(sid, getter)
  if (timers.has(sid)) return
  timers.set(sid, setTimeout(() => saveNow(sid), ms))
}

export async function remove (sid) {
  clearTimeout(timers.get(sid)); timers.delete(sid); getters.delete(sid); lastAssets.delete(sid)
  if (!storeEnabled) return
  try { await deleteFile(BRANCH, fileFor(sid), 'session removed') } catch (e) { log.warn('session delete fail:', e.message) }
  try { await deleteFile(BRANCH, assetFileFor(sid), 'assets removed') } catch {}
}

export async function saveAll () { await Promise.allSettled([...getters.keys()].map(saveNow)) }
