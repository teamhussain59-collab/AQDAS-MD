import { currentSid } from '../lib/ctx.js'
import fs from 'fs'
import config from '../config.js'
import { ORIGINAL_DP, trimTo30, saveSong, resetSong, saveDp, resetDp, toMenuVideo, saveMenuVideo, saveMenuImage, resetMenu } from '../lib/assets.js'
import { download, ytdlpAvailable } from '../lib/download.js'
import { splitEmojis } from '../lib/chgroup.js'

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
  {
    name: 'autostatus', alias: ['autoview'], category: 'auto', owner: true, usage: 'on/off', desc: 'Status auto view + react (foran seen, 1-3 sec baad react, max 120/ghanta)',
    async run (ctx) {
      const v = onoff(ctx.args[0])
      const s = ctx.settings.load()
      if (v === null) return ctx.reply(`*Auto Status (view + react)* abhi: ${s.autoStatusView && s.autoStatusReact ? 'ON ✅' : 'OFF ❌'}\nEmojis: ${s.statusEmojis.join(' ')}\nUse: ${ctx.prefix}autostatus on / off\nEmojis badlo: ${ctx.prefix}statusemoji 😊😇🙂`)
      s.autoStatusView = v; s.autoStatusReact = v; ctx.settings.save()
      await ctx.reply(`✅ *Auto Status* ${v ? 'ON — status foran seen + 1-3 sec baad react (max 120/ghanta)' : 'OFF'}`)
    }
  },
  toggle('statusview', 'autoStatusView', 'Auto Status View (sirf dekhna)'),
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
    name: 'statusemoji', category: 'auto', owner: true, usage: '😊😇🙂', desc: 'Status react ke emojis',
    async run (ctx) {
      const list = splitEmojis(ctx.text)
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
    name: 'mode', category: 'owner', owner: true, usage: 'public/private [all]', desc: 'Public = sab use karein, Private = sirf owner (is number pe). "all" = sab linked numbers pe',
    async run (ctx) {
      const v = (ctx.args[0] || '').toLowerCase()
      const all = (ctx.args[1] || '').toLowerCase() === 'all'
      const me = String(ctx.sock?.user?.id || '').split(':')[0].split('@')[0]
      const tag = me ? ' (…' + me.slice(-4) + ')' : ''
      let others = []
      try { others = (await import('../lib/sessions.js')).allSids().filter(x => x.sid !== currentSid()) } catch {}
      if (!['public', 'private'].includes(v)) {
        const rest = others.map(x => `…${String(x.number || '').slice(-4) || x.sid}: ${ctx.settings.load(x.sid).mode}`).join('\n')
        return ctx.reply(`Mode abhi${tag}: ${ctx.settings.get('mode')}${rest ? '\n\nBaqi numbers:\n' + rest : ''}\n\nUse: ${ctx.prefix}mode public / private\nSab numbers pe: ${ctx.prefix}mode private all`)
      }
      ctx.settings.set('mode', v)
      if (all) {
        if (!ctx.superOwner) return ctx.reply(`✅ Mode${tag}: *${v}*\n❌ "all" sirf AQDAS MD ke asli owner ke liye hai.`)
        for (const x of others) { const st = ctx.settings.load(x.sid); st.mode = v; ctx.settings.save(x.sid) }
        return ctx.reply(`✅ Mode: *${v}* — sab ${others.length + 1} numbers pe`)
      }
      const diff = others.filter(x => ctx.settings.load(x.sid).mode !== v)
      const note = diff.length ? `\n\nℹ️ Ye sirf is number pe laga. ${diff.map(x => '…' + String(x.number || '').slice(-4)).join(', ')} abhi *${v === 'private' ? 'public' : 'private'}* hai.${ctx.superOwner ? ` Sab pe: ${ctx.prefix}mode ${v} all` : ''}` : ''
      await ctx.reply(`✅ Mode${tag}: *${v}*${v === 'private' ? '\nAb is number pe sirf owner ko jawab milega.' : ''}${note}`)
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
      if (ctx.args[0] === 'reset') { await resetDp(); buf = fs.readFileSync(ORIGINAL_DP) } else if (ctx.targetType === 'imageMessage') {
        buf = await ctx.download(); await saveDp(buf)
      } else if (ctx.args[0] === 'default') buf = fs.readFileSync(ORIGINAL_DP)
      else return ctx.reply(`📸 Kisi photo pe reply karo *${ctx.prefix}setdp*\nOriginal AQDAS DP wapas: *${ctx.prefix}setdp reset*`)
      await ctx.sock.updateProfilePicture(ctx.sock.user.id.split(':')[0] + '@s.whatsapp.net', buf)
      await ctx.reply('✅ Bot ka DP + menu photo update ho gaya')
    }
  },
  {
    name: 'setmenu', alias: ['setmenuvideo', 'setmenupic'], category: 'owner', owner: true, usage: '(video/gif/photo pe reply) / reset / dp', desc: 'Menu ki video (motion) ya photo badlo',
    async run (ctx) {
      const a = (ctx.args[0] || '').toLowerCase()
      if (a === 'reset') { await resetMenu(); ctx.settings.set('menuDp', false); return ctx.reply('✅ Original AQDAS MD motion menu wapas lag gaya') }
      if (a === 'dp' || a === 'photo') { ctx.settings.set('menuDp', true); return ctx.reply(`✅ Ab menu pe DP photo aayegi. Motion wapas: *${ctx.prefix}setmenu reset*`) }
      const isGifDoc = ctx.targetType === 'documentMessage'
      if (ctx.targetType === 'videoMessage' || isGifDoc) {
        await ctx.react('⏳')
        const src = await ctx.download()
        let mp4
        try { mp4 = await toMenuVideo(src) } catch (e) { return ctx.reply('❌ Ye video convert nahi hui. Koi aur video/GIF try karo.') }
        await saveMenuVideo(mp4)
        ctx.settings.set('menuDp', false)
        await ctx.reply({ video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption: '✅ Naya menu motion save. Ab .menu pe yahi chalega.' })
        return
      }
      if (ctx.targetType === 'imageMessage') {
        const jpg = await ctx.download()
        await saveMenuImage(jpg)
        ctx.settings.set('menuDp', false)
        return ctx.reply('✅ Naya menu photo save. Ab .menu pe yahi aayegi.')
      }
      return ctx.reply(`🎬 Kisi video/GIF ya photo pe reply karo *${ctx.prefix}setmenu*\nOriginal motion wapas: *${ctx.prefix}setmenu reset*\nSirf DP photo: *${ctx.prefix}setmenu dp*`)
    }
  },
  {
    name: 'setsong', alias: ['setmenusong'], category: 'owner', owner: true, usage: '(audio pe reply) / naam / link / reset', desc: 'Menu ka song badlo (pehle 30 sec)',
    async run (ctx) {
      if (ctx.args[0] === 'reset') { await resetSong(); return ctx.reply((await import('../lib/assets.js')).panelSong() ? '✅ Is number ka apna song hata diya — ab panel wala menu song bajega' : '✅ Original AQDAS MD theme wapas lag gaya') }
      let src
      if (['audioMessage', 'videoMessage', 'documentMessage'].includes(ctx.targetType)) src = await ctx.download()
      else if (ctx.text) {
        if (!(await ytdlpAvailable())) return ctx.reply('⚠️ yt-dlp install nahi. Audio pe reply karke .setsong likho.')
        await ctx.reply('📥 Song dhoond raha hoon...')
        const r = await download(ctx.text, 'audio'); src = r.buffer; r.cleanup()
      } else return ctx.reply(`🎵 Kisi audio/voice note pe reply karo *${ctx.prefix}setsong*\nYa: *${ctx.prefix}setsong song ka naam / YouTube link*\nOriginal wapas: *${ctx.prefix}setsong reset*`)
      await ctx.react('⏳')
      const mp3 = await trimTo30(src)
      await saveSong(mp3)
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
