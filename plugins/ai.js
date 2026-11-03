import { askAI, clearAI } from '../lib/ai.js'

export default [
  {
    name: 'ai', alias: ['gpt', 'ask', 'bot'], category: 'ai', usage: '<sawal>', desc: 'AI se kuch bhi poocho (OpenRouter)',
    async run (ctx) {
      const q = ctx.text || ctx.quoted?.message?.conversation || ctx.quoted?.message?.extendedTextMessage?.text
      if (!q) return ctx.reply(`Use: ${ctx.prefix}ai Pakistan ka capital kya hai?`)
      await ctx.sock.sendPresenceUpdate('composing', ctx.jid).catch(() => {})
      const a = await askAI(ctx.jid, q)
      await ctx.reply(`🤖 ${a}`)
    }
  },
  {
    name: 'aireset', category: 'ai', desc: 'AI ki chat memory saaf karo',
    async run (ctx) { clearAI(ctx.jid); await ctx.reply('🧹 AI memory clear') }
  }
]
