// Logo maker: har style apni command (.neon AQDAS HACKER), .logo sab styles ki list
import { makeLogo, STYLES, MAX_CHARS } from '../lib/logo.js'
import { heavy, quotedText } from '../lib/limit.js'

async function render (ctx, style, text) {
  text = (text || quotedText(ctx)).trim()
  if (!text) return ctx.reply(`🎨 Use: ${ctx.prefix}${style} AQDAS HACKER\nSab styles: ${ctx.prefix}logo`)
  if ([...text].length > MAX_CHARS) return ctx.reply(`❌ Text bohat lamba hai — max ${MAX_CHARS} letters.`)
  await ctx.react('🎨')
  try {
    const img = await heavy(() => makeLogo(style, text))
    await ctx.reply({ image: img, mimetype: 'image/jpeg', caption: `🎨 *${style.toUpperCase()}* logo\n\n> AQDAS MD` })
    await ctx.react('✅')
  } catch (e) {
    await ctx.react('❌')
    await ctx.reply('⚠️ Logo nahi ban saka: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 150))
  }
}

const styleCmds = Object.values(STYLES).map(s => ({
  name: s.name, category: 'logo', usage: '<text>', desc: `Logo: ${s.desc}`,
  async run (ctx) { await render(ctx, s.name, ctx.text) }
}))

export default [
  {
    name: 'logo', alias: ['logos', 'logomenu', 'textpro'], category: 'logo', usage: '[style] [text]', desc: 'Sab logo styles ki list (ya .logo neon AQDAS)',
    async run (ctx) {
      const style = (ctx.args[0] || '').toLowerCase()
      if (STYLES[style]) return render(ctx, style, ctx.args.slice(1).join(' '))
      const names = Object.keys(STYLES)
      let t = `🎨 *AQDAS MD LOGO MAKER* (${names.length} styles)\n\nUse: *${ctx.prefix}neon AQDAS HACKER*\n(ya kisi message pe reply karke ${ctx.prefix}fire)\n\n`
      for (let i = 0; i < names.length; i += 4) t += names.slice(i, i + 4).map(n => ctx.prefix + n).join('  ') + '\n'
      t += `\nMax ${MAX_CHARS} letters • 2-3 lines khud ban jati hain\n> AQDAS MD`
      await ctx.reply(t)
    }
  },
  ...styleCmds
]
