import fs from 'fs'
import path from 'path'
import config from '../config.js'
import { run, tmpFile, rm, hasBin } from './utils.js'

// ===== Downloads: YouTube / TikTok / Facebook / Instagram =====
// YouTube GitHub ke server ko kabhi kabhi "bot check" deta hai, is liye raste ek ke baad ek:
//   1) yt-dlp (normal)  2) yt-dlp tv_embedded client  3) yt-dlp web_embedded  4) Invidious (public, koi key nahi)
// TikTok: yt-dlp -> tikwm.com (public API). Facebook / Instagram: yt-dlp (Instagram aksar login maangta hai).
let ytdlpOk = null
export async function ytdlpAvailable () {
  if (ytdlpOk === null) ytdlpOk = await hasBin(config.ytdlp)
  return ytdlpOk
}

export const isUrl = s => /^https?:\/\//i.test(String(s || '').trim())
export const ytId = u => { const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i.exec(String(u || '')); return m ? m[1] : null }
const MAX_MB = () => config.maxDownloadMB
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const short = e => String(e?.message || e || '').split('\n').find(l => /ERROR|rror/.test(l))?.replace(/^ERROR:\s*/, '').slice(0, 140) || String(e?.message || e).slice(0, 140)

function result (file, dir, via, title) {
  const t = title || path.basename(file).replace(/\.[^.]+$/, '')
  return { buffer: fs.readFileSync(file), title: t, file: path.basename(file), via, cleanup: () => rm(dir) }
}

// ---- yt-dlp ----
async function ytdlp (target, kind, extra = [], via = 'yt-dlp') {
  const dir = tmpFile('dl'); fs.mkdirSync(dir, { recursive: true })
  const common = ['--no-playlist', '--no-warnings', '--socket-timeout', '30', '--retries', '3', '--max-filesize', `${MAX_MB()}M`, '--match-filter', 'duration < 1200 & !is_live',
    '-o', path.join(dir, '%(title).80B.%(ext)s'), '--print', 'after_move:filepath', '--no-simulate', ...extra]
  if (config.ffmpeg !== 'ffmpeg') common.push('--ffmpeg-location', config.ffmpeg)
  const args = kind === 'audio'
    ? ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '5', ...common, target]
    : ['-f', 'b[ext=mp4][height<=720]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/b', '--merge-output-format', 'mp4', ...common, target]
  try {
    const { stdout } = await run(config.ytdlp, args, { timeout: 300000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    const file = [...lines].reverse().find(l => fs.existsSync(l)) || fs.readdirSync(dir).map(f => path.join(dir, f))[0]
    if (!file || !fs.existsSync(file)) throw new Error('File nahi mili (shayad bohat bari hai, 20 min se lambi hai ya private hai)')
    return result(file, dir, via)
  } catch (e) {
    rm(dir)
    const msg = String(e.stderr || e.message || '')
    if (/File is larger|max-filesize/i.test(msg)) throw Object.assign(new Error(`File ${MAX_MB()}MB se bari hai`), { final: true })
    if (/does not pass filter|duration/i.test(msg) && /filter/i.test(msg)) throw Object.assign(new Error('Video 20 min se lambi hai'), { final: true })
    throw new Error(short(msg))
  }
}

// ---- fetch se file (stream) ----
async function fetchTo (url, file, { headers = {}, maxMB = MAX_MB() } = {}) {
  const r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(240000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const len = +r.headers.get('content-length') || 0
  if (len > maxMB * 1048576) throw Object.assign(new Error(`File ${maxMB}MB se bari hai`), { final: true })
  const out = fs.createWriteStream(file); let n = 0
  for await (const chunk of r.body) { n += chunk.length; if (n > maxMB * 1048576) { out.destroy(); throw Object.assign(new Error(`File ${maxMB}MB se bari hai`), { final: true }) } out.write(chunk) }
  await new Promise((res, rej) => out.end(e => (e ? rej(e) : res())))
  if (n < 10000) throw new Error('khali file')
  return n
}
async function toMp3 (src, dst) { await run(config.ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-vn', '-codec:a', 'libmp3lame', '-q:a', '5', dst], { timeout: 180000 }) }
const safeName = t => String(t || 'audio').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'file'

// ---- Invidious (public YouTube frontends, koi key nahi) ----
const INV_KNOWN = ['https://yt.chocolatemoo53.com', 'https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be', 'https://invidious.f5.si', 'https://iv.melmac.space', 'https://invidious.privacyredirect.com']
let invList = null, invAt = 0
async function invidiousInstances () {
  if (invList && Date.now() - invAt < 3600000) return invList
  let l = []
  try {
    const r = await fetch('https://api.invidious.io/instances.json?sort_by=health', { signal: AbortSignal.timeout(10000) })
    const j = await r.json(); l = j.filter(x => x[1]?.api && x[1]?.type === 'https').map(x => x[1].uri)
  } catch {}
  invList = [...new Set([...l, ...INV_KNOWN])]; invAt = Date.now()
  return invList
}
let invGood = null // aakhri kaam karne wala instance pehle
async function invTry (fn) {
  const list = await invidiousInstances()
  const order = invGood ? [invGood, ...list.filter(x => x !== invGood)] : list
  let last
  for (const base of order.slice(0, 8)) {
    try { const v = await fn(base); invGood = base; return v } catch (e) { last = e; if (e.final) throw e }
  }
  throw last || new Error('Invidious nahi chala')
}
async function invidious (id, kind) {
  return invTry(async base => {
    const r = await fetch(`${base}/api/v1/videos/${id}?local=true`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) throw new Error(`${base} HTTP ${r.status}`)
    if (j.lengthSeconds > 1200) throw Object.assign(new Error('Video 20 min se lambi hai'), { final: true })
    const abs = u => (u.startsWith('/') ? base + u : u)
    const dir = tmpFile('dl'); fs.mkdirSync(dir, { recursive: true })
    try {
      const title = safeName(j.title)
      if (kind === 'audio') {
        const a = (j.adaptiveFormats || []).filter(f => /^audio\//.test(f.type || '')).sort((x, y) => (/mp4/.test(y.type) - /mp4/.test(x.type)) || ((+y.bitrate || 0) - (+x.bitrate || 0)))[0]
        if (!a?.url) throw new Error(base + ' audio stream nahi')
        const src = path.join(dir, 'src.' + (/webm/.test(a.type) ? 'webm' : 'm4a'))
        await fetchTo(abs(a.url), src)
        const mp3 = path.join(dir, title + '.mp3'); await toMp3(src, mp3); rm(src)
        return result(mp3, dir, 'invidious', j.title)
      }
      const out = path.join(dir, title + '.mp4')
      const v = (j.formatStreams || []).filter(f => /mp4/.test(f.type || '')).sort((x, y) => (parseInt(y.resolution) || 0) - (parseInt(x.resolution) || 0)).find(f => (parseInt(f.resolution) || 0) <= 720)
      if (v?.url) { await fetchTo(abs(v.url), out); return result(out, dir, 'invidious', j.title) }
      // muxed stream nahi: H.264 video (<=480p, WhatsApp-friendly size) + m4a audio alag le ke jodo
      const vid = (j.adaptiveFormats || []).filter(f => /video\/mp4/.test(f.type || '') && /avc1/.test(f.type || '')).sort((x, y) => (parseInt(y.resolution) || 0) - (parseInt(x.resolution) || 0)).find(f => (parseInt(f.resolution) || 0) <= 480)
      const aud = (j.adaptiveFormats || []).filter(f => /audio\/mp4/.test(f.type || '')).sort((x, y) => (+y.bitrate || 0) - (+x.bitrate || 0))[0]
      if (!vid?.url || !aud?.url) throw new Error(base + ' video stream nahi')
      const vf = path.join(dir, 'v.mp4'), af = path.join(dir, 'a.m4a')
      await fetchTo(abs(vid.url), vf); await fetchTo(abs(aud.url), af)
      await run(config.ffmpeg, ['-y', '-loglevel', 'error', '-i', vf, '-i', af, '-c', 'copy', '-movflags', '+faststart', out], { timeout: 180000 }); rm(vf, af)
      return result(out, dir, 'invidious', j.title)
    } catch (e) { rm(dir); throw e }
  })
}
async function invidiousSearch (q) {
  return invTry(async base => {
    const r = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12000) })
    const j = await r.json().catch(() => null)
    const v = Array.isArray(j) && j.find(x => x.videoId && (!x.lengthSeconds || x.lengthSeconds < 1200))
    if (!v) throw new Error(base + ' search khali')
    return v.videoId
  })
}

// naam se YouTube video id (pehle yt-dlp search, phir Invidious)
export async function ytSearch (q) {
  try {
    const { stdout } = await run(config.ytdlp, ['--flat-playlist', '--no-warnings', '--print', '%(id)s|%(duration)s', `ytsearch5:${q}`], { timeout: 60000 })
    const rows = stdout.trim().split('\n').map(l => l.split('|')).filter(([id]) => /^[A-Za-z0-9_-]{11}$/.test(id))
    const ok = rows.find(([, d]) => !(+d > 1200)) || rows[0]
    if (ok) return ok[0]
  } catch {}
  return invidiousSearch(q)
}

async function chain (steps) {
  const errs = []
  for (const [name, fn] of steps) {
    try { return await fn() } catch (e) { if (e.final) throw e; errs.push(`${name}: ${short(e)}`) }
  }
  const err = new Error(errs.join(' | ')); err.routes = errs; throw err
}

async function youtube (id, kind) {
  const url = `https://www.youtube.com/watch?v=${id}`
  return chain([
    ['yt-dlp', () => ytdlp(url, kind)],
    ['yt-dlp tv', () => ytdlp(url, kind, ['--extractor-args', 'youtube:player_client=tv_embedded'], 'yt-dlp tv')],
    ['yt-dlp web_embedded', () => ytdlp(url, kind, ['--extractor-args', 'youtube:player_client=web_embedded'], 'yt-dlp embedded')],
    ['invidious', () => invidious(id, kind)]
  ])
}

async function tikwm (u, kind) {
  const r = await fetch('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(u), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
  const j = await r.json().catch(() => null)
  const d = j?.data
  const src = kind === 'audio' ? (d?.music || d?.music_info?.play) : (d?.play || d?.hdplay || d?.wmplay)
  if (!src) throw new Error('tikwm: ' + (j?.msg || 'link nahi mila'))
  const dir = tmpFile('dl'); fs.mkdirSync(dir, { recursive: true })
  const title = safeName(d.title || 'TikTok')
  try {
    if (kind === 'audio') {
      const raw = path.join(dir, 'src'); await fetchTo(src, raw)
      const mp3 = path.join(dir, title + '.mp3'); await toMp3(raw, mp3); rm(raw)
      return result(mp3, dir, 'tikwm', d.title)
    }
    const out = path.join(dir, title + '.mp4'); await fetchTo(src, out)
    return result(out, dir, 'tikwm', d.title)
  } catch (e) { rm(dir); throw e }
}

const friendly = (e, site) => {
  const m = String(e.message || '')
  if (e.final) return e
  if (site === 'instagram' && /login|empty media|cookies|rate/i.test(m)) return new Error('Instagram ne bina login ke ye video nahi di (private / login wali post). Public reel ka link try karo, ya baad mein.')
  if (site === 'youtube') return new Error('YouTube se abhi download nahi hua (sab raste try kiye: yt-dlp, Invidious). Thori der baad dobara try karo ya dusra gaana / link do.')
  return new Error(`Download nahi hua (${site}). Link check karo ya baad mein try karo.`)
}

// kind = 'audio' | 'video'. query = link ya naam (YouTube search)
export async function download (query, kind = 'audio') {
  const q = String(query || '').trim()
  if (!isUrl(q)) {
    let id
    try { id = await ytSearch(q) } catch { throw new Error('YouTube search mein kuch nahi mila. Naam thora badal ke try karo.') }
    try { return await youtube(id, kind) } catch (e) { throw friendly(e, 'youtube') }
  }
  const id = ytId(q)
  if (id) { try { return await youtube(id, kind) } catch (e) { throw friendly(e, 'youtube') } }
  if (/tiktok\.com/i.test(q)) { try { return await chain([['yt-dlp', () => ytdlp(q, kind)], ['tikwm', () => tikwm(q, kind)]]) } catch (e) { throw friendly(e, 'tiktok') } }
  const site = /instagram\.com/i.test(q) ? 'instagram' : /facebook\.com|fb\.watch/i.test(q) ? 'facebook' : 'link'
  try { return await chain([['yt-dlp', () => ytdlp(q, kind)], ['yt-dlp retry', () => ytdlp(q, kind, ['--force-ipv4'], 'yt-dlp')]]) } catch (e) { throw friendly(e, site) }
}

// sirf test ke liye: ek raasta seedha
export const _routes = { ytdlp, invidious, tikwm, ytSearch, youtube }
