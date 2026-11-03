import fs from 'fs'
import os from 'os'
import config from '../config.js'
import { list } from '../lib/plugins.js'
import { runtime } from '../lib/utils.js'
import { dpPath, songPath } from '../lib/assets.js'

const ICON = { main: '🏠', owner: '👑', auto: '⚙️', group: '👥', sticker: '🖼️', ai: '🤖', download: '📥', fun: '😂', tools: '🛠️', other: '✨' }
const TITLE = { main: 'MAIN', owner: 'OWNER', auto: 'AUTO (ON/OFF)', group: 'GROUP', sticker: 'STICKER', ai: 'AI', download: 'DOWNLOAD', fun: 'FUN', tools: 'TOOLS', other: 'OTHER' }
const ORDER = ['main', 'ai', 'download', 'sticker', 'tools', 'fun', 'group', 'auto', 'owner', 'other']

export function menuText (ctx) {
  const p = ctx.settings.get('prefix')
  const on = v => (v ? 'ON ✅' : 'OFF ❌')
  const s = ctx.settings.load()
  let t = `╭━━━〔 *${config.botName}* 〕━━━⬣\n`
  t += `┃ 👑 Owner: ${config.ownerName}\n┃ 🔣 Prefix: [ ${p} ]\n┃ 🌐 Mode: ${s.mode}\n┃ ⏱️ Uptime: ${runtime(process.uptime())}\n┃ 📜 Commands: ${list.length}\n`
  t += `┃ ❤️ AutoReact: ${on(s.autoReact)} | 👀 Status: ${on(s.autoStatusView)}\n╰━━━━━━━━━━━━━━━━⬣\n`
  const cats = {}
  for (const c of list) (cats[c.category] = cats[c.category] || []).push(c)
  for (const cat of ORDER.filter(k => cats[k]).concat(Object.keys(cats).filter(k => !ORDER.includes(k)))) {
    t += `\n╭─〔 ${ICON[cat] || '✨'} *${TITLE[cat] || cat.toUpperCase()}* 〕\n`
    for (const c of cats[cat]) t += `│ ➤ ${p}${c.name}${c.usage ? ' ' + c.usage : ''}\n`
    t += '╰──────────⬣\n'
  }
  t += `\n_Kisi command ki detail: ${p}help <command>_\n> © ${config.botName} by ${config.ownerName}`
  return t
}

export default [
  {
    name: 'menu', alias: ['help', 'list', 'allmenu', 'cmd'], category: 'main', desc: 'Sab commands ki list',
    async run (ctx) {
      const p = ctx.settings.get('prefix')
      if (ctx.args[0]) {
        const { commands } = await import('../lib/plugins.js')
        const c = commands.get(ctx.args[0].replace(p, '').toLowerCase())
        if (!c) return ctx.reply('❌ Ye command nahi mili.')
        return ctx.reply(`*${p}${c.name}* ${c.usage || ''}\n${c.desc || ''}${c.alias?.length ? `\nAlias: ${c.alias.map(a => p + a).join(', ')}` : ''}${c.admin ? '\n(Admin only)' : ''}${c.owner ? '\n(Owner only)' : ''}`)
      }
      const text = menuText(ctx)
      if (fs.existsSync(dpPath())) await ctx.reply({ image: fs.readFileSync(dpPath()), caption: text })
      else await ctx.reply(text)
      if (ctx.settings.get('menuSong') && fs.existsSync(songPath())) {
        await ctx.reply({ audio: fs.readFileSync(songPath()), mimetype: 'audio/mpeg', ptt: false })
      }
    }
  },
  {
    name: 'ping', alias: ['speed'], category: 'main', desc: 'Bot ki speed check',
    async run (ctx) {
      const t = Date.now()
      const sent = await ctx.reply('🏓 Pinging...')
      const ms = Date.now() - t
      await ctx.sock.sendMessage(ctx.jid, { text: `🏓 *Pong!* ${ms} ms\n⚡ ${config.botName} zinda hai`, edit: sent.key })
    }
  },
  {
    name: 'alive', category: 'main', desc: 'Bot zinda hai? (DP + info)',
    async run (ctx) {
      const cap = `*${config.botName} is Alive* ⚡\n\n👑 ${config.ownerName}\n⏱️ Uptime: ${runtime(process.uptime())}\n💾 RAM: ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB / ${(os.totalmem() / 1073741824).toFixed(1)} GB\n🔣 Prefix: ${ctx.settings.get('prefix')}\n\nType *${ctx.settings.get('prefix')}menu*`
      if (fs.existsSync(dpPath())) await ctx.reply({ image: fs.readFileSync(dpPath()), caption: cap })
      else await ctx.reply(cap)
    }
  },
  {
    name: 'uptime', alias: ['runtime'], category: 'main', desc: 'Bot kab se chal raha hai',
    async run (ctx) { await ctx.reply(`⏱️ Uptime: *${runtime(process.uptime())}*`) }
  },
  {
    name: 'owner', alias: ['creator'], category: 'main', desc: 'Owner ka contact',
    async run (ctx) {
      const n = config.ownerNumbers[0]
      if (!n) return ctx.reply(`👑 Owner: ${config.ownerName}`)
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;waid=${n}:+${n}\nEND:VCARD`
      await ctx.reply({ contacts: { displayName: config.ownerName, contacts: [{ vcard }] } })
    }
  },
  {
    name: 'song', alias: ['bgm', 'theme'], category: 'main', desc: 'AQDAS MD ka theme song (30 sec)',
    async run (ctx) {
      if (!fs.existsSync(songPath())) return ctx.reply('❌ song file nahi mili')
      await ctx.reply({ audio: fs.readFileSync(songPath()), mimetype: 'audio/mpeg', ptt: false })
    }
  }
]
