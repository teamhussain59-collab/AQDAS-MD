// Owner-only: .chpost <text> -> text post on the AQDAS TECH channel (config.mainChannel).
// Channel ka JID runtime par channel link se nikalta hai (channelJid), koi JID hard-code nahi.
// Sirf owner. Koi automation, koi reaction, koi bulk nahi.
import config from '../config.js'
import { channelJid } from '../lib/chgroup.js'

export default [
  {
    name: 'chpost',
    category: 'owner',
    owner: true,
    usage: '<text>',
    desc: 'AQDAS TECH channel par text post karo (sirf owner)',
    async run (ctx) {
      // Command ke baad ka sara text, line breaks samet
      const text = String(ctx.body || '').trim().replace(/^\S+/, '').trim()
      if (!text) return ctx.reply(`Use: ${ctx.prefix}chpost <text>\n(channel par ye text post ho jayega)`)
      const link = config.mainChannel || ''
      const m = /whatsapp\.com\/channel\/([A-Za-z0-9]+)/i.exec(link)
      if (!m) return ctx.reply('❌ Channel link config mein nahi mila.')
      let ch
      try {
        ch = await channelJid(ctx.sock, m[1])
      } catch (e) {
        return ctx.reply('❌ Channel nahi mila: ' + (e?.message || e))
      }
      try {
        await ctx.sock.sendMessage(ch.id, { text })
        await ctx.reply(`✅ Channel par post ho gaya${ch.name ? ' — ' + ch.name : ''}`)
      } catch (e) {
        await ctx.reply('❌ Post nahi hua: ' + (e?.message || e) + '\n(Bot channel ka admin hona chahiye)')
      }
    }
  }
]
