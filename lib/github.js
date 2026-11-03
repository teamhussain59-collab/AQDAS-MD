// GitHub REST helper (sirf GitHub Actions ke andar, GITHUB_TOKEN se)
export const TOKEN = process.env.GITHUB_TOKEN || ''
export const REPO = process.env.GITHUB_REPOSITORY || ''
export const GH_ON = !!(process.env.GITHUB_ACTIONS && TOKEN && REPO)
const API = 'https://api.github.com/repos/' + REPO

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
  const r = await gh('GET', '/contents/' + file + '?ref=' + branch)
  const s = r.status === 200 ? r.j?.sha || null : null
  shas.set(branch + ':' + file, s)
  return s
}

export async function putFile (branch, file, text, message) {
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
    throw new Error(file + ' likha nahi gaya (' + r.status + ')')
  }
}

export async function deleteFile (branch, file, message) {
  const key = branch + ':' + file
  const sha = shas.get(key) || await readSha(branch, file)
  if (!sha) return
  await gh('DELETE', '/contents/' + file, { message, sha, branch })
  shas.set(key, null)
}

export async function listDir (branch, dir = '') {
  const r = await gh('GET', '/contents/' + dir + '?ref=' + branch)
  if (r.status !== 200 || !Array.isArray(r.j)) return []
  for (const f of r.j) shas.set(branch + ':' + f.path, f.sha)
  return r.j
}

export async function getRaw (branch, file) {
  const r = await gh('GET', '/contents/' + file + '?ref=' + branch, null, 'application/vnd.github.raw')
  return r.status === 200 ? r.text : null
}
