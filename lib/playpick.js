// .play: pehle song ki photo + info, phir user "1" (MP3) ya "2" (MP4) reply kare
import { download, ytSearch, ytId, isUrl } from './download.js'

const pending = new Map() // jid|sender -> { id, title, until, cardId }
const key = (ctx) => ctx.jid + '|' + (ctx.sender || '')
const fmtDur = s => { s = +s; if (!s) return ''; const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0') }

async function meta (id) {
  const url = 'https://www.youtube.com/watch?v=' + id
  let title = 'YouTube song', author = '', dur = ''
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(10000) })
    if (r.ok) { const j = await r.json(); title = j.title || title; author = j.author_name || '' }
  } catch {}
  return { id, url, title, author, dur, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
}

export async function playCard (ctx) {
  const q = (ctx.text || '').trim()
  if (!q) return ctx.reply(`Use: ${ctx.prefix}${ctx.command} <song ka naam ya link>`)
  await ctx.react('🔎')
  let id = isUrl(q) ? ytId(q) : null
  if (!id && isUrl(q)) return ctx.reply('❌ Sirf YouTube link ya song ka naam do')
  if (!id) { try { id = await ytSearch(q) } catch { id = null } }
  if (!id) { await ctx.react('❌'); return ctx.reply('❌ Song nahi mila. Naam thora badal ke try karo.') }
  const m = await meta(id)
  const caption = `🎵 *${m.title}*\n` + (m.author ? `👤 ${m.author}\n` : '') + `🔗 ${m.url}\n\n*Reply karo:*\n1️⃣ = MP3 (audio) 🎧\n2️⃣ = MP4 (video) 🎬\n\n_— AQDAS MD_`
  let sent
  try { sent = await ctx.reply({ image: { url: m.thumb }, caption }) } catch { sent = await ctx.reply(caption) }
  pending.set(key(ctx), { id, title: m.title, until: Date.now() + 3 * 60000, cardId: sent?.key?.id })
  if (pending.size > 500) pending.delete(pending.keys().next().value)
  await ctx.react('✅')
}

// handler se: non-command message "1" / "2". true = sambhal liya
export async function playPick (ctx) {
  const t = (ctx.body || '').trim()
  if (t !== '1' && t !== '2') return false
  const k = key(ctx)
  const p = pending.get(k)
  if (!p || Date.now() > p.until) { if (p) pending.delete(k); return false }
  if (p.only === 'video' && t !== '1') return false
  const qid = ctx.quoted?.key?.id
  if (qid && p.cardId && qid !== p.cardId) return false
  pending.delete(k)
  const kind = p.only === 'video' ? 'video' : (t === '1' ? 'audio' : 'video')
  await ctx.react('⏳')
  await ctx.reply(`📥 *${p.title}* ${kind === 'audio' ? 'MP3' : 'MP4'} ban raha hai...`)
  let r
  try { r = await download('https://www.youtube.com/watch?v=' + p.id, kind) } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); return true }
  try {
    if (kind === 'audio') {
      await ctx.reply({ audio: r.buffer, mimetype: 'audio/mpeg', fileName: (r.title || p.title) + '.mp3' })
    } else if (r.buffer.length > 60 * 1048576) {
      await ctx.reply({ document: r.buffer, mimetype: 'video/mp4', fileName: String(r.title || p.title).slice(0, 60) + '.mp4', caption: `🎬 *${p.title}*\n_— AQDAS MD_` })
    } else {
      await ctx.reply({ video: r.buffer, mimetype: 'video/mp4', caption: `🎬 *${p.title}*\n_— AQDAS MD_` })
    }
    await ctx.react('✅')
  } finally { r.cleanup && r.cleanup() }
  return true
}
export const _pending = pending
export const setPick = (ctx, v) => { pending.set(key(ctx), v); if (pending.size > 500) pending.delete(pending.keys().next().value) }
