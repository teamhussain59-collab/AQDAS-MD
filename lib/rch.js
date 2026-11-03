// ===== .rch: channel post reaction service (owner ki khareedi hui API, config.rchApiUrl / env RCH_API_URL) =====
import config from '../config.js'

export const USER_MS = Number(process.env.RCH_USER_MS || 10 * 60000)
export const MAX_EMOJIS = 5
const LINK = /^https:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})\/(\d+)\/?(?:\?.*)?$/
const PICT = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

const byUser = new Map() // requester id -> last time
let usage = null // { day, used, limit } — API ka apna aaj ka hisaab
const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

export function parseLink (s) {
  const m = String(s || '').trim().match(LINK)
  return m ? `https://whatsapp.com/channel/${m[1]}/${m[2]}` : null
}

// "🔥❤️, 😂" -> ['🔥','❤️','😂'] (sirf emoji, max 5 check caller kare)
export function parseEmojis (parts) {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
  const out = []
  for (const p of parts) for (const { segment } of seg.segment(String(p))) if (PICT.test(segment)) out.push(segment)
  return out
}

export function check ({ requesters = [], exempt = false, now = Date.now() }) {
  if (usage && usage.day === day(now) && usage.limit && usage.used >= usage.limit) return { ok: false, reason: 'quota', msg: `🚫 Aaj ki reaction limit khatam (${usage.used}/${usage.limit}). Kal dobara try karo.` }
  if (exempt) return { ok: true }
  for (const r of requesters) {
    const last = byUser.get(r)
    if (last && now - last < USER_MS) { const m = Math.ceil((USER_MS - (now - last)) / 60000); return { ok: false, reason: 'user', msg: `⏳ Spam rokne ke liye har banda 10 min mein 1 dafa .rch kar sakta hai. ${m} minute baad try karo 🙏` } }
  }
  return { ok: true }
}

export function note ({ requesters = [], exempt = false, now = Date.now() }) {
  if (exempt) return
  for (const r of requesters) byUser.set(r, now)
}

const clean = s => String(s || '').replace(/VIP-[A-Z0-9]+/gi, '***').replace(/vipapi-[A-Z0-9]+/gi, '***').slice(0, 150)

// API call — jawab mein sirf ok / message / usage wapis (vip_key, points, task_id kabhi bahar nahi)
export async function react (link, emojis, { fetchImpl = fetch, now = Date.now(), timeout = 30000 } = {}) {
  const url = `${config.rchApiUrl}?action=react&url=${encodeURIComponent(link)}&emoji=${encodeURIComponent(emojis.join(','))}`
  let r, j = null
  try { r = await fetchImpl(url, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) }) } catch (e) { return { ok: false, message: 'Reaction service ne jawab nahi diya (30 sec). Thori der baad try karo.' } }
  try { j = await r.json() } catch {}
  const d = j?.data || {}
  const used = Number(d.usage_today), limit = Number(d.limit)
  if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) usage = { day: day(now), used, limit }
  if (r.ok && j?.success !== false && d.ok === true) return { ok: true, used: Number.isFinite(used) ? used : null, limit: Number.isFinite(limit) ? limit : null }
  return { ok: false, message: clean(d.message || j?.message || j?.error || `Service ka jawab ${r.status}`), quota: usage && usage.used >= usage.limit }
}

export function _reset () { byUser.clear(); usage = null }
