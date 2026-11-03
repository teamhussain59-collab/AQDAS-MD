// ===== GitHub status publisher (sirf GitHub Actions mein) =====
// Pairing code + status + panel link ko repo ki `status` branch pe status.json mein likhta hai,
// taake GitHub Pages wala web page (docs/index.html) dikha sake.
// Kabhi session / keys nahi bhejta. Number ke sirf aakhri 4 digit. Fail ho to bot chalta rahe.
import { log } from './logger.js'
import { GH_ON, putFile, deleteFile } from './github.js'
import QRCode from 'qrcode'

const ON = GH_ON
let current = null
let extra = {}
let busy = false
let again = false
let beat = null

const mask = n => { const d = String(n || '').replace(/[^0-9]/g, ''); return d ? '*'.repeat(Math.max(0, d.length - 4)) + d.slice(-4) : null }

async function flush () {
  if (!current) return
  if (busy) { again = true; return }
  busy = true
  try {
    do {
      again = false
      const snap = { ...current, ...extra, updated_at: new Date().toISOString(), uptime_s: Math.round(process.uptime()) }
      try { await putFile('status', 'status.json', JSON.stringify(snap, null, 2) + '\n', 'status: ' + snap.status + (snap.code ? ' (new code)' : snap.qr ? ' (qr)' : '')) } catch (e) { log.warn('web status update fail:', e.message) }
    } while (again)
  } finally { busy = false }
}

function startBeat () { if (!beat) { beat = setInterval(() => { if (current) flush() }, 2 * 60000); beat.unref?.() } } // 2 min heartbeat: owner page ~4 min mein offline pakad leta hai

// status: idle | starting | waiting_pair | waiting_qr | linking | connected | reconnecting | logged_out | offline
export function publishStatus (status, { code = null, number = null, event = undefined, qr = null, next_at = null } = {}) {
  if (!ON) return Promise.resolve()
  current = {
    status,
    code: status === 'waiting_pair' ? (code || null) : null,
    qr: status === 'waiting_qr' ? (qr || null) : null,
    qr_at: status === 'waiting_qr' && qr ? new Date().toISOString() : null,
    code_at: status === 'waiting_pair' && code ? (code === current?.code ? current.code_at : new Date().toISOString()) : null,
    next_at: status === 'rate_limited' ? next_at : null,
    last_event: event !== undefined ? (event || null) : (current?.last_event || null),
    number_masked: mask(number) || current?.number_masked || null,
    run_id: process.env.GITHUB_RUN_ID || null
  }
  startBeat()
  return flush()
}

// main bot ka QR PNG: status branch pe qr.png (har QR badalne pe overwrite, connect hone pe delete)
let qrBusy = false, qrNext = null, qrSeq = 0, qrFile = false
export function publishQrPng (qr) {
  if (!ON) return
  qrNext = qr
  if (qrBusy) return
  qrBusy = true
  ;(async () => {
    try {
      while (qrNext !== null) {
        const q = qrNext; qrNext = null
        if (q === '') { if (qrFile) { await deleteFile('status', 'qr.png', 'qr: connected, removed'); qrFile = false } continue }
        const png = await QRCode.toBuffer(q, { type: 'png', width: 640, margin: 3, errorCorrectionLevel: 'L' })
        await putFile('status', 'qr.png', png, 'qr ' + (++qrSeq))
        qrFile = true
      }
    } catch (e) { log.warn('qr.png update fail:', e.message) } finally { qrBusy = false }
  })()
}

// panel link / slots jaisi cheezein (status ke saath merge hoti hain)
export function setExtra (obj) {
  if (!ON) return Promise.resolve()
  const next = { ...extra, ...obj }
  if (JSON.stringify(next) === JSON.stringify(extra)) return Promise.resolve()
  extra = next
  if (!current) current = { status: 'idle', code: null, code_at: null, last_event: null, number_masked: null, run_id: process.env.GITHUB_RUN_ID || null }
  startBeat()
  return flush()
}

// Run khatam / cancel / restart pe: pehle sab sessions save, phir page ko "offline" batao, phir exit
const exitHooks = []
export const onExit = fn => exitHooks.push(fn)
let stopping = false
export function shutdown (reason = 'stop') {
  if (stopping) return
  stopping = true
  log.warn(`Bot band ho raha hai (${reason}) — sessions save ho rahe hain...`)
  const t = setTimeout(() => { log.warn('save time khatam, exit'); process.exit(0) }, 8000)
  Promise.allSettled(exitHooks.map(f => Promise.resolve().then(f)))
    .then(() => { log.ok('Sessions saved ✅'); if (!ON) return; extra.panel_url = null; return publishStatus('offline') })
    .finally(() => { clearTimeout(t); process.exit(0) })
}
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => shutdown(s))

export const statusEnabled = ON
export default publishStatus
