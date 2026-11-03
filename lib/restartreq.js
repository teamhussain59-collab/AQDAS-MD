// ===== Restart page ka request (Firebase Firestore doc aqdasmd/restart) =====
// docs/restart.html owner ka password + "Restart" Firestore mein likhta hai (rules: sirf sahi password pe likh sakta hai,
// koi parh nahi sakta). Yahan chalta bot har 30 sec service account (secret FIREBASE_SA) se doc parhta hai;
// naya request ho to pehle "handled" mark (atomic, taake watchdog ke saath double na ho), phir restart.
// Bot band ho to yahi kaam GitHub watchdog workflow karta hai. FIREBASE_SA kabhi log / public nahi hota.
import crypto from 'crypto'
import { log } from './logger.js'
import { restartBot } from './restart.js'

let sa = null
try { if (process.env.FIREBASE_SA) sa = JSON.parse(process.env.FIREBASE_SA) } catch { log.warn('FIREBASE_SA theek JSON nahi — restart page band') }
const ON = !!(sa && sa.private_key && sa.client_email && sa.project_id)
const DOC = () => `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/aqdasmd/restart`
const STALE_MS = 20 * 60000
let tok = null, tokExp = 0, timer = null, busy = false

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

const ts = f => f?.timestampValue ? Date.parse(f.timestampValue) : 0

// pending request? -> { requestedAt, updateTime } | null
export async function readRequest () {
  const r = await fetch(DOC(), { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(15000) })
  if (r.status === 404) return null
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.fields) throw new Error('restart doc read ' + r.status)
  const req = ts(j.fields.requested_at), done = ts(j.fields.handled_at)
  if (!req || req <= done) return null
  return { requestedAt: j.fields.requested_at.timestampValue, req, updateTime: j.updateTime }
}

// atomic "handled" mark (sirf tab jab doc beech mein na badla ho) — true = humne claim kiya
export async function claim (p, by) {
  const q = new URLSearchParams()
  for (const f of ['handled_at', 'handled_by', 'pass']) q.append('updateMask.fieldPaths', f)
  q.append('currentDocument.updateTime', p.updateTime)
  const r = await fetch(DOC() + '?' + q, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await token(), 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { handled_at: { timestampValue: p.requestedAt }, handled_by: { stringValue: by }, pass: { stringValue: '' } } }),
    signal: AbortSignal.timeout(15000)
  })
  return r.ok
}

async function check () {
  if (busy) return
  busy = true
  try {
    const p = await readRequest()
    if (!p) return
    const stale = Date.now() - p.req > STALE_MS
    const by = (stale ? 'stale, ignored by bot run ' : 'bot run ') + (process.env.GITHUB_RUN_ID || 'local')
    if (!await claim(p, by)) return // watchdog ne pehle le liya
    if (stale) { log.warn('Restart page ka purana request (20+ min) — chhod diya'); return }
    log.warn('🔄 Restart page se restart request aaya — restart kar raha hoon')
    clearInterval(timer)
    await restartBot('restart page')
  } catch (e) { log.warn('restart page check fail:', e.message) } finally { busy = false }
}

export function startRestartWatch (everyMs = 30000) {
  if (!ON || timer) return
  log.ok('Restart page ON (har 30 sec check)')
  timer = setInterval(check, everyMs); timer.unref?.()
  setTimeout(check, 15000).unref?.()
}
export const restartPageEnabled = ON
