// GitHub REST helper (sirf GitHub Actions ke andar, GITHUB_TOKEN se)
export const TOKEN = process.env.GITHUB_TOKEN || ''
export const REPO = process.env.GITHUB_REPOSITORY || ''
// GitHub Actions ya Railway (GITHUB_TOKEN = personal token + GITHUB_REPOSITORY) — dono pe sessions/status branch
export const GH_ON = !!(TOKEN && REPO)
const API = 'https://api.github.com/repos/' + REPO
// Dusra server (misal Bot Maker wala Railway): INSTANCE=maker -> us ki branches alag (maker-sessions, maker-status...)
// taake dono servers ek doosre ke numbers / status / lock ko na chhooen
export const INSTANCE = String(process.env.INSTANCE || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
export const B = (b) => (!INSTANCE || b === 'main' || String(b).startsWith(INSTANCE + '-')) ? b : INSTANCE + '-' + b

export async function gh (method, url, body, accept) {
  const r = await fetch(API + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aqdas-md',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  if (accept && accept.includes('raw')) return { status: r.status, text: r.ok ? await r.text() : null }
  let j = null
  try { j = await r.json() } catch {}
  return { status: r.status, j }
}

const ready = new Set()
export async function ensureBranch (branch) {
  branch = B(branch)
  if (ready.has(branch)) return
  const b = await gh('GET', '/git/ref/heads/' + branch)
  if (b.status !== 200) {
    const repo = await gh('GET', '')
    const head = await gh('GET', '/git/ref/heads/' + (repo.j?.default_branch || 'main'))
    const base = head.j?.object?.sha
    if (!base) throw new Error('base branch nahi mili (' + head.status + ')')
    const c = await gh('POST', '/git/refs', { ref: 'refs/heads/' + branch, sha: base })
    if (c.status !== 201 && c.status !== 422) throw new Error(branch + ' branch nahi bani (' + c.status + ')')
  }
  ready.add(branch)
}

const shas = new Map()
async function readSha (branch, file) {
  branch = B(branch)
  // object media type: 1 MB se bari file ka bhi sha milta hai (default JSON 1 MB pe ruk jata hai)
  const r = await gh('GET', '/contents/' + file + '?ref=' + branch, null, 'application/vnd.github.object+json')
  const s = r.status === 200 ? r.j?.sha || null : null
  shas.set(branch + ':' + file, s)
  return s
}

export async function putFile (branch, file, text, message) {
  branch = B(branch)
  await ensureBranch(branch)
  const key = branch + ':' + file
  if (!shas.has(key)) await readSha(branch, file)
  const content = (Buffer.isBuffer(text) ? text : Buffer.from(text)).toString('base64')
  for (let i = 0; i < 3; i++) {
    const body = { message, content, branch }
    const sha = shas.get(key)
    if (sha) body.sha = sha
    const r = await gh('PUT', '/contents/' + file, body)
    if (r.status === 200 || r.status === 201) { shas.set(key, r.j?.content?.sha || null); return }
    if (r.status === 409 || r.status === 422) { await readSha(branch, file); continue }
    // GitHub kabhi kabhi 500/502/503 deta hai (aksar ek hi branch pe ek saath kai writes): thora ruk ke sha dobara parh ke phir
    if (r.status >= 500 && i < 2) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); await readSha(branch, file).catch(() => {}); continue }
    throw new Error(file + ' likha nahi gaya (' + r.status + ')')
  }
}

export async function deleteFile (branch, file, message) {
  branch = B(branch)
  const key = branch + ':' + file
  const sha = shas.get(key) || await readSha(branch, file)
  if (!sha) return
  await gh('DELETE', '/contents/' + file, { message, sha, branch })
  shas.set(key, null)
}

export async function listDir (branch, dir = '') {
  branch = B(branch)
  const r = await gh('GET', '/contents/' + dir + '?ref=' + branch)
  if (r.status !== 200 || !Array.isArray(r.j)) return []
  for (const f of r.j) shas.set(branch + ':' + f.path, f.sha)
  return r.j
}

export async function getRaw (branch, file) {
  branch = B(branch)
  const r = await gh('GET', '/contents/' + file + '?ref=' + branch, null, 'application/vnd.github.raw')
  return r.status === 200 ? r.text : null
}
