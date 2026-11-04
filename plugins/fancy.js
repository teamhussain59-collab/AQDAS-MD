// Fancy fonts: .boldfont AQDAS (alias .font1 ...), .fancy AQDAS = sab fonts
import { FONTS } from '../lib/fancy.js'
import { quotedText } from '../lib/limit.js'

const MAX = 300
const get = ctx => (ctx.text || quotedText(ctx)).slice(0, MAX)

export default [
  {
    name: 'fancy', alias: ['fonts', 'fancytext', 'style'], category: 'fancy', usage: '<text>', desc: 'Text ko sab fancy fonts mein dikhao',
    async run (ctx) {
      const t = get(ctx)
      if (!t) return ctx.reply(`🔤 Use: ${ctx.prefix}fancy AQDAS MD\nEk font: ${ctx.prefix}boldfont AQDAS (ya ${ctx.prefix}font1 AQDAS)`)
      const s = t.slice(0, 40)
      let out = '🔤 *FANCY FONTS*\n\n'
      FONTS.forEach(([n, , f], i) => { out += `${i + 1}. ${f(s)}\n   _${ctx.prefix}${n} / ${ctx.prefix}font${i + 1}_\n` })
      await ctx.reply(out + '\n> AQDAS MD')
    }
  },
  ...FONTS.map(([name, desc, fn], i) => ({
    name, alias: [`font${i + 1}`], category: 'fancy', usage: '<text>', desc: 'Font: ' + desc,
    async run (ctx) {
      const t = get(ctx)
      if (!t) return ctx.reply(`🔤 Use: ${ctx.prefix}${name} AQDAS MD`)
      await ctx.reply(fn(t))
    }
  }))
]
