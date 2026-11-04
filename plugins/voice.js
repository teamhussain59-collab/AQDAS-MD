// Voice changer: voice note / audio / video pe reply karke .bass .deep .chipmunk .robot ...
import { VOICES, changeVoice } from '../lib/voice.js'
import { heavy, quotedText } from '../lib/limit.js'

const AUDIO = ['audioMessage', 'videoMessage', 'documentMessage']

async function voice (ctx, style) {
  if (!AUDIO.includes(ctx.targetType)) return false
  await ctx.react('🎙️')
  try {
    const buf = await ctx.download()
    const ogg = await heavy(() => changeVoice(buf, style))
    await ctx.reply({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true })
    await ctx.react('✅')
  } catch (e) { await ctx.react('❌'); await ctx.reply('⚠️ Voice change nahi hui: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 150)) }
  return true
}

export const reverseText = s => [...String(s)].reverse().join('')

export default Object.entries(VOICES).map(([name, v]) => ({
  name, alias: v.alias || [], category: 'voice', usage: name === 'reverse' ? '(voice pe reply) / <text>' : '(voice pe reply)', desc: 'Voice changer: ' + v.desc,
  async run (ctx) {
    if (await voice(ctx, name)) return
    if (name === 'reverse') {
      const t = ctx.text || quotedText(ctx)
      if (t) return ctx.reply('🔁 ' + reverseText(t))
      return ctx.reply(`🔁 Voice note pe reply karo *${ctx.prefix}reverse* (ulti awaz), ya: ${ctx.prefix}reverse AQDAS MD (ulta text)`)
    }
    await ctx.reply(`🎙️ Kisi voice note / audio pe reply karke likho *${ctx.prefix}${name}*\nSab effects: ${ctx.prefix}voicefx`)
  }
})).concat([{
  name: 'voicefx', alias: ['voicechanger', 'vfx', 'voicemenu'], category: 'voice', desc: 'Sab voice changer effects ki list',
  async run (ctx) {
    let t = '🎙️ *VOICE CHANGER*\nVoice note pe reply karke command likho:\n\n'
    for (const [n, v] of Object.entries(VOICES)) t += `➤ ${ctx.prefix}${n}${v.alias?.length ? ' (' + v.alias.map(a => ctx.prefix + a).join(', ') + ')' : ''} — ${v.desc}\n`
    await ctx.reply(t + '\n> AQDAS MD')
  }
}])
