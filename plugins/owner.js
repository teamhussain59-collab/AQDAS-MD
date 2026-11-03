import fs from 'fs'
import config from '../config.js'
import { ORIGINAL_DP, trimTo30, saveSong, resetSong, saveDp, resetDp } from '../lib/assets.js'
import { download, ytdlpAvailable } from '../lib/download.js'

const onoff = (a) => { a = String(a || '').toLowerCase(); return a === 'on' || a === 'enable' || a === '1' ? true : a === 'off' || a === 'disable' || a === '0' ? false : null }

// ON/OFF wali commands ek hi tarah ki
function toggle (name, key, label, alias = []) {
  return {
    name, alias, category: 'auto', owner: true, usage: 'on/off', desc: `${label} ON/OFF`,
    async run (ctx) {
      const v = onoff(ctx.args[0])
      if (v === null) return ctx.reply(`*${label}* abhi: ${ctx.settings.get(key) ? 'ON ✅' : 'OFF ❌'}\nUse: ${ctx.prefix}${name} on / off`)
      ctx.settings.set(key, v)
      if (key === 'alwaysOnline') await ctx.sock.sendPresenceUpdate(v ? 'available' : 'unavailable').catch(() => {})
      await ctx.reply(`✅ *${label}* ${v ? 'ON' : 'OFF'} ho gaya`)
    }
  }
}

export default [
  toggle('autoreact', 'autoReact', 'Auto React', ['areact']),
  toggle('autoread', 'autoRead', 'Auto Read (blue tick)'),
  toggle('autostatus', 'autoStatusView', 'Auto Status View', ['statusview', 'autoview']),
  toggle('statusreact', 'autoStatusReact', 'Auto Status React', ['autostatusreact', 'autoreactstatus']),
  toggle('alwaysonline', 'alwaysOnline', 'Always Online', ['online']),
  toggle('autotyping', 'autoTyping', 'Typing... dikhana (commands pe)', ['typing']),
  toggle('menusong', 'menuSong', 'Menu ke sath song'),
  {
    name: 'setemoji', alias: ['reactemoji'], category: 'auto', owner: true, usage: '❤️,🔥,😂', desc: 'Auto-react ke emojis set karo',
    async run (ctx) {
      const list = ctx.text.split(/[,\s]+/).filter(Boolean)
      if (!list.length) return ctx.reply(`Abhi: ${ctx.settings.get('reactEmojis').join(' ')}\nUse: ${ctx.prefix}setemoji ❤️,🔥,😂`)
      ctx.settings.set('reactEmojis', list)
      await ctx.reply(`✅ Auto-react emojis: ${list.join(' ')}`)
    }
  },
  {
    name: 'statusemoji', category: 'auto', owner: true, usage: '💚,🔥', desc: 'Status react ke emojis',
    async run (ctx) {
      const list = ctx.text.split(/[,\s]+/).filter(Boolean)
      if (!list.length) return ctx.reply(`Abhi: ${ctx.settings.get('statusEmojis').join(' ')}`)
      ctx.settings.set('statusEmojis', list)
      await ctx.reply(`✅ Status emojis: ${list.join(' ')}`)
    }
  },
  {
    name: 'reactscope', category: 'auto', owner: true, usage: 'all/private/group', desc: 'Auto-react kahan: sab, sirf inbox, sirf groups',
    async run (ctx) {
      const v = (ctx.args[0] || '').toLowerCase()
      if (!['all', 'private', 'group'].includes(v)) return ctx.reply(`Abhi: ${ctx.settings.get('reactScope')}\nUse: ${ctx.prefix}reactscope all / private / group`)
      ctx.settings.set('reactScope', v)
      await ctx.reply(`✅ Auto-react scope: ${v}`)
    }
  },
  {
    name: 'mode', category: 'owner', owner: true, usage: 'public/private', desc: 'Public = sab use karein, Private = sirf owner',
    async run (ctx) {
      const v = (ctx.args[0] || '').toLowerCase()
      if (!['public', 'private'].includes(v)) return ctx.reply(`Mode abhi: ${ctx.settings.get('mode')}\nUse: ${ctx.prefix}mode public / private`)
      ctx.settings.set('mode', v)
      await ctx.reply(`✅ Mode: *${v}*`)
    }
  },
  {
    name: 'setprefix', category: 'owner', owner: true, usage: '<symbol>', desc: 'Prefix badlo (jaise . ! #)',
    async run (ctx) {
      const v = ctx.args[0]
      if (!v || v.length > 3) return ctx.reply(`Use: ${ctx.prefix}setprefix !`)
      ctx.settings.set('prefix', v)
      await ctx.reply(`✅ Naya prefix: *${v}*  (ab ${v}menu likho)`)
    }
  },
  {
    name: 'settings', alias: ['status', 'config'], category: 'owner', owner: true, desc: 'Sab ON/OFF settings dekho',
    async run (ctx) {
      const s = ctx.settings.load(); const o = v => (v ? '✅' : '❌')
      await ctx.reply(`*⚙️ ${config.botName} SETTINGS*\n\n${o(s.autoReact)} Auto React (${s.reactScope}) ${s.reactEmojis.join('')}\n${o(s.autoRead)} Auto Read\n${o(s.autoStatusView)} Auto Status View\n${o(s.autoStatusReact)} Auto Status React ${s.statusEmojis.join('')}\n${o(s.alwaysOnline)} Always Online\n${o(s.autoTyping)} Auto Typing\n${o(s.menuSong)} Menu Song\n\nMode: ${s.mode}\nPrefix: ${s.prefix}\nAI: ${config.openrouterKey ? '✅ key set (' + config.openrouterModel + ')' : '❌ OPENROUTER_API_KEY nahi'}`)
    }
  },
  {
    name: 'setdp', alias: ['setpp'], category: 'owner', owner: true, usage: '(photo pe reply) / reset', desc: 'Bot ka DP + menu photo badlo',
    async run (ctx) {
      let buf
      if (ctx.args[0] === 'reset') { resetDp(); buf = fs.readFileSync(ORIGINAL_DP) } else if (ctx.targetType === 'imageMessage') {
        buf = await ctx.download(); saveDp(buf)
      } else if (ctx.args[0] === 'default') buf = fs.readFileSync(ORIGINAL_DP)
      else return ctx.reply(`📸 Kisi photo pe reply karo *${ctx.prefix}setdp*\nOriginal AQDAS DP wapas: *${ctx.prefix}setdp reset*`)
      await ctx.sock.updateProfilePicture(ctx.sock.user.id.split(':')[0] + '@s.whatsapp.net', buf)
      await ctx.reply('✅ Bot ka DP + menu photo update ho gaya')
    }
  },
  {
    name: 'setsong', alias: ['setmenusong'], category: 'owner', owner: true, usage: '(audio pe reply) / naam / link / reset', desc: 'Menu ka song badlo (pehle 30 sec)',
    async run (ctx) {
      if (ctx.args[0] === 'reset') { resetSong(); return ctx.reply('✅ Original AQDAS MD theme wapas lag gaya') }
      let src
      if (['audioMessage', 'videoMessage', 'documentMessage'].includes(ctx.targetType)) src = await ctx.download()
      else if (ctx.text) {
        if (!(await ytdlpAvailable())) return ctx.reply('⚠️ yt-dlp install nahi. Audio pe reply karke .setsong likho.')
        await ctx.reply('📥 Song dhoond raha hoon...')
        const r = await download(ctx.text, 'audio'); src = r.buffer; r.cleanup()
      } else return ctx.reply(`🎵 Kisi audio/voice note pe reply karo *${ctx.prefix}setsong*\nYa: *${ctx.prefix}setsong song ka naam / YouTube link*\nOriginal wapas: *${ctx.prefix}setsong reset*`)
      await ctx.react('⏳')
      const mp3 = await trimTo30(src)
      saveSong(mp3)
      await ctx.reply({ audio: mp3, mimetype: 'audio/mpeg', ptt: false })
      await ctx.reply('✅ Naya menu song save (30 sec). Ab .menu pe yahi bajega.')
    }
  },
  {
    name: 'session', alias: ['sessionid'], category: 'owner', owner: true, desc: 'SESSION_ID (free host ke liye) apni chat mein',
    async run (ctx) {
      const s = ctx.bot.sessionString()
      if (!s) return ctx.reply('❌ Session nahi mila')
      const me = ctx.sock.user.id.split(':')[0] + '@s.whatsapp.net'
      await ctx.sock.sendMessage(me, { text: s })
      await ctx.sock.sendMessage(me, { text: '⚠️ Ye SESSION_ID kisi ko mat dena! Is se koi bhi tumhara bot number chala sakta hai. Sirf apne server ke SESSION_ID env mein paste karo.' })
      if (ctx.jid !== me) await ctx.reply('✅ SESSION_ID tumhari apni chat (Message yourself) mein bhej diya.')
    }
  },
  {
    name: 'restart', category: 'owner', owner: true, superOwner: true, desc: 'Bot restart',
    async run (ctx) { await ctx.reply('♻️ Restart ho raha hai...'); setTimeout(() => process.exit(0), 1000) }
  },
  {
    name: 'reload', category: 'owner', owner: true, superOwner: true, desc: 'Naye plugins load karo (restart ke baghair)',
    async run (ctx) { const { loadPlugins } = await import('../lib/plugins.js'); const l = await loadPlugins(true); await ctx.reply(`✅ ${l.length} commands reload`) }
  }
]
