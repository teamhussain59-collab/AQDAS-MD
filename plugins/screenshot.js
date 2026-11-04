import { screenshot, BadUrl } from '../lib/screenshot.js'

async function shoot (ctx, opts, label) {
  const link = ctx.args[0] || (ctx.quoted ? (ctx.quoted.message?.conversation || ctx.quoted.message?.extendedTextMessage?.text || '').match(/\S+\.\S+/)?.[0] : '')
  if (!link) return ctx.reply(`📸 Use: ${ctx.prefix}${ctx.command} https://google.com`)
  await ctx.react('⏳')
  try {
    const r = await screenshot(link, opts)
    await ctx.reply({ image: r.buffer, mimetype: r.mimetype, caption: `📸 *${label}*\n🔗 ${r.url}\n\n> AQDAS MD` })
    await ctx.react('✅')
  } catch (e) {
    await ctx.react('❌')
    await ctx.reply(e instanceof BadUrl ? '❌ ' + e.message : '⚠️ ' + e.message)
  }
}

export default [
  { name: 'ss', alias: ['screenshot', 'ssweb', 'webss'], category: 'tools', usage: '<link>', desc: 'Kisi bhi website ka screenshot (desktop)', async run (ctx) { await shoot(ctx, {}, 'Website screenshot') } },
  { name: 'ssmobile', alias: ['ssphone', 'ssm'], category: 'tools', usage: '<link>', desc: 'Website ka phone-size screenshot', async run (ctx) { await shoot(ctx, { mobile: true }, 'Mobile screenshot') } },
  { name: 'ssfull', alias: ['fullss', 'ssf'], category: 'tools', usage: '<link>', desc: 'Website ka poora (lamba) screenshot', async run (ctx) { await shoot(ctx, { full: true }, 'Full page screenshot') } }
]
