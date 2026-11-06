// ===== Host lock: ek number kabhi do jagah (Railway + GitHub) ek saath na chale =====
// Firestore doc aqdasmd/host  { host, at }  (service account FIREBASE_SA se; public kuch nahi)
// HOST_NAME=railway  -> Railway main host: har 60 sec heartbeat likhta hai, start pe 120 sec rukta hai
//                       taake GitHub wala run sessions save karke band ho jaye.
// GitHub (default)    -> start pe check: Railway zinda (heartbeat < 3 min) ho to chalta hi nahi;
//                       chalte hue har 30 sec check, Railway aa jaye to sessions save karke khud band.
// Railway band ho jaye (heartbeat purani) -> GitHub cron / watchdog wala run normal chalega (backup).
// FIREBASE_SA na ho, ya Firestore na mile -> lock band, bot pehle jaisa chalta hai.
import crypto from 'crypto'
import { log } from './logger.js'
import { INSTANCE } from './github.js'

let sa = null
try { if (process.env.FIREBASE_SA) sa = JSON.parse(process.env.FIREBASE_SA) } catch {}
const ON = !!(sa && sa.private_key && sa.client_email && sa.project_id)
const ROLE = (process.env.HOST_NAME || (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID ? 'railway' : process.env.GITHUB_ACTIONS ? 'github' : 'local')).toLowerCase()
const FRESH_MS = 3 * 60000
const DOC = () => `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/aqdasmd/host${INSTANCE ? '-' + INSTANCE : ''}`
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
  if (!j.access_token) throw new Error('firebase token ' + r.status)
  tok = j.access_token; tokExp = Date.now() + (j.expires_in || 3600) * 1000
  return tok
}

export async function readHost () {
  const r = await fetch(DOC(), { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(15000) })
  if (r.status === 404) return null
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.fields) throw new Error('host doc ' + r.status)
  return { host: j.fields.host?.stringValue || '', at: Date.parse(j.fields.at?.timestampValue || '') || 0 }
}
async function beat () {
  await fetch(DOC(), {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await token(), 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { host: { stringValue: ROLE }, at: { timestampValue: new Date().toISOString() } } }),
    signal: AbortSignal.timeout(15000)
  })
}
const railwayAlive = h => !!(h && h.host === 'railway' && Date.now() - h.at < FRESH_MS)

// main.js sab se pehle (sessions load se pehle) isko await karta hai
export async function hostGate () {
  // GITHUB_BACKUP=off (Bot Maker repo default): GitHub backup band hai, Railway akela chalega, lock ki zaroorat nahi
  const NO_BACKUP = /^(0|off|false|no)$/i.test(process.env.GITHUB_BACKUP || (INSTANCE ? 'off' : ''))
  if (!ON && ROLE === 'railway' && !NO_BACKUP) {
    // lock ke baghair Railway chala to GitHub wale ke saath same number do jagah -> logout. Is liye ruk jao.
    log.err('Host lock: Railway pe FIREBASE_SA variable nahi — bot START NAHI hoga (GitHub wala chal raha hai). Railway Variables mein FIREBASE_SA daalo.')
    await new Promise(() => setInterval(() => {}, 1 << 30))
  }
  if (!ON) return
  if (ROLE === 'railway') {
    try { await beat() } catch (e) { log.warn('host lock beat fail:', e.message) }
    const t = setInterval(() => beat().catch(() => {}), 60000); t.unref?.()
    const wait = Number(process.env.HOST_WAIT_MS || 120000)
    log.ok(`Host lock: RAILWAY main — ${Math.round(wait / 1000)} sec ruk raha hoon taake GitHub wala band ho jaye`)
    // is dauran panel pe error na aaye: chhota "start ho raha hai" page (khud refresh hota hai)
    let tmp = null
    try {
      const http = await import('http')
      const page = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><meta http-equiv=refresh content=10><body style="background:#0b0b0b;color:#0f0;font-family:sans-serif;text-align:center;padding-top:30vh"><h2>⏳ AQDAS MD start ho raha hai...</h2><p>1-2 minute, page khud refresh hoga</p></body>'
      tmp = http.createServer((q, s) => { s.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '10' }); s.end(page) })
      tmp.on('error', () => {})
      tmp.listen(Number(process.env.PORT || 3000), '0.0.0.0')
    } catch {}
    await new Promise(r => setTimeout(r, wait))
    if (tmp) await new Promise(r => { try { tmp.close(() => r()); tmp.closeAllConnections?.() } catch { r() } })
    return
  }
  if (ROLE !== 'github') return
  try {
    if (railwayAlive(await readHost())) {
      log.warn('Host lock: Railway pe bot chal raha hai — GitHub run band (backup standby)')
      process.exit(0)
    }
  } catch (e) { log.warn('host lock check fail (bot chalega):', e.message) }
  const t = setInterval(async () => {
    try {
      if (railwayAlive(await readHost())) {
        clearInterval(t)
        log.warn('Host lock: Railway on ho gaya — sessions save karke GitHub run band')
        process.kill(process.pid, 'SIGTERM')
      }
    } catch {}
  }, 30000)
  t.unref?.()
}
export const hostRole = ROLE


// ---- Private Firestore key-value (service account; public kabhi nahi) ----
const KV = k => `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/aqdasmd_private/${k}`
export async function kvGet (k) {
  if (!ON) return null
  const r = await fetch(KV(k), { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) return null
  const j = await r.json().catch(() => null)
  return j?.fields?.v?.stringValue ?? null
}
export async function kvSet (k, v) {
  if (!ON) return false
  const r = await fetch(KV(k), {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await token(), 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { v: { stringValue: String(v) }, at: { timestampValue: new Date().toISOString() } } }),
    signal: AbortSignal.timeout(15000)
  })
  return r.ok
}
