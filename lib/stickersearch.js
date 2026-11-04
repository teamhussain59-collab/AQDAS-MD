// .stickersearch <word>: bina key ke sticker dhoondo — anime reaction (nekos/otakugifs) -> Google Noto animated emoji
// -> Openverse CC photo (mature=false) -> Wikimedia Commons GIF (sirf jin ke naam mein word ho)
import { findCategory, fetchAnime, CATEGORIES } from './anime.js'

const UA = 'AQDAS-MD-Bot/1.0 (https://github.com/teamhussain59-collab/AQDAS-MD)'
const BAD = /(scan|ct_|mri|x-?ray|diagram|map|chart|graph|wigner|function|anatomy|surgery|medical|nude|naked|sex|porn|gore|corpse|dead)/i

async function getJSON (url, fetchImpl, timeout = 15000) {
  const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

// Google Noto animated emoji (Apache 2.0): api.json mein tags (":smile-cat:"), GIF fonts.gstatic.com se
let notoCache = null, notoAt = 0
export function _setNoto (j) { notoCache = j; notoAt = Date.now() }
export async function notoEmoji (q, { fetchImpl = fetch } = {}) {
  if (!notoCache || Date.now() - notoAt > 24 * 3600000) { notoCache = await getJSON('https://googlefonts.github.io/noto-emoji-animation/data/api.json', fetchImpl); notoAt = Date.now() }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return (notoCache?.icons || [])
    .filter(i => !/_1f3f[b-f]/.test(i.codepoint)) // skin tone copies nahi
    .map(i => { const toks = (i.tags || []).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); return { i, hit: words.filter(w => toks.includes(w)).length } })
    .filter(x => x.hit === words.length)
    .sort((a, b) => (b.i.popularity || 0) - (a.i.popularity || 0))
    .map(x => ({ url: `https://fonts.gstatic.com/s/e/notoemoji/latest/${x.i.codepoint}/512.gif`, title: (x.i.tags || []).join(' '), animated: true, from: 'emoji' }))
}

// Wikimedia Commons: animated GIF files (CC licence), sirf jin ke naam mein word ho
export async function commonsGifs (q, { fetchImpl = fetch, limit = 20 } = {}) {
  const out = []
  for (const extra of [' sticker', '']) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=' + limit +
      '&gsrsearch=' + encodeURIComponent(q + extra + ' filemime:image/gif') + '&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*'
    const j = await getJSON(url, fetchImpl)
    for (const p of Object.values(j?.query?.pages || {})) {
      const ii = p.imageinfo?.[0]
      if (!ii || ii.mime !== 'image/gif' || !ii.url || ii.size > 8 * 1024 * 1024 || ii.size < 2000) continue
      if (BAD.test(p.title || '') || BAD.test(ii.url)) continue
      const title = String(p.title || '').toLowerCase().replace(/[_-]/g, ' ')
      if (!q.toLowerCase().split(/\s+/).every(w => new RegExp('\\b' + w.replace(/[^a-z0-9]/g, '') + '\\b').test(title))) continue
      if (!out.some(o => o.url === ii.url)) out.push({ url: ii.url, title: p.title, animated: true, from: 'commons' })
    }
    if (out.length >= 3) break
  }
  return out
}

// Openverse: CC photos (mature=false) -> static sticker
export async function openversePics (q, { fetchImpl = fetch } = {}) {
  const j = await getJSON('https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) + '&page_size=20&mature=false&extension=jpg,png', fetchImpl)
  return (j?.results || []).filter(r => r.url && !BAD.test(r.title || '') && !r.mature).map(r => ({ url: r.url, title: r.title, animated: false, from: 'openverse' }))
}

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

// n sticker sources: { buffer, animated, from }
export async function searchStickers (q, n = 3, { fetchImpl = fetch } = {}) {
  q = String(q || '').trim().slice(0, 60)
  if (!q) throw new Error('word do')
  const got = []
  const cat = findCategory(q, { strict: true }) // sirf poora naam / synonym (car != carry)
  if (cat && CATEGORIES.includes(cat)) {
    for (let i = 0; i < n && got.length < n; i++) { try { const a = await fetchAnime(cat, { fetchImpl }); got.push({ buffer: a.buffer, animated: true, from: 'anime ' + cat }) } catch { break } }
  }
  const pools = []
  if (got.length < n) { try { pools.push(...(await notoEmoji(q, { fetchImpl })).slice(0, n)) } catch {} }
  if (got.length + pools.length < n) { try { pools.push(...shuffle(await openversePics(q, { fetchImpl })).slice(0, n + 2)) } catch {} }
  if (got.length + pools.length < n) { try { pools.push(...shuffle(await commonsGifs(q, { fetchImpl }))) } catch {} }
  for (const p of pools) {
    if (got.length >= n) break
    try {
      const r = await fetchImpl(p.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1500 || buf.length > 10 * 1024 * 1024) continue
      got.push({ buffer: buf, animated: p.animated, from: p.from })
    } catch {}
  }
  if (!got.length) throw new Error(`"${q}" ka koi sticker nahi mila. Koi aur word try karo (English mein behtar).`)
  return got
}
