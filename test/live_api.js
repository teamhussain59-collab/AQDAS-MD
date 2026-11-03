// Har free API ko is waqt live call karo aur report do. Run: node test/live_api.js
import * as api from '../lib/apis.js'
import { tts } from '../lib/tts.js'
import { getBuffer } from '../lib/http.js'

const checks = [
  ['weather (wttr.in)', () => api.weather('Lahore'), r => r && r.temp !== undefined && `${r.place}: ${r.temp}°C ${r.desc}`],
  ['lyrics (lrclib.net)', () => api.lyrics('Imagine Dragons - Believer'), r => r && `${r.title} — ${r.artist} (${r.lyrics.length} chars)`],
  ['wiki en (wikipedia)', () => api.wiki('Allama Iqbal'), r => r && `${r.title}: ${r.extract.slice(0, 60)}...`],
  ['wiki ur (wikipedia)', () => api.wiki('لاہور', 'ur'), r => r && `${r.title}: ${r.extract.slice(0, 40)}...`],
  ['translate (google gtx)', () => api.translate('How are you my friend?', 'ur'), r => r && `${r.from} -> ur: ${r.text}`],
  ['define (dictionaryapi.dev, fallback freedictionaryapi.com)', () => api.define('hacker'), r => r && `${r.word}: ${r.meanings[0]?.def?.slice(0, 60)}`],
  ['currency (open.er-api.com)', () => api.currency(100, 'usd', 'pkr'), r => r && `100 USD = ${r.result.toFixed(2)} PKR`],
  ['github (api.github.com)', () => api.github('torvalds'), r => r && `${r.login}: ${r.followers} followers`],
  ['images (openverse, fallback wikimedia)', () => api.images('mountains'), r => r?.length && `${r.length} results, first: ${r[0].url.slice(0, 60)}`],
  ['joke (jokeapi.dev)', () => api.joke(), r => r && r.slice(0, 70)],
  ['quote (zenquotes.io)', () => api.quote(), r => r && `"${r.text.slice(0, 50)}" — ${r.author}`],
  ['fact (uselessfacts)', () => api.fact(), r => r && r.slice(0, 70)],
  ['namaz (aladhan.com)', () => api.prayer('Karachi'), r => r && `Fajr ${r.timings.Fajr}, Maghrib ${r.timings.Maghrib}`],
  ['country (countriesnow.space)', () => api.country('Pakistan'), r => r && `${r.flag} ${r.name}, capital ${r.capital}`],
  ['short url (is.gd)', () => api.shorten('https://github.com/WhiskeySockets/Baileys'), r => r],
  ['qr (qrserver.com)', () => getBuffer(api.qrUrl('AQDAS MD')), r => r?.length > 500 && `PNG ${r.length} bytes`],
  ['meme (meme-api.com)', () => api.meme(), r => r && `${r.title.slice(0, 50)} (${r.url.slice(0, 40)})`],
  ['tts (google translate tts)', () => tts('Assalam o alaikum dosto', 'ur'), r => r?.length > 1000 && `MP3 ${r.length} bytes`]
]

let ok = 0
for (const [name, fn, show] of checks) {
  const t = Date.now()
  try {
    const r = await fn(); const s = show(r)
    if (s) { ok++; console.log(`✅ ${name} (${Date.now() - t} ms): ${s}`) } else console.log(`❌ ${name}: empty result`)
  } catch (e) { console.log(`❌ ${name}: ${e.message}`) }
}
console.log(`\n${ok}/${checks.length} live APIs answered`)
