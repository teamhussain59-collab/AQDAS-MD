import { jidNormalizedUser } from '@whiskeysockets/baileys'

// .profic <number> / @tag / reply  ->  us number ki profile picture (DP) bhejta hai
// Sirf wahi DP milti hai jo WhatsApp us number ki privacy setting ke hisaab se dikhata hai.
export default [
  {
    name: 'profic', alias: ['getpp', 'getdp', 'pfp'], category: 'tools',
    usage: '<number> / @tag / reply', desc: 'Kisi bhi number ki DP (profile picture) nikalo',
    async run (ctx) {
      let jid = null
      if (ctx.mentioned && ctx.mentioned.length) jid = ctx.mentioned[0]
      else if (ctx.args && ctx.args.length) {
        let n = ctx.args.join('').replace(/[^0-9]/g, '')
        if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1)
        if (n.length >= 10) jid = n + '@s.whatsapp.net'
      } else if (ctx.quoted && (ctx.quoted.key?.participant || ctx.quoted.key?.remoteJid)) {
        jid = ctx.quoted.key.participant || ctx.quoted.key.remoteJid
      }
      if (!jid) return ctx.reply(`Number likho jani: *${ctx.prefix}profic 923001234567*\n(ya kisi ko tag / reply karo)`)
      jid = jidNormalizedUser(jid)
      const num = jid.split('@')[0]
      try { await ctx.react('⏳') } catch {}
      try {
        const [ex] = await ctx.sock.onWhatsApp(num)
        if (ex && ex.exists === false) { try { await ctx.react('❌') } catch {}; return ctx.reply(`❌ +${num} WhatsApp pe nahi hai`) }
      } catch {}
      let url = null
      try { url = await ctx.sock.profilePictureUrl(jid, 'image') } catch {}
      if (!url) { try { url = await ctx.sock.profilePictureUrl(jid, 'preview') } catch {} }
      if (!url) {
        try { await ctx.react('❌') } catch {}
        return ctx.reply(`❌ +${num} ki DP nahi mili.\nYa to DP lagi nahi, ya unhone privacy se chhupa rakhi hai.`)
      }
      await ctx.reply({ image: { url }, caption: `🖼️ *Profile Picture*\n📱 +${num}\n\n> AQDAS MD ⚡` })
      try { await ctx.react('✅') } catch {}
    }
  }
]
