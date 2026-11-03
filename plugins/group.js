import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { num, participantIds } from '../lib/utils.js'

// target: mention / reply / number
function targets (ctx) {
  let t = [...(ctx.mentioned || [])]
  if (!t.length && ctx.quoted?.key?.participant) t = [ctx.quoted.key.participant]
  if (!t.length && ctx.args[0]) {
    const n = ctx.args[0].replace(/[^0-9]/g, '')
    if (n.length >= 10) {
      const jid = n + '@s.whatsapp.net'
      const p = ctx.meta?.participants?.find(x => participantIds(x).includes(jid))
      t = [p ? p.id : jid]
    }
  }
  return t.map(j => jidNormalizedUser(j))
}
const G = { category: 'group', group: true }
const ADMIN = { ...G, admin: true }
const BOT_ADMIN = { ...ADMIN, botAdmin: true }

function memberAction (name, action, okText, alias = []) {
  return {
    ...BOT_ADMIN, name, alias, usage: '@user', desc: `Member ko ${okText} (admin only)`,
    async run (ctx) {
      const t = targets(ctx)
      if (!t.length) return ctx.reply(`Kis ko? Tag karo ya reply karo: ${ctx.prefix}${name} @user`)
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, t, action)
      const done = res.filter(r => String(r.status) === '200').map(r => r.jid || r.id).filter(Boolean)
      await ctx.reply({ text: `✅ ${okText}: ${(done.length ? done : t).map(j => '@' + num(j)).join(' ')}`, mentions: done.length ? done : t })
    }
  }
}

const onoff = a => /^(on|enable|1)$/i.test(a || '') ? true : /^(off|disable|0)$/i.test(a || '') ? false : null

export default [
  {
    ...ADMIN, name: 'tagall', alias: ['everyone', 'all'], usage: '[msg]', desc: 'Sab members ko tag karo',
    async run (ctx) {
      const ps = ctx.meta.participants
      let t = `📢 *${ctx.meta.subject}*\n${ctx.text ? '💬 ' + ctx.text + '\n' : ''}\n`
      for (const p of ps) t += `➤ @${num(p.id)}\n`
      await ctx.reply({ text: t + `\n_Total: ${ps.length}_`, mentions: ps.map(p => p.id) })
    }
  },
  {
    ...ADMIN, name: 'hidetag', alias: ['htag'], usage: '<msg>', desc: 'Chupke se sab ko tag (sirf message dikhega)',
    async run (ctx) {
      const text = ctx.text || (ctx.quoted ? (ctx.quoted.message.conversation || ctx.quoted.message.extendedTextMessage?.text || '📢') : '📢')
      await ctx.sock.sendMessage(ctx.jid, { text, mentions: ctx.meta.participants.map(p => p.id) })
    }
  },
  memberAction('kick', 'remove', 'Remove kar diya', ['remove']),
  memberAction('promote', 'promote', 'Admin bana diya'),
  memberAction('demote', 'demote', 'Admin se hata diya'),
  {
    ...G, name: 'groupinfo', alias: ['ginfo', 'gcinfo'], desc: 'Group ki info',
    async run (ctx) {
      const m = ctx.meta
      const admins = m.participants.filter(p => p.admin)
      let pp = null; try { pp = await ctx.sock.profilePictureUrl(ctx.jid, 'image') } catch {}
      const text = `*👥 GROUP INFO*\n\n📛 Name: ${m.subject}\n🆔 ${m.id}\n👤 Members: ${m.participants.length}\n🛡️ Admins: ${admins.length}\n📅 Bana: ${m.creation ? new Date(m.creation * 1000).toLocaleDateString('en-GB') : '-'}\n🔒 Sirf admin message: ${m.announce ? 'Haan' : 'Nahi'}\n\n📝 ${m.desc || '(no description)'}`
      await ctx.reply(pp ? { image: { url: pp }, caption: text } : text)
    }
  },
  {
    ...BOT_ADMIN, name: 'close', alias: ['mute', 'lock'], desc: 'Group band (sirf admin message karein)',
    async run (ctx) { await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement'); await ctx.reply('🔒 Group close: ab sirf admins message kar saktay hain') }
  },
  {
    ...BOT_ADMIN, name: 'open', alias: ['unmute', 'unlock'], desc: 'Group khol do (sab message karein)',
    async run (ctx) { await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement'); await ctx.reply('🔓 Group open: ab sab message kar saktay hain') }
  },
  {
    ...BOT_ADMIN, name: 'link', alias: ['grouplink', 'invite'], desc: 'Group ka invite link',
    async run (ctx) { const c = await ctx.sock.groupInviteCode(ctx.jid); await ctx.reply(`🔗 https://chat.whatsapp.com/${c}`) }
  },
  {
    ...ADMIN, name: 'welcome', usage: 'on/off', desc: 'Naye member ko welcome message',
    async run (ctx) {
      const v = onoff(ctx.args[0])
      if (v === null) return ctx.reply(`Welcome abhi: ${ctx.settings.group(ctx.jid).welcome ? 'ON' : 'OFF'}\nUse: ${ctx.prefix}welcome on/off`)
      ctx.settings.setGroup(ctx.jid, 'welcome', v); await ctx.reply(`✅ Welcome ${v ? 'ON' : 'OFF'}`)
    }
  },
  {
    ...ADMIN, name: 'goodbye', alias: ['bye'], usage: 'on/off', desc: 'Member jaye to goodbye message',
    async run (ctx) {
      const v = onoff(ctx.args[0])
      if (v === null) return ctx.reply(`Goodbye abhi: ${ctx.settings.group(ctx.jid).goodbye ? 'ON' : 'OFF'}\nUse: ${ctx.prefix}goodbye on/off`)
      ctx.settings.setGroup(ctx.jid, 'goodbye', v); await ctx.reply(`✅ Goodbye ${v ? 'ON' : 'OFF'}`)
    }
  },
  {
    ...ADMIN, name: 'setwelcome', usage: '<text>', desc: 'Apna welcome text (@user @group @count @desc)',
    async run (ctx) {
      if (!ctx.text) return ctx.reply(`Use: ${ctx.prefix}setwelcome Welcome @user to @group 🎉\n(reset: ${ctx.prefix}setwelcome reset)`)
      ctx.settings.setGroup(ctx.jid, 'welcomeText', ctx.text === 'reset' ? '' : ctx.text); await ctx.reply('✅ Welcome text save')
    }
  },
  {
    ...ADMIN, name: 'setgoodbye', usage: '<text>', desc: 'Apna goodbye text (@user @group)',
    async run (ctx) {
      if (!ctx.text) return ctx.reply(`Use: ${ctx.prefix}setgoodbye Bye @user 👋`)
      ctx.settings.setGroup(ctx.jid, 'goodbyeText', ctx.text === 'reset' ? '' : ctx.text); await ctx.reply('✅ Goodbye text save')
    }
  },
  {
    ...ADMIN, name: 'antilink', usage: 'warn/kick/off', desc: 'Link bhejne walon ko warning (3 pe kick) ya seedha kick',
    async run (ctx) {
      const v = (ctx.args[0] || '').toLowerCase()
      const map = { on: 'warn', warn: 'warn', kick: 'kick', off: 'off' }
      if (!map[v]) return ctx.reply(`Antilink abhi: *${ctx.settings.group(ctx.jid).antilink}*\nUse: ${ctx.prefix}antilink warn / kick / off\n(bot ka admin hona zaroori hai)`)
      ctx.settings.setGroup(ctx.jid, 'antilink', map[v])
      await ctx.reply(`✅ Antilink: *${map[v]}*${ctx.isBotAdmin ? '' : '\n⚠️ Bot admin nahi hai, pehle admin banao'}`)
    }
  }
]
