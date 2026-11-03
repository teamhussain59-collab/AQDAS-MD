// AI auto-chat, anti-delete, view-once, safe mode, update
import { downloadMediaMessage, normalizeMessageContent, getContentType, jidNormalizedUser } from '@whiskeysockets/baileys'
import config from '../config.js'
import { waLogger } from '../lib/logger.js'
import { GH_ON, gh } from '../lib/github.js'

const onoff = a => { a = String(a || '').toLowerCase(); return ['on', 'enable', '1'].includes(a) ? true : ['off', 'disable', '0'].includes(a) ? false : null }
const st = v => (v ? 'ON ✅' : 'OFF ❌')

export default [
  {
    name: 'autoai', alias: ['aichat', 'autochat'], category: 'ai', owner: true, usage: 'on/off | group on/off', desc: 'Inbox (DM) mein aane wale messages ka AQDAS AI khud jawab de',
    async run (ctx) {
      const s = ctx.settings.load()
      if ((ctx.args[0] || '').toLowerCase() === 'group') {
        const v = onoff(ctx.args[1])
        if (v === null) return ctx.reply(`Groups mein Auto AI: ${st(s.autoAIGroup)}\nUse: ${ctx.prefix}autoai group on / off\n(Group mein sirf tab jawab jab bot ko tag ya reply karein)`)
        s.autoAIGroup = v; ctx.settings.save()
        return ctx.reply(`✅ Groups mein Auto AI ${v ? 'ON (bot ko tag / reply karne pe jawab)' : 'OFF'}`)
      }
      const v = onoff(ctx.args[0])
      if (v === null) return ctx.reply(`🤖 *Auto AI* (AQDAS AI)\nInbox: ${st(s.autoAI)}\nGroups: ${st(s.autoAIGroup)}${config.openrouterKey ? '' : '\n⚠️ Server pe OPENROUTER_API_KEY nahi'}\n\n${ctx.prefix}autoai on / off\n${ctx.prefix}autoai group on / off`)
      s.autoAI = v; ctx.settings.save()
      await ctx.reply(v ? '✅ *Auto AI ON* — ab inbox mein har message ka AQDAS AI jawab dega (user ki zaban mein). Band: ' + ctx.prefix + 'autoai off' : '✅ Auto AI OFF')
    }
  },
  {
    name: 'antidelete', alias: ['antidel'], category: 'auto', owner: true, usage: 'on/off', desc: 'Koi message delete kare to copy apni "Message yourself" chat mein',
    async run (ctx) {
      const v = onoff(ctx.args[0])
      if (v === null) return ctx.reply(`🗑️ *Anti-delete*: ${st(ctx.settings.get('antiDelete'))}\nUse: ${ctx.prefix}antidelete on / off\nDeleted message ki copy sirf tumhari apni "Message yourself" chat mein aati hai, kabhi group / chat mein nahi.`)
      ctx.settings.set('antiDelete', v)
      await ctx.reply(`✅ Anti-delete ${v ? 'ON — ab se delete hone wale messages ki copy tumhari apni chat mein aayegi' : 'OFF'}`)
    }
  },
  {
    name: 'vv', alias: ['viewonce', 'readviewonce'], category: 'owner', owner: true, usage: '(view-once pe reply)', desc: 'View-once photo/video/voice apni "Message yourself" chat mein',
    async run (ctx) {
      if (!ctx.quoted) return ctx.reply(`View-once photo / video / voice pe reply karke ${ctx.prefix}vv likho`)
      const inner = normalizeMessageContent(ctx.quoted.message)
      const type = getContentType(inner)
      const m = inner?.[type]
      const isVO = !!(ctx.quoted.message?.viewOnceMessage || ctx.quoted.message?.viewOnceMessageV2 || ctx.quoted.message?.viewOnceMessageV2Extension || m?.viewOnce)
      if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) return ctx.reply(isVO ? '❌ View-once media is device pe nahi aaya (WhatsApp aksar linked devices ko view-once nahi bhejta).' : '❌ Ye view-once photo / video / voice nahi hai.')
      let buf
      try { buf = await downloadMediaMessage({ key: ctx.quoted.key, message: inner }, 'buffer', {}, { logger: waLogger, reuploadRequest: ctx.sock.updateMediaMessage }) } catch (e) { return ctx.reply('❌ Media download nahi hua (shayad purana ho gaya ya WhatsApp ne linked device ko nahi bheja).') }
      const me = jidNormalizedUser(ctx.sock.user.id)
      const cap = '👁️ View-once' + (m?.caption ? ': ' + m.caption : '')
      if (type === 'imageMessage') await ctx.sock.sendMessage(me, { image: buf, caption: cap })
      else if (type === 'videoMessage') await ctx.sock.sendMessage(me, { video: buf, caption: cap })
      else await ctx.sock.sendMessage(me, { audio: buf, mimetype: m?.mimetype || 'audio/ogg; codecs=opus', ptt: !!m?.ptt })
      if (ctx.jid !== me) await ctx.react('✅')
    }
  },
  {
    name: 'safemode', alias: ['antiban'], category: 'auto', owner: true, usage: 'on/off', desc: 'Safe mode (default ON): ~20 msg/min had + typing waqfa — ban ka khatra kam karta hai, khatam nahi',
    async run (ctx) {
      const v = onoff(ctx.args[0])
      const cur = ctx.settings.get('safeMode') !== false
      if (v === null) return ctx.reply(`🛡️ *Safe mode*: ${st(cur)}\nMax ~20 messages / minute, text se pehle chhota sa waqfa, koi bulk send nahi.\n⚠️ Ye ban ka khatra KAM karta hai, khatam nahi. Asli anti-ban jaisi koi cheez nahi hoti.\nUse: ${ctx.prefix}safemode on / off`)
      ctx.settings.set('safeMode', v)
      await ctx.reply(`✅ Safe mode ${v ? 'ON' : 'OFF ⚠️ (ban ka khatra zyada)'}`)
    }
  },
  {
    name: 'update', alias: ['autoupdate'], category: 'owner', superOwner: true, desc: 'Bot ka code latest hai? Purana ho to restart karke naya code',
    async run (ctx) {
      if (!ctx.senderIds.some(j => config.ownerNumbers.includes(String(j).split('@')[0].split(':')[0].replace(/\D/g, '')))) return ctx.reply('❌ Ye sirf AQDAS MD ke owner ke liye hai.')
      if (!GH_ON) return ctx.reply('ℹ️ Update sirf GitHub pe chalne wale bot mein.')
      const cur = String(process.env.GITHUB_SHA || '')
      const r = await gh('GET', '/commits/main')
      const head = r.j?.sha
      if (!head) return ctx.reply('⚠️ GitHub se latest code nahi mila, baad mein try karo.')
      const d = s => new Date(s).toLocaleString('en-GB', { timeZone: process.env.TZ || 'Asia/Karachi', hour12: true })
      let t = `🔄 *Update check*\nChal raha: ${cur.slice(0, 7) || '?'}\nLatest:   ${head.slice(0, 7)} (${d(r.j.commit?.committer?.date)})`
      if (head === cur) return ctx.reply(t + '\n\n✅ Bot already latest hai.')
      await ctx.reply(t + '\n\n⏳ Naya code hai — bot restart ho raha hai (sessions save), 2-5 min mein wapas.')
      const { restartBot } = await import('../lib/restart.js')
      await restartBot('update')
    }
  },
  {
    name: 'pair', alias: ['getcode', 'paircode'], category: 'owner', owner: true, usage: '<number>', desc: 'Owner: kisi number ka pairing code yahin chat mein (panel jaisa, 10 slots)',
    async run (ctx) {
      const boss = ctx.senderIds.some(j => config.ownerNumbers.includes(String(j).split('@')[0].split(':')[0].replace(/\D/g, '')))
      if (!boss) return ctx.reply('❌ Ye sirf AQDAS MD ke owner ke liye hai.')
      const { cleanNumber } = await import('../lib/web.js')
      const n = cleanNumber(ctx.text)
      if (n.length < 10 || n.length > 15 || (n.startsWith('92') && n.length !== 12)) return ctx.reply(`Use: ${ctx.prefix}pair 03001234567 (ya 923001234567)`)
      const m = n.slice(0, 4) + '…' + n.slice(-4)
      const manager = await import('../lib/sessions.js')
      await ctx.reply(`⏳ ${m} ka code aa raha hai... (10-20 sec)`)
      let r
      try { r = await manager.pairGuest(n) } catch (e) {
        const msg = e.wa?.code === '429' ? 'WhatsApp ne limit lagayi hai (is number pe bohat codes). 30-40 min baad try karo.' : e.message
        return ctx.reply('❌ ' + msg)
      }
      await ctx.reply(`🔑 *${r.code}*`)
      await ctx.reply(`📱 *${m}* ke phone pe:\nLinked devices → Link a device → *Link with phone number instead* → upar wala code daalo\n⏱️ 60 sec ke andar`)
      const t0 = Date.now()
      const tick = async () => {
        const s = manager.pairStatus(r.token).state
        if (s === 'connected') return ctx.reply(`✅ ${m} connected`)
        const age = Date.now() - t0
        if (['expired', 'logged_out', 'unknown'].includes(s) || (s === 'pairing' && age > 75000) || age > 180000) return ctx.reply(`⌛ ${m}: code purana ho gaya, dobara ${ctx.prefix}pair ${n}`)
        setTimeout(() => tick().catch(() => {}), 4000)
      }
      setTimeout(() => tick().catch(() => {}), 4000)
    }
  }
]
