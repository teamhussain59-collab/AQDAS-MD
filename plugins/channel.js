// WhatsApp Channel commands.
// .chreact: aam number -> sirf apne number se. OWNER_NUMBER -> is number + har opt-in (react group) number se (ek ek dafa, 3-10 sec gap).
// React group mein sirf woh numbers jo khud shamil hue (panel checkbox ya apne number se .chjoin).
import config from '../config.js'
import { num } from '../lib/utils.js'
import { LINK, channelJid, fanOut, reactOne, splitEmojis, getCfg, setCfg, isOptedIn, DEFAULT_EMOJIS } from '../lib/chgroup.js'
import { currentSid } from '../lib/ctx.js'

const isBoss = ctx => ctx.senderIds.map(num).some(n => config.ownerNumbers.includes(n))
const selfOnly = ctx => ctx.msg.key.fromMe
const manager = async () => import('../lib/sessions.js')

async function chreact (ctx, forceAll = false) {
  const m = LINK.exec(ctx.text || '')
  const emojis = splitEmojis(ctx.args.filter(a => !LINK.test(a)).join(' '))
  if (!m || !m[2] || !emojis.length) return ctx.reply(`Use: ${ctx.prefix}chreact https://whatsapp.com/channel/XXXX/123 ❤️🔥\n(post pe tap > Share > link copy — aakhir mein post number hota hai)`)
  const invite = m[1], post = m[2]
  const me = { sid: currentSid(), bot: ctx.bot }
  if (!isBoss(ctx) && !forceAll) {
    try {
      const r = await reactOne(me, invite, post, emojis[0])
      if (r === 'dup') return ctx.reply('ℹ️ Is number se is post pe pehle hi react ho chuka hai.')
      const ch = await channelJid(ctx.sock, invite)
      return ctx.reply(`✅ ${emojis[0]} react ho gaya${ch.name ? ' — ' + ch.name : ''} (post ${post})`)
    } catch (e) { return ctx.reply('❌ React nahi hua: ' + (e?.message || e)) }
  }
  if (!isBoss(ctx)) return ctx.reply('❌ Ye sirf AQDAS MD ke owner ke liye hai.')
  const bots = (await manager()).liveBots()
  const n = 1 + bots.filter(b => b.sid !== me.sid && isOptedIn(b.sid)).length
  await ctx.reply(`⏳ React shuru: ${n} number(s) (is number + react group). Har number ke beech 3-10 sec ka gap...`)
  const r = await fanOut({ bots, invite, post, emojis, first: me, gap: [3000, 10000] })
  if (r.busy) return ctx.reply('ℹ️ Is post pe react pehle se chal raha hai.')
  await ctx.reply(`✅ ${r.ok} numbers ne react kiya, ${r.skip} skip`)
}

export default [
  {
    name: 'chreact', alias: ['channelreact'], category: 'owner', owner: true, usage: '<channel post link> <emoji(s)>',
    desc: 'Channel post pe react. Owner (OWNER_NUMBER) bheje to react group ke sab numbers bhi ek ek dafa react karte hain',
    run: ctx => chreact(ctx)
  },
  {
    name: 'chreactall', category: 'owner', owner: true, usage: '<channel post link> <emoji(s)>', desc: 'Owner: react group ke sab numbers se react (.chreact jaisa)',
    run: ctx => chreact(ctx, true)
  },
  {
    name: 'chjoin', category: 'owner', owner: true, desc: 'Is number ko channel react group mein shamil karo (apne number se likho)',
    async run (ctx) {
      if (!selfOnly(ctx)) return ctx.reply(`❌ Ye apne hi number se likho (Message yourself mein ${ctx.prefix}chjoin).`)
      ctx.settings.set('chGroup', true)
      await ctx.reply('✅ Aap react group mein shamil ho gaye. Channel ke naye posts pe ye number ek dafa react karega.\nNikalna ho to ' + ctx.prefix + 'chleave')
    }
  },
  {
    name: 'chleave', category: 'owner', owner: true, desc: 'Channel react group se niklo',
    async run (ctx) {
      if (!selfOnly(ctx)) return ctx.reply(`❌ Ye apne hi number se likho (Message yourself mein ${ctx.prefix}chleave).`)
      ctx.settings.set('chGroup', false)
      await ctx.reply('✅ Aap react group se nikal gaye. Ab ye number khud react nahi karega.\nWapas: ' + ctx.prefix + 'chjoin')
    }
  },
  {
    name: 'chstatus', category: 'owner', owner: true, desc: 'React group: ye number shamil hai ya nahi + auto react',
    async run (ctx) {
      const cfg = await getCfg()
      let t = `📢 *Channel react group*\nYe number: ${ctx.settings.get('chGroup') ? 'shamil ✅' : 'shamil nahi ❌'}\nAuto react (naye post pe): ${cfg.auto !== false ? 'ON ✅' : 'OFF ❌'}\nEmojis: ${(cfg.emojis || DEFAULT_EMOJIS).join(' ')}`
      if (isBoss(ctx)) {
        const bots = (await manager()).liveBots()
        t += `\nConnected numbers: ${bots.length}, react group mein: ${bots.filter(b => isOptedIn(b.sid)).length}`
        if (cfg.last_post) t += `\nAakhri post jo dekha: #${cfg.last_post}`
      }
      await ctx.reply(t)
    }
  },
  {
    name: 'chcmd', category: 'owner', owner: true, usage: 'on/off', desc: 'Channel mein commands (bot wala number channel admin ho, channel mein .menu waghera post kare)',
    async run (ctx) {
      const a = (ctx.args[0] || '').toLowerCase()
      if (a === 'on' || a === 'off') { ctx.settings.set('channelCmds', a === 'on'); return ctx.reply(`✅ Channel commands ${a === 'on' ? 'ON' : 'OFF'}`) }
      await ctx.reply(`Channel commands: ${ctx.settings.get('channelCmds') === false ? 'OFF ❌' : 'ON ✅'}\nChannel mein (bot wale number se) .menu, .ai waghera post karo, bot wahin jawab dega.\n${ctx.prefix}chcmd on / off`)
    }
  },
  {
    name: 'chautoreact', alias: ['chauto'], category: 'owner', owner: true, usage: 'on/off | emojis 🥰🔥', desc: 'Owner: channel ke naye post pe react group ka auto react',
    async run (ctx) {
      if (!isBoss(ctx)) return ctx.reply('❌ Ye sirf AQDAS MD ke owner ke liye hai.')
      const a = (ctx.args[0] || '').toLowerCase()
      if (a === 'on' || a === 'off') { await setCfg({ auto: a === 'on' }); return ctx.reply(`✅ Channel auto react ${a === 'on' ? 'ON' : 'OFF'}`) }
      if (a === 'emojis' || a === 'emoji') {
        const e = splitEmojis(ctx.args.slice(1).join(' '))
        if (!e.length) return ctx.reply(`Use: ${ctx.prefix}chautoreact emojis 🥰🐣🤨❤️🔥`)
        await setCfg({ emojis: e }); return ctx.reply('✅ Auto react emojis: ' + e.join(' '))
      }
      const cfg = await getCfg()
      await ctx.reply(`Auto react: ${cfg.auto !== false ? 'ON ✅' : 'OFF ❌'}\nEmojis: ${(cfg.emojis || DEFAULT_EMOJIS).join(' ')}\n\n${ctx.prefix}chautoreact on / off\n${ctx.prefix}chautoreact emojis 🥰🔥`)
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
