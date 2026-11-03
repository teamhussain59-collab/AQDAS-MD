import * as api from '../lib/apis.js'
import { getBuffer } from '../lib/http.js'
import { QUOTES, JOKES } from './fun.js'
import { pick } from '../lib/utils.js'

const need = (ctx, usage) => { if (!ctx.text) { ctx.reply(`Use: ${ctx.prefix}${ctx.command} ${usage}`); return false } return true }
const nf = ctx => ctx.reply('❌ Kuch nahi mila. Spelling check karo.')

export default [
  {
    name: 'weather', alias: ['mosam', 'wether'], category: 'tools', usage: '<city>', desc: 'Mosam ka haal (wttr.in)',
    async run (ctx) {
      if (!need(ctx, 'Lahore')) return
      const w = await api.weather(ctx.text); if (!w) return nf(ctx)
      await ctx.reply(`🌦️ *${w.place}*\n\n🌡️ ${w.temp}°C (feels ${w.feels}°C)\n☁️ ${w.desc}\n💧 Humidity: ${w.humidity}%\n🌬️ Wind: ${w.wind} km/h${w.today ? `\n📈 Aaj: ${w.today.min}° – ${w.today.max}°C` : ''}`)
    }
  },
  {
    name: 'lyrics', alias: ['lyric'], category: 'tools', usage: '<artist - song>', desc: 'Song ke lyrics (lrclib)',
    async run (ctx) {
      if (!need(ctx, 'Imagine Dragons - Believer')) return
      const l = await api.lyrics(ctx.text); if (!l) return nf(ctx)
      await ctx.reply(`🎤 *${l.title}* — ${l.artist}\n\n${l.lyrics.slice(0, 3500)}${l.lyrics.length > 3500 ? '\n...' : ''}`)
    }
  },
  {
    name: 'wiki', alias: ['wikipedia'], category: 'tools', usage: '<topic>', desc: 'Wikipedia summary (.wiki ur <topic> Urdu)',
    async run (ctx) {
      let lang = 'en', q = ctx.text
      if (/^(ur|en|hi|ar)$/i.test(ctx.args[0] || '') && ctx.args.length > 1) { lang = ctx.args[0].toLowerCase(); q = ctx.args.slice(1).join(' ') }
      if (!need(ctx, 'Allama Iqbal')) return
      const w = await api.wiki(q, lang); if (!w) return nf(ctx)
      const text = `📚 *${w.title}*\n\n${w.extract}\n\n🔗 ${w.url || ''}`
      if (w.image) { try { return await ctx.reply({ image: await getBuffer(w.image), caption: text }) } catch {} }
      await ctx.reply(text)
    }
  },
  {
    name: 'translate', alias: ['tr', 'tarjuma'], category: 'tools', usage: '<lang> <text>', desc: 'Translate (en, ur, ar, hi...)',
    async run (ctx) {
      let to = 'en', text = ctx.text
      if (/^[a-z]{2}(-[A-Z]{2})?$/.test(ctx.args[0] || '') && ctx.args.length > 1) { to = ctx.args[0]; text = ctx.args.slice(1).join(' ') }
      if (!text && ctx.quoted) text = ctx.quoted.message?.conversation || ctx.quoted.message?.extendedTextMessage?.text || ''
      if (!text) return ctx.reply(`Use: ${ctx.prefix}tr ur How are you?\n(ya kisi message pe reply: ${ctx.prefix}tr en)`)
      const t = await api.translate(text, to); if (!t) return nf(ctx)
      await ctx.reply(`🌐 *${t.from || 'auto'} ➜ ${to}*\n\n${t.text}`)
    }
  },
  {
    name: 'define', alias: ['dict', 'meaning'], category: 'tools', usage: '<english word>', desc: 'English dictionary',
    async run (ctx) {
      if (!need(ctx, 'hacker')) return
      const d = await api.define(ctx.args[0]); if (!d) return nf(ctx)
      await ctx.reply(`📖 *${d.word}* ${d.phonetic}\n\n` + d.meanings.map((m, i) => `${i + 1}. _${m.pos}_: ${m.def}${m.ex ? `\n   e.g. "${m.ex}"` : ''}`).join('\n'))
    }
  },
  {
    name: 'currency', alias: ['convert', 'rate'], category: 'tools', usage: '<amount> <from> <to>', desc: 'Currency rate (100 usd pkr)',
    async run (ctx) {
      const [a, f, t] = ctx.args
      const amount = parseFloat(a)
      if (!amount || !f || !t) return ctx.reply(`Use: ${ctx.prefix}currency 100 usd pkr`)
      const c = await api.currency(amount, f, t); if (!c) return ctx.reply('❌ Currency code ghalat hai (jaise USD, PKR, SAR, AED, EUR)')
      await ctx.reply(`💱 ${c.amount} ${c.from} = *${c.result.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c.to}*\n📊 Rate: 1 ${c.from} = ${c.rate} ${c.to}\n🕒 ${c.updated || ''}`)
    }
  },
  {
    name: 'github', alias: ['gh', 'gitstalk'], category: 'tools', usage: '<username>', desc: 'GitHub profile info',
    async run (ctx) {
      if (!need(ctx, 'torvalds')) return
      const g = await api.github(ctx.args[0]); if (!g) return nf(ctx)
      const text = `🐙 *${g.name || g.login}* (@${g.login})\n${g.bio ? '📝 ' + g.bio + '\n' : ''}${g.location ? '📍 ' + g.location + '\n' : ''}📦 Repos: ${g.repos}\n👥 Followers: ${g.followers} | Following: ${g.following}\n📅 Joined: ${g.created?.slice(0, 10)}\n🔗 ${g.url}`
      try { await ctx.reply({ image: await getBuffer(g.avatar), caption: text }) } catch { await ctx.reply(text) }
    }
  },
  {
    name: 'img', alias: ['image', 'pic'], category: 'tools', usage: '<search>', desc: 'Image search (Openverse/Wikimedia)',
    async run (ctx) {
      if (!need(ctx, 'mountains')) return
      const list = await api.images(ctx.text); if (!list.length) return nf(ctx)
      for (const it of list.slice(0, 5)) {
        try { return await ctx.reply({ image: await getBuffer(it.url), caption: `🖼️ ${ctx.text}\n${it.source || ''}` }) } catch {}
      }
      await ctx.reply('❌ Image download nahi hui, dobara try karo.')
    }
  },
  {
    name: 'jokeapi', alias: ['ejoke'], category: 'fun', desc: 'English joke (live API)',
    async run (ctx) { let j = null; try { j = await api.joke() } catch {} await ctx.reply(`😂 ${j || pick(JOKES)}`) }
  },
  {
    name: 'zenquote', alias: ['iquote'], category: 'fun', desc: 'Famous quote (live API)',
    async run (ctx) { let q = null; try { q = await api.quote() } catch {} await ctx.reply(q ? `💭 _"${q.text}"_\n— *${q.author}*` : `💭 _${pick(QUOTES)}_`) }
  },
  {
    name: 'fact', alias: ['facts'], category: 'fun', desc: 'Random fact',
    async run (ctx) { const f = await api.fact(); await ctx.reply(f ? `🧠 *Did you know?*\n${f}` : '❌ Abhi fact nahi mila') }
  },
  {
    name: 'meme', category: 'fun', desc: 'Random meme',
    async run (ctx) {
      const m = await api.meme(); if (!m) return ctx.reply('❌ Meme nahi mila, dobara try karo')
      await ctx.reply({ image: await getBuffer(m.url), caption: `😂 ${m.title}` })
    }
  },
  {
    name: 'namaz', alias: ['prayer', 'salah'], category: 'tools', usage: '<city>', desc: 'Namaz timings (Pakistan default)',
    async run (ctx) {
      if (!need(ctx, 'Karachi')) return
      const [city, country] = ctx.text.split(',').map(s => s.trim())
      const p = await api.prayer(city, country || 'Pakistan'); if (!p) return nf(ctx)
      const t = p.timings
      await ctx.reply(`🕌 *Namaz Timings — ${city}*\n📅 ${p.date} | ${p.hijri}\n\n🌅 Fajr: ${t.Fajr}\n☀️ Sunrise: ${t.Sunrise}\n🕛 Zuhr: ${t.Dhuhr}\n🌤️ Asr: ${t.Asr}\n🌇 Maghrib: ${t.Maghrib}\n🌙 Isha: ${t.Isha}`)
    }
  },
  {
    name: 'country', alias: ['mulk'], category: 'tools', usage: '<country>', desc: 'Country info',
    async run (ctx) {
      if (!need(ctx, 'Pakistan')) return
      const c = await api.country(ctx.text); if (!c) return nf(ctx)
      await ctx.reply(`${c.flag} *${c.name}* (${c.iso2})\n\n🏛️ Capital: ${c.capital}\n👥 Population: ${c.population || '-'}\n💰 Currency: ${c.currency}\n📞 Dial code: ${c.code}`)
    }
  },
  {
    name: 'short', alias: ['shorturl', 'tinyurl'], category: 'tools', usage: '<link>', desc: 'Link chhota karo',
    async run (ctx) {
      if (!/^https?:\/\//.test(ctx.text)) return ctx.reply(`Use: ${ctx.prefix}short https://example.com/bohat/lamba/link`)
      const s = await api.shorten(ctx.text); await ctx.reply(s ? `🔗 ${s}` : '❌ Link chhota nahi hua')
    }
  },
  {
    name: 'qr', alias: ['qrcode'], category: 'tools', usage: '<text/link>', desc: 'QR code banao',
    async run (ctx) {
      if (!need(ctx, 'https://wa.me/923001234567')) return
      await ctx.reply({ image: await getBuffer(api.qrUrl(ctx.text)), caption: '✅ QR code — AQDAS MD' })
    }
  }
]
