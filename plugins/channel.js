// WhatsApp Channel commands — sirf ISI number (session) ke apne account se, jaise koi aam user tap kare.
// Sab linked numbers se ek saath react/vote karne wala koi mode NAHI (fake engagement = number ban).
const LINK = /whatsapp\.com\/channel\/([A-Za-z0-9]+)(?:\/(\d+))?/i
const cache = new Map()

async function channelJid (sock, invite) {
  if (cache.has(invite)) return cache.get(invite)
  const meta = await sock.newsletterMetadata('invite', invite)
  const id = meta?.id
  if (!id) throw new Error('Channel nahi mila (link check karo)')
  cache.set(invite, { id, name: meta?.thread_metadata?.name?.text || meta?.name || '' })
  return cache.get(invite)
}

export default [
  {
    name: 'chreact', alias: ['channelreact'], category: 'owner', owner: true, usage: '<channel post link> <emoji>', desc: 'Channel post pe apne number se react (ek dafa)',
    async run (ctx) {
      const m = LINK.exec(ctx.text || '')
      const emoji = (ctx.args.find(a => !LINK.test(a)) || '').trim()
      if (!m || !m[2] || !emoji) return ctx.reply(`Use: ${ctx.prefix}chreact https://whatsapp.com/channel/XXXX/123 ❤️\n(post pe tap > Share > link copy — aakhir mein post number hota hai)`)
      try {
        const ch = await channelJid(ctx.sock, m[1])
        await ctx.sock.newsletterReactMessage(ch.id, m[2], emoji)
        await ctx.reply(`✅ ${emoji} react ho gaya${ch.name ? ' — ' + ch.name : ''} (post ${m[2]})`)
      } catch (e) { await ctx.reply('❌ React nahi hua: ' + (e?.message || e)) }
    }
  },
  {
    name: 'chfollow', alias: ['channelfollow'], category: 'owner', owner: true, usage: '<channel link>', desc: 'Channel follow karo (apne number se)',
    async run (ctx) {
      const m = LINK.exec(ctx.text || '')
      if (!m) return ctx.reply(`Use: ${ctx.prefix}chfollow https://whatsapp.com/channel/XXXX`)
      try {
        const ch = await channelJid(ctx.sock, m[1])
        await ctx.sock.newsletterFollow(ch.id)
        await ctx.reply(`✅ Follow ho gaya${ch.name ? ': ' + ch.name : ''}`)
      } catch (e) { await ctx.reply('❌ Follow nahi hua: ' + (e?.message || e)) }
    }
  },
  {
    name: 'chvote', alias: ['channelvote'], category: 'owner', owner: true, usage: '<channel poll link> <option no.>', desc: 'Channel poll vote (abhi support nahi)',
    async run (ctx) {
      await ctx.reply('ℹ️ Channel poll pe vote abhi bot se mumkin nahi — WhatsApp library (Baileys) channel polls pe vote ka support nahi deti. Vote apne phone se khud karo.')
    }
  }
]
