import { findSurah, surahInfo, parseRange, getAyat, ayahAudio, format } from '../lib/quran.js'

export default [
  {
    name: 'quran', alias: ['ayat', 'surah'], category: 'islamic', usage: '<surah> [ayat] [audio]', desc: 'Quran: Arabic + Urdu tarjuma (+English). Misal: .quran yaseen 1-5 / .quran 1 / .quran 36 1 audio',
    async run (ctx) {
      const args = [...ctx.args]
      const audio = /^(audio|sound|tilawat|mp3)$/i.test(args[args.length - 1] || '') && args.pop()
      const noEn = /^(urdu|ur)$/i.test(args[args.length - 1] || '') && args.pop()
      let range = null
      if (args.length > 1 && /^\d+(\s*[-–:]\s*\d+)?$/.test(args[args.length - 1])) range = args.pop()
      const q = args.join(' ')
      if (!q) return ctx.reply(`📖 Use:\n${ctx.prefix}quran 1  (Surah Fatiha)\n${ctx.prefix}quran yaseen 1-5\n${ctx.prefix}quran rahman 13\n${ctx.prefix}quran 36 1 audio  (tilawat)`)
      const n = findSurah(q)
      if (!n) return ctx.reply('❌ Surah nahi mili. Number (1-114) ya naam likho, misal: yaseen, rahman, mulk, kahf')
      const info = surahInfo(n)
      const r = parseRange(range, info.ayahs)
      if (!r) return ctx.reply(`❌ Surah ${info.name} mein ${info.ayahs} ayat hain.`)
      const [from, to] = r
      if (audio) {
        const url = await ayahAudio(n, from)
        await ctx.reply({ audio: { url }, mimetype: 'audio/mpeg' })
        return ctx.reply(`🎧 Surah ${info.name} (${n}) — Ayat ${from} • Qari Mishary Alafasy`)
      }
      const ayat = await getAyat(n, from, to)
      await ctx.reply(format(info, from, to, ayat, !noEn))
    }
  }
]
