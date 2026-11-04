// Anime motion stickers (.hug .kiss .slap ...) + .animesticker <word> + .stickersearch <word>
import { CATEGORIES, RENAME, findCategory, fetchAnime, toAnimSticker } from '../lib/anime.js'
import { searchStickers } from '../lib/stickersearch.js'
import { toSticker } from '../lib/media.js'
import { heavy } from '../lib/limit.js'
import config from '../config.js'

const EMOJI = { hug: '🤗', kiss: '😘', slap: '🖐️', pat: '🫳', cry: '😭', dance: '💃', smile: '😊', wave: '👋', wink: '😉', punch: '👊', bite: '😬', blush: '😳', happy: '😄', poke: '👉', cuddle: '🥰', highfive: '🙌', laugh: '😂', angry: '😠', sleep: '😴', love: '❤️', kick: '🦵', bonk: '🔨', yeet: '🚀', thumbsup: '👍', clap: '👏', sad: '😢', shy: '🙈', celebrate: '🎉' }

function target (ctx) {
  const t = ctx.mentioned?.[0] || (ctx.quoted?.key?.participant && ctx.quoted.key.participant !== ctx.sender ? ctx.quoted.key.participant : null)
  return t || null
}

export async function sendAnime (ctx, cat) {
  await ctx.react(EMOJI[cat] || '⏳')
  try {
    const st = await heavy(async () => { const g = await fetchAnime(cat); return toAnimSticker(g.buffer, { pack: config.packname, author: config.author }) })
    await ctx.reply({ sticker: st.sticker })
    const to = target(ctx)
    if (to) {
      const a = '@' + String(ctx.sender).split('@')[0], b = '@' + String(to).split('@')[0]
      await ctx.sock.sendMessage(ctx.jid, { text: `${EMOJI[cat] || '✨'} ${a} → ${b} *${cat}*`, mentions: [ctx.sender, to] })
    }
  } catch (e) {
    await ctx.react('❌')
    await ctx.reply('⚠️ ' + String(e.message).slice(0, 180))
  }
}

const reactionCmds = CATEGORIES.map(cat => ({
  name: RENAME[cat] || cat, category: 'anime', usage: '[@tag]', desc: `Anime ${cat} motion sticker`,
  async run (ctx) { await sendAnime(ctx, cat) }
}))

export default [
  {
    name: 'animesticker', alias: ['asticker', 'animestickers', 'animelist'], category: 'anime', usage: '<word>', desc: 'Anime motion sticker dhoondo (jaise: .animesticker hug)',
    async run (ctx) {
      const cat = findCategory(ctx.text)
      if (!cat) {
        const names = CATEGORIES.map(c => ctx.prefix + (RENAME[c] || c))
        let t = `🌸 *ANIME MOTION STICKERS* (${names.length})\n\nUse: *${ctx.prefix}hug* (ya kisi ko tag: ${ctx.prefix}hug @user)\nYa: *${ctx.prefix}animesticker <word>*\n\n`
        for (let i = 0; i < names.length; i += 5) t += names.slice(i, i + 5).join('  ') + '\n'
        return ctx.reply(t + (ctx.text ? `\n❌ "${ctx.text}" nahi mila — upar wali list se chuno.` : '') + '\n> AQDAS MD')
      }
      await sendAnime(ctx, cat)
    }
  },
  {
    name: 'stickersearch', alias: ['ssearch', 'ssticker', 'searchsticker', 'stickers', 'stsearch'], category: 'sticker', usage: '<word> [1-3]', desc: 'Word se sticker dhoondo (jaise: .stickersearch cat)',
    async run (ctx) {
      let n = 3; const a = [...ctx.args]
      if (/^[1-3]$/.test(a[a.length - 1] || '')) n = Number(a.pop())
      const q = a.join(' ').trim()
      if (!q) return ctx.reply(`🔎 Use: ${ctx.prefix}stickersearch cat\nKam/zyada: ${ctx.prefix}stickersearch dance 1 (1-3)`)
      await ctx.react('🔎')
      try {
        const found = await searchStickers(q, n)
        let sent = 0
        for (const f of found) {
          try {
            const st = await heavy(() => (f.animated ? toAnimSticker(f.buffer).then(r => r.sticker) : toSticker(f.buffer, { video: false })))
            await ctx.reply({ sticker: st }); sent++
          } catch {}
        }
        if (!sent) throw new Error('Sticker ban nahi saka, koi aur word try karo.')
        await ctx.react('✅')
      } catch (e) { await ctx.react('❌'); await ctx.reply('⚠️ ' + String(e.message).slice(0, 180)) }
    }
  },
  ...reactionCmds
]
