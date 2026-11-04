import { tts } from '../lib/tts.js'
import { toVoiceNote, stickerToImage } from '../lib/media.js'
import { enhanceImage } from '../lib/assets.js'

const LANGS = ['ur', 'en', 'hi', 'ar', 'pa', 'tr', 'fr', 'es', 'de', 'ru', 'zh', 'ja', 'ko', 'id', 'bn', 'fa']

export default [
  {
    name: 'enhance', alias: ['hd', 'remini', 'upscale'], category: 'tools', usage: '(photo pe reply) [doc]', desc: 'Photo HD karo (2x bari + sharp + saaf)',
    async run (ctx) {
      const t = ctx.targetType
      if (!['imageMessage', 'stickerMessage', 'documentMessage'].includes(t)) return ctx.reply(`📸 Kisi photo pe reply karo *${ctx.prefix}enhance*\nFull quality file chahiye: *${ctx.prefix}enhance doc*`)
      await ctx.react('⏳')
      let buf = await ctx.download()
      if (!buf) return ctx.reply('❌ Photo download nahi hui, dobara bhejo.')
      if (t === 'stickerMessage') buf = await stickerToImage(buf)
      let out
      try { out = await enhanceImage(buf) } catch (e) { return ctx.reply('❌ Ye photo HD nahi ho saki (shayad photo nahi hai).') }
      await ctx.react('✅')
      if ((ctx.args[0] || '').toLowerCase() === 'doc') return ctx.reply({ document: out, mimetype: 'image/jpeg', fileName: 'AQDAS-MD-HD.jpg', caption: '✨ HD photo (full quality)' })
      return ctx.reply({ image: out, caption: `✨ *HD ho gayi* — ${ctx.prefix}enhance doc se full quality file` })
    }
  },
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
