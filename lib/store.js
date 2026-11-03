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

// sab saved sessions: [{ sid, number, files, settings }]
export async function loadAll () {
  if (!storeEnabled) return []
  const out = []
  try {
    const list = await listDir(BRANCH)
    for (const f of list) {
      if (!f.name.endsWith('.enc')) continue
      try {
        const text = await getRaw(BRANCH, f.path)
        if (!text) continue
        const obj = decrypt(text)
        if (fileFor(obj.sid) !== f.name) continue
        out.push(obj)
      } catch (e) { log.warn('session file decrypt nahi hui (SESSION_KEY badli?):', f.name) }
    }
  } catch (e) { log.warn('sessions load fail:', e.message) }
  return out
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
  } catch (e) { log.warn('session save fail:', e.message) }
}

// creds badlen to thori der baad save (GitHub API pe bojh kam)
export function scheduleSave (sid, getter, ms = 60000) {
  if (!storeEnabled) return
  getters.set(sid, getter)
  if (timers.has(sid)) return
  timers.set(sid, setTimeout(() => saveNow(sid), ms))
}

export async function remove (sid) {
  clearTimeout(timers.get(sid)); timers.delete(sid); getters.delete(sid)
  if (!storeEnabled) return
  try { await deleteFile(BRANCH, fileFor(sid), 'session removed') } catch (e) { log.warn('session delete fail:', e.message) }
}

export async function saveAll () { await Promise.allSettled([...getters.keys()].map(saveNow)) }
