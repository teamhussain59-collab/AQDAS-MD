// ===== Real free public APIs (no key). Har function plain data return karta hai =====
import { getJSON, getText } from './http.js'
const e = encodeURIComponent

export async function weather (city) {
  const d = await getJSON(`https://wttr.in/${e(city)}?format=j1`)
  const c = d?.current_condition?.[0]; const a = d?.nearest_area?.[0]
  if (!c) return null
  return { place: [a?.areaName?.[0]?.value, a?.country?.[0]?.value].filter(Boolean).join(', ') || city, temp: c.temp_C, feels: c.FeelsLikeC, desc: c.weatherDesc?.[0]?.value, humidity: c.humidity, wind: c.windspeedKmph, today: d.weather?.[0] ? { min: d.weather[0].mintempC, max: d.weather[0].maxtempC } : null }
}

export async function lyrics (q) {
  const [artist, title] = q.includes('-') ? q.split('-').map(s => s.trim()) : [null, q]
  const list = await getJSON(`https://lrclib.net/api/search?${artist && title ? `artist_name=${e(artist)}&track_name=${e(title)}` : `q=${e(q)}`}`)
  const hit = (list || []).find(x => x.plainLyrics) || null
  if (!hit) return null
  return { title: hit.trackName, artist: hit.artistName, lyrics: hit.plainLyrics }
}

export async function wiki (q, lang = 'en') {
  const s = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&search=${e(q)}`)
  const title = s?.[1]?.[0]
  if (!title) return null
  const d = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${e(title.replace(/ /g, '_'))}`)
  if (!d?.extract) return null
  return { title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page, image: d.thumbnail?.source || null }
}

export async function translate (text, to = 'en') {
  const d = await getJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${e(to)}&dt=t&q=${e(text)}`)
  if (!d?.[0]) return null
  return { text: d[0].map(x => x[0]).join(''), from: d[2] }
}

export async function define (word) {
  let d = null
  try { d = await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${e(word)}`) } catch {}
  if (Array.isArray(d) && d[0]) {
    const w = d[0]
    return { word: w.word, phonetic: w.phonetic || w.phonetics?.find(p => p.text)?.text || '', meanings: (w.meanings || []).slice(0, 3).map(m => ({ pos: m.partOfSpeech, def: m.definitions?.[0]?.definition, ex: m.definitions?.[0]?.example })) }
  }
  // fallback: freedictionaryapi.com
  const f = await getJSON(`https://freedictionaryapi.com/api/v1/entries/en/${e(word)}`)
  const entries = f?.entries || []
  if (!entries.length) return null
  return { word: f.word || word, phonetic: entries[0].pronunciations?.find(p => p.type === 'ipa')?.text || '', meanings: entries.slice(0, 3).map(en => ({ pos: en.partOfSpeech, def: en.senses?.[0]?.definition, ex: en.senses?.[0]?.examples?.[0] })) }
}

export async function currency (amount, from, to) {
  const d = await getJSON(`https://open.er-api.com/v6/latest/${e(from.toUpperCase())}`)
  if (!d || d.result !== 'success') return null
  const rate = d.rates?.[to.toUpperCase()]
  if (!rate) return null
  return { amount, from: from.toUpperCase(), to: to.toUpperCase(), rate, result: amount * rate, updated: d.time_last_update_utc }
}

export async function github (user) {
  const d = await getJSON(`https://api.github.com/users/${e(user)}`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!d?.login) return null
  return { login: d.login, name: d.name, bio: d.bio, repos: d.public_repos, followers: d.followers, following: d.following, created: d.created_at, avatar: d.avatar_url, url: d.html_url, location: d.location }
}

export async function images (q) {
  let d = null
  try { d = await getJSON(`https://api.openverse.org/v1/images/?q=${e(q)}&page_size=10&mature=false`, { timeout: 8000 }) } catch {}
  const r = (d?.results || []).filter(x => x.url && /\.(jpe?g|png)(\?|$)/i.test(x.url))
  if (r.length) return r.map(x => ({ url: x.url, title: x.title, source: x.foreign_landing_url }))
  // fallback: Wikimedia Commons
  const w = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${e(q)}&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json`)
  const pages = Object.values(w?.query?.pages || {})
  return pages.map(p => ({ url: p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url, title: p.title, source: p.imageinfo?.[0]?.descriptionurl })).filter(x => x.url && /\.(jpe?g|png)/i.test(x.url))
}

export async function joke () {
  const d = await getJSON('https://v2.jokeapi.dev/joke/Programming,Misc,Pun?safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit')
  if (!d || d.error) return null
  return d.type === 'single' ? d.joke : `${d.setup}\n\n${d.delivery}`
}

export async function quote () {
  const d = await getJSON('https://zenquotes.io/api/random')
  const q = d?.[0]
  if (!q?.q || /too many requests/i.test(q.q)) return null
  return { text: q.q, author: q.a }
}

export async function fact () {
  const d = await getJSON('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en')
  return d?.text || null
}

export async function prayer (city, country = 'Pakistan') {
  const d = await getJSON(`https://api.aladhan.com/v1/timingsByCity?city=${e(city)}&country=${e(country)}&method=1&school=1`)
  if (!d?.data?.timings) return null
  return { timings: d.data.timings, date: d.data.date?.readable, hijri: d.data.date?.hijri ? `${d.data.date.hijri.day} ${d.data.date.hijri.month?.en} ${d.data.date.hijri.year}` : '' }
}

export async function country (name) {
  const d = await getJSON('https://countriesnow.space/api/v0.1/countries/info?returns=capital,currency,unicodeFlag,dialCode,iso2', { timeout: 15000 })
  const n = name.trim().toLowerCase()
  const c = (d?.data || []).find(x => x.name.toLowerCase() === n) || (d?.data || []).find(x => x.name.toLowerCase().includes(n))
  if (!c) return null
  let population = null
  try {
    const p = await getJSON(`https://countriesnow.space/api/v0.1/countries/population/q?country=${e(c.name)}`)
    const last = p?.data?.populationCounts?.slice(-1)[0]
    if (last) population = `${Number(last.value).toLocaleString('en-US')} (${last.year})`
  } catch {}
  return { name: c.name, capital: c.capital, currency: c.currency, flag: c.unicodeFlag || '', code: c.dialCode ? '+' + String(c.dialCode).replace(/^\+/, '') : '', iso2: c.iso2, population }
}

export async function shorten (url) {
  const t = await getText(`https://is.gd/create.php?format=simple&url=${e(url)}`)
  return /^https?:\/\//.test(t.trim()) ? t.trim() : null
}

export const qrUrl = text => `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=10&data=${e(text)}`

export async function meme () {
  const d = await getJSON('https://meme-api.com/gimme/wholesomememes', { timeout: 15000 })
  if (!d?.url || d.nsfw) return null
  return { title: d.title, url: d.url, sub: d.subreddit }
}
