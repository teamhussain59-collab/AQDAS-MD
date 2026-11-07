// .gid — channel link ka JID (ya group/chat ka JID)
export default [
  {
    name: 'gid', alias: ['cjid', 'channelid', 'chid'], category: 'tools', usage: '<channel link>',
    desc: 'Channel link se uski ID nikalo (ya group/chat ki ID). Misal: .gid https://whatsapp.com/channel/xxxx',
    async run (ctx) {
      const txt = [ctx.args.join(' '), ctx.quoted?.text, ctx.quoted?.body].filter(Boolean).join(' ')
      const m = txt.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i)
      if (!m) return ctx.reply(`🆔 ${ctx.jid}\n\nChannel ki ID ke liye: ${ctx.prefix}gid https://whatsapp.com/channel/...`)
      try {
        const meta = await Promise.race([ctx.sock.newsletterMetadata('invite', m[1]), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 20000))])
        const subs = meta?.subscribers ?? meta?.thread_metadata?.subscribers_count
        await ctx.reply(`📢 *${meta?.name || meta?.thread_metadata?.name?.text || 'Channel'}*\n\n🆔 ${meta?.id}\n` + (subs != null ? `👥 Followers: ${subs}\n` : '') + '\nNote: ye sirf channel ki ID dikhata hai, followers nahi badhata.')
      } catch (e) {
        await ctx.reply('❌ Channel nahi mila. Link check karo jani.')
      }
    }
  }
]
