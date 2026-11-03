// ===== GitHub status publisher (sirf GitHub Actions mein) =====
// Pairing code + status ko repo ki `status` branch pe status.json mein likhta hai,
// taake GitHub Pages wala web page (docs/index.html) code dikha sake.
// Kabhi session / keys nahi bhejta. Number ke sirf aakhri 4 digit. Fail ho to bot chalta rahe.
import { log } from './logger.js'

const TOKEN = process.env.GITHUB_TOKEN || ''
const REPO = process.env.GITHUB_REPOSITORY || ''
const ON = !!(process.env.GITHUB_ACTIONS && TOKEN && REPO)
const BRANCH = 'status'
const FILE = 'status.json'
const API = 'https://api.github.com/repos/' + REPO

let sha = null
let branchReady = false
let current = null
let busy = false
let again = false
let beat = null

const mask = n => { const d = String(n || '').replace(/[^0-9]/g, ''); return d ? '*'.repeat(Math.max(0, d.length - 4)) + d.slice(-4) : null }

async function gh (method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aqdas-md-status',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  })
  let j = null
  try { j = await r.json() } catch {}
  return { status: r.status, j }
}

async function ensureBranch () {
  if (branchReady) return
  const b = await gh('GET', '/git/ref/heads/' + BRANCH)
  if (b.status === 200) { branchReady = true; return }
  const repo = await gh('GET', '')
  const def = repo.j?.default_branch || 'main'
  const head = await gh('GET', '/git/ref/heads/' + def)
  const base = head.j?.object?.sha
  if (!base) throw new Error('base branch nahi mili (' + head.status + ')')
  const c = await gh('POST', '/git/refs', { ref: 'refs/heads/' + BRANCH, sha: base })
  if (c.status !== 201 && c.status !== 422) throw new Error('status branch nahi bani (' + c.status + ')')
  branchReady = true
}

async function readSha () {
  const r = await gh('GET', '/contents/' + FILE + '?ref=' + BRANCH)
  sha = r.status === 200 ? r.j?.sha || null : null
}

async function write (obj) {
  await ensureBranch()
  if (!sha) await readSha()
  const content = Buffer.from(JSON.stringify(obj, null, 2) + '\n').toString('base64')
  for (let i = 0; i < 3; i++) {
    const body = { message: 'status: ' + obj.status + (obj.code ? ' (new code)' : ''), content, branch: BRANCH }
    if (sha) body.sha = sha
    const r = await gh('PUT', '/contents/' + FILE, body)
    if (r.status === 200 || r.status === 201) { sha = r.j?.content?.sha || null; return }
    if (r.status === 409 || r.status === 422) { await readSha(); continue }
    throw new Error('status.json likha nahi gaya (' + r.status + ')')
  }
}

async function flush () {
  if (busy) { again = true; return }
  busy = true
  try {
    do {
      again = false
      const snap = { ...current, updated_at: new Date().toISOString(), uptime_s: Math.round(process.uptime()) }
      try { await write(snap) } catch (e) { log.warn('web status update fail:', e.message) }
    } while (again)
  } finally { busy = false }
}

// status: starting | waiting_pair | connected | reconnecting | logged_out | offline
export function publishStatus (status, { code = null, number = null, event = undefined } = {}) {
  if (!ON) return Promise.resolve()
  current = {
    status,
    code: status === 'waiting_pair' ? (code || null) : null,
    code_at: status === 'waiting_pair' && code ? (code === current?.code ? current.code_at : new Date().toISOString()) : null,
    last_event: event !== undefined ? (event || null) : (current?.last_event || null),
    number_masked: mask(number) || current?.number_masked || null,
    run_id: process.env.GITHUB_RUN_ID || null,
    updated_at: new Date().toISOString()
  }
  if (!beat) { beat = setInterval(() => { if (current) flush() }, 10 * 60000); beat.unref?.() }
  return flush()
}

// Run khatam hone pe (timeout SIGTERM) page ko "offline" batao
if (ON) {
  let done = false
  for (const s of ['SIGTERM', 'SIGINT']) {
    process.once(s, () => {
      if (done) return
      done = true
      const t = setTimeout(() => process.exit(0), 6000)
      publishStatus('offline').finally(() => { clearTimeout(t); process.exit(0) })
    })
  }
}

export const statusEnabled = ON
export default publishStatus
