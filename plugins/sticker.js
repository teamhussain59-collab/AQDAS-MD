import { toSticker, stickerToImage } from '../lib/media.js'
import config from '../config.js'

export default [
  {
    name: 'sticker', alias: ['s', 'stiker'], category: 'sticker', usage: '(photo/video pe reply)', desc: 'Photo ya video (6 sec) se sticker',
    async run (ctx) {
      const t = ctx.targetType
      if (t !== 'imageMessage' && t !== 'videoMessage') return ctx.reply(`📸 Photo/video bhejo caption *${ctx.prefix}s* ke sath, ya us pe reply karo *${ctx.prefix}s*`)
      await ctx.react('⏳')
      const buf = await ctx.download()
      const [pack, author] = ctx.text ? ctx.text.split('|').map(s => s.trim()) : []
      const st = await toSticker(buf, { video: t === 'videoMessage', pack: pack || config.packname, author: author || config.author })
      await ctx.reply({ sticker: st })
      await ctx.react('✅')
    }
  },
  {
    name: 'take', alias: ['steal', 'wm'], category: 'sticker', usage: 'pack|author', desc: 'Sticker ka pack naam badlo',
    async run (ctx) {
      if (ctx.targetType !== 'stickerMessage') return ctx.reply(`Sticker pe reply karo: ${ctx.prefix}take AQDAS|HACKER`)
      const { addExif } = await import('../lib/media.js')
      const [pack, author] = (ctx.text || `${config.packname}|${config.author}`).split('|').map(s => s.trim())
      await ctx.reply({ sticker: await addExif(await ctx.download(), pack, author || config.author) })
    }
  },
  {
    name: 'toimg', alias: ['toimage', 'photo'], category: 'sticker', usage: '(sticker pe reply)', desc: 'Sticker ko photo banao',
    async run (ctx) {
      if (ctx.targetType !== 'stickerMessage') return ctx.reply(`Sticker pe reply karo *${ctx.prefix}toimg*`)
      await ctx.react('⏳')
      const png = await stickerToImage(await ctx.download())
      await ctx.reply({ image: png, caption: '✅ Done — AQDAS MD' })
    }
  }
]
