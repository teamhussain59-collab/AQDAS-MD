// .movie (info + trailer) aur .freemovie (sirf free/public-domain filmein, Archive.org se)
import { ytSearch } from '../lib/download.js'
import { setPick } from '../lib/playpick.js'

const UA = { 'user-agent': 'Mozilla/5.0 AQDAS-MD' }
const j = async (u, t = 15000) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(t) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }

async function imdb (q) {
  const s = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const d = await j(`https://v3.sg.media-imdb.com/suggestion/${encodeURIComponent(s[0] || 'x')}/${encodeURIComponent(s)}.json`)
  return (d.d || []).find(x => /^tt/.test(x.id) && ['movie', 'tvSeries', 'tvMiniSeries', 'tvMovie'].includes(x.qid)) || (d.d || []).find(x => /^tt/.test(x.id))
}
async function wiki (title, year) {
  for (const q of [`${title} (${year} film)`, `${title} (film)`, title]) {
    try {
      const d = await j('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q.replace(/ /g, '_')), 10000)
      if (d.type !== 'disambiguation' && d.extract && /film|movie|series|drama/i.test(d.extract)) return d.extract
    } catch {}
  }
  return ''
}
async function rating (id) {
  try {
    const r = await fetch('https://www.imdb.com/title/' + id + '/', { headers: { ...UA, 'accept-language': 'en' }, signal: AbortSignal.timeout(12000) })
    const h = await r.text()
    const m = /"aggregateRating":\{[^}]*"ratingValue":([\d.]+)/.exec(h)
    const g = /"genre":(\[[^\]]*\]|"[^"]*")/.exec(h)
    return { rate: m ? m[1] : '', genre: g ? [].concat(JSON.parse(g[1])).join(', ') : '' }
  } catch { return {} }
}

async function movie (ctx) {
  const q = (ctx.text || '').trim()
  if (!q) return ctx.reply(`Use: ${ctx.prefix}${ctx.command} <movie ka naam>\nMisal: ${ctx.prefix}${ctx.command} inception`)
  await ctx.react('🔎')
  let m
  try { m = await imdb(q) } catch {}
  if (!m) { await ctx.react('❌'); return ctx.reply('❌ Movie nahi mili, naam check karo') }
  const [plot, rt] = await Promise.all([wiki(m.l, m.y), rating(m.id)])
  const cap = `🎬 *${m.l}*${m.y ? ' (' + m.y + ')' : ''}\n` +
    (rt.rate ? `⭐ IMDb: *${rt.rate}/10*\n` : '') +
    (rt.genre ? `🎭 ${rt.genre}\n` : '') +
    (m.s ? `👥 ${m.s}\n` : '') +
    (plot ? `\n📖 ${plot.slice(0, 600)}\n` : '') +
    `\n🔗 https://www.imdb.com/title/${m.id}/\n\n*Reply 1* = trailer (MP4) 🎞\n_— AQDAS MD_`
  let sent
  try { sent = m.i?.imageUrl ? await ctx.reply({ image: { url: m.i.imageUrl.replace('._V1_.', '._V1_SX600.') }, caption: cap }) : await ctx.reply(cap) } catch { sent = await ctx.reply(cap) }
  let tid = null
  try { tid = await ytSearch(`${m.l} ${m.y || ''} official trailer`) } catch {}
  if (tid) setPick(ctx, { id: tid, title: m.l + ' trailer', until: Date.now() + 3 * 60000, cardId: sent?.key?.id, only: 'video' })
  await ctx.react('✅')
}

// sirf public-domain: Archive.org "feature_films" collection, 1964 se pehle ki
async function freeSearch (q) {
  const p = new URLSearchParams({ q: `title:(${q}) AND mediatype:movies AND collection:feature_films AND year:[1900 TO 1963]`, rows: '5', output: 'json', sort: 'downloads desc' })
  for (const f of ['identifier', 'title', 'year', 'downloads']) p.append('fl[]', f)
  const d = await j('https://archive.org/advancedsearch.php?' + p, 20000)
  return d.response?.docs || []
}
async function freeFile (id) {
  const d = await j('https://archive.org/metadata/' + encodeURIComponent(id), 20000)
  const mp4 = (d.files || []).filter(f => /\.mp4$/i.test(f.name) && +f.size > 0).sort((a, b) => +a.size - +b.size)
  const pick = mp4.find(f => +f.size < 95 * 1048576)
  return { pick, title: d.metadata?.title || id, url: f => `https://archive.org/download/${id}/${encodeURIComponent(f.name).replace(/%2F/g, '/')}`, biggest: mp4[mp4.length - 1] }
}

async function freemovie (ctx) {
  const q = (ctx.text || '').trim().replace(/[()":]/g, ' ')
  if (!q) return ctx.reply(`📥 Sirf *free / public-domain* purani filmein (Archive.org)\nUse: ${ctx.prefix}${ctx.command} <naam>\nMisal: ${ctx.prefix}${ctx.command} nosferatu, ${ctx.prefix}${ctx.command} the kid, ${ctx.prefix}${ctx.command} night of the living dead`)
  await ctx.react('🔎')
  let docs = []
  try { docs = await freeSearch(q) } catch {}
  if (!docs.length) { await ctx.react('❌'); return ctx.reply('❌ Ye movie free (public domain) list mein nahi mili.\nSirf purani copyright-free filmein milti hain (1963 se pehle ki).') }
  const doc = docs[0]
  let f
  try { f = await freeFile(doc.identifier) } catch { await ctx.react('❌'); return ctx.reply('❌ Archive.org abhi jawab nahi de raha, baad mein try karo') }
  const page = 'https://archive.org/details/' + doc.identifier
  if (!f.pick) {
    await ctx.react('✅')
    return ctx.reply(`🎬 *${f.title}*${doc.year ? ' (' + doc.year + ')' : ''}\n📦 File WhatsApp ke liye bohot bari hai.\n⬇️ Yahan se poori download karo:\n${f.biggest ? f.url(f.biggest) : page}\n\n✅ Public domain (free & legal)\n_— AQDAS MD_`)
  }
  await ctx.reply(`📥 *${f.title}* bhej raha hoon (${(f.pick.size / 1048576).toFixed(0)} MB)...`)
  const url = f.url(f.pick)
  try {
    await ctx.reply({ document: { url }, mimetype: 'video/mp4', fileName: String(f.title).slice(0, 60) + '.mp4', caption: `🎬 *${f.title}*${doc.year ? ' (' + doc.year + ')' : ''}\n✅ Public domain (free & legal)\n🔗 ${page}\n_— AQDAS MD_` })
    await ctx.react('✅')
  } catch (e) {
    await ctx.react('❌'); await ctx.reply(`❌ Bhej nahi saka. Direct link:\n${url}`)
  }
}

export default [
  { name: 'movie', alias: ['film', 'imdb', 'movieinfo'], category: 'search', usage: '<naam>', desc: 'Movie info: poster, rating, kahani + reply 1 = trailer', run: movie },
  { name: 'freemovie', alias: ['pdmovie', 'oldmovie', 'classicmovie'], category: 'download', usage: '<naam>', desc: 'Free/public-domain purani filmein poori download (Archive.org)', run: freemovie }
]
