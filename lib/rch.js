// ===== .rch: channel post reaction service (owner ki khareedi hui API, config.rchApiUrl / env RCH_API_URL) =====
import config from '../config.js'

export const CHAT_MS = Number(process.env.RCH_CHAT_MS || 5000) // sirf flood guard: ek chat se 5 sec mein 1 (baqi koi limit nahi, API ka apna hisaab)
export const MAX_EMOJIS = 5
const LINK = /^https:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})\/(\d+)\/?(?:\?.*)?$/
const PICT = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

const byChat = new Map() // chat jid -> last time

export function parseLink (s) {
  const m = String(s || '').trim().match(LINK)
  return m ? `https://whatsapp.com/channel/${m[1]}/${m[2]}` : null
}

// link text mein kahin bhi ho (emoji chipke hon to bhi): { link, rest }
const LINK_ANY = /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})\/(\d+)\/?(?:\?[^\s]*)?/
export function extractLink (s) {
  const t = String(s || '')
  const m = t.match(LINK_ANY)
  if (!m) return { link: null, rest: t }
  return { link: `https://whatsapp.com/channel/${m[1]}/${m[2]}`, rest: t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length) }
}

// "🔥❤️, 😂" -> ['🔥','❤️','😂'] (sirf emoji, max 5 check caller kare)
export function parseEmojis (parts) {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
  const out = []
  for (const p of parts) for (const { segment } of seg.segment(String(p))) if (PICT.test(segment)) out.push(segment)
  return out
}

export function check ({ chat, now = Date.now() }) {
  const last = byChat.get(chat)
  if (last && now - last < CHAT_MS) return { ok: false, reason: 'flood', msg: '⏳ Thora ruko, 5 sec baad dobara bhejo.' }
  byChat.set(chat, now)
  if (byChat.size > 5000) for (const [k, t] of byChat) if (now - t > CHAT_MS) byChat.delete(k)
  return { ok: true }
}

const clean = s => String(s || '').replace(/VIP-[A-Z0-9]+/gi, '***').replace(/vipapi-[A-Z0-9]+/gi, '***').slice(0, 150)

// API call — jawab mein sirf ok / message / usage wapis (vip_key, points, task_id kabhi bahar nahi)
export async function react (link, emojis, { fetchImpl = fetch, timeout = 30000 } = {}) {
  const url = `${config.rchApiUrl}?action=react&url=${encodeURIComponent(link)}&emoji=${encodeURIComponent(emojis.join(','))}`
  let r, j = null
  try { r = await fetchImpl(url, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) }) } catch (e) { return { ok: false, message: 'Reaction service ne jawab nahi diya (30 sec). Thori der baad try karo.' } }
  try { j = await r.json() } catch {}
  const d = j?.data || {}
  const used = Number(d.usage_today), limit = Number(d.limit)
  if (r.ok && j?.success !== false && d.ok === true) return { ok: true, used: Number.isFinite(used) ? used : null, limit: Number.isFinite(limit) ? limit : null }
  const over = Number.isFinite(used) && Number.isFinite(limit) && limit > 0 && used >= limit
  return { ok: false, message: clean(d.message || j?.message || j?.error || `Service ka jawab ${r.status}`), quota: over, used: Number.isFinite(used) ? used : null, limit: Number.isFinite(limit) ? limit : null }
}

export function _reset () { byChat.clear() }
