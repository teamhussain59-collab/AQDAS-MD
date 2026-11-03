// Free TTS (no key) - Google Translate wali awaz. 200 characters ke tukray.
export function chunks (text, max = 180) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ')
  const out = []; let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w.slice(0, max) } else cur = (cur + ' ' + w).trim()
  }
  if (cur) out.push(cur)
  return out
}

export async function tts (text, lang = 'ur', fetchImpl = fetch) {
  const parts = chunks(text).slice(0, 10)
  const bufs = []
  for (const [i, p] of parts.entries()) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&total=${parts.length}&idx=${i}&textlen=${p.length}&q=${encodeURIComponent(p)}`
    const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) throw new Error(`TTS error ${r.status}`)
    bufs.push(Buffer.from(await r.arrayBuffer()))
  }
  return Buffer.concat(bufs)
}
