import { tts } from '../lib/tts.js'
import { toVoiceNote } from '../lib/media.js'

const LANGS = ['ur', 'en', 'hi', 'ar', 'pa', 'tr', 'fr', 'es', 'de', 'ru', 'zh', 'ja', 'ko', 'id', 'bn', 'fa']

export default [
  {
    name: 'tts', alias: ['say', 'bol'], category: 'tools', usage: '[ur/en] <text>', desc: 'Text ko awaz (voice note) mein badlo',
    async run (ctx) {
      let lang = 'ur', text = ctx.text
      if (LANGS.includes((ctx.args[0] || '').toLowerCase())) { lang = ctx.args[0].toLowerCase(); text = ctx.args.slice(1).join(' ') }
      if (!text) return ctx.reply(`Use: ${ctx.prefix}tts Assalam o alaikum dosto\nEnglish: ${ctx.prefix}tts en Hello friends`)
      const mp3 = await tts(text, lang)
      let audio = mp3, mimetype = 'audio/mpeg', ptt = false
      try { audio = await toVoiceNote(mp3); mimetype = 'audio/ogg; codecs=opus'; ptt = true } catch {}
      await ctx.reply({ audio, mimetype, ptt })
    }
  },
  {
    name: 'jid', category: 'tools', desc: 'Is chat ki ID',
    async run (ctx) { await ctx.reply(`🆔 Chat: ${ctx.jid}\n👤 You: ${ctx.sender}`) }
  },
  {
    name: 'calc', alias: ['calculate'], category: 'tools', usage: '<2+2*5>', desc: 'Calculator',
    async run (ctx) {
      const e = ctx.text.replace(/[x×]/g, '*').replace(/÷/g, '/')
      if (!e || !/^[0-9+\-*/().%\s]+$/.test(e)) return ctx.reply(`Use: ${ctx.prefix}calc 25*4+10`)
      // eslint-disable-next-line no-new-func
      const r = Function(`"use strict";return (${e})`)()
      await ctx.reply(`🧮 ${e} = *${r}*`)
    }
  }
]
