// Fun animations — ek message bhej ke usi ko edit karte hain (WhatsApp edit), har edit ~0.7+ sec baad
let wait = ms => new Promise(r => setTimeout(r, ms))
export function _setWait (fn) { wait = fn }
const GAP = 750
const bar = p => { const n = Math.round(p / 10); return '▰'.repeat(n) + '▱'.repeat(10 - n) }
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const DUROOD = 'اللّٰهُمَّ صَلِّ عَلٰى مُحَمَّدٍ وَّعَلٰى اٰلِ مُحَمَّدٍ ﷺ'

async function animate (ctx, frames, gap = GAP) {
  const sent = await ctx.reply(frames[0])
  for (const f of frames.slice(1)) { await wait(gap); await ctx.sock.sendMessage(ctx.jid, { text: f, edit: sent.key }) }
  return sent
}

export const batteryFrames = () => {
  const steps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  return steps.map(p => `🔋 *Charging AQDAS MD...*\n[${bar(p)}] ${p}%${p === 100 ? ' ⚡' : ''}`)
}
export const batteryFinal = () => `╭─❍ *AQDAS MD* ❍─╮\n│ 🔋 [${bar(100)}] 100% ⚡\n│ ✅ Full charge!\n│\n│ آپ کی خدمت میں حاضر ہے 🤍\n╰─❍────────────❍─╯`
export const magicFrames = () => {
  const word = 'AQDAS MD'
  const out = []
  for (let i = 1; i <= word.length; i++) if (word[i - 1] !== ' ') out.push(`✨ ${word.slice(0, i)}▌`)
  out.push(`✨ ${word} ✨`)
  out.push(`╭─❍ ✨ *${word}* ✨ ❍─╮\n│\n│ ${DUROOD}\n│\n╰─❍────────────❍─╯`)
  return out
}

const fakeIp = () => `${rnd(300, 999)}.${rnd(256, 999)}.${rnd(0, 255)}.${rnd(1000, 9999)}` // jaan bujh ke ghalat (asli IP ho hi nahi sakti)
export const hackFrames = (name) => [
  `💻 *AQDAS HACK v9.99* (prank)\n🎯 Target: ${name}\n⏳ Shuru ho raha hai...`,
  `📡 Connecting to device... 12%\n[${bar(12)}]`,
  `🛡️ Bypassing firewall... 31%\n[${bar(31)}]`,
  `🌐 Fake IP mila: ${fakeIp()}\n🔓 Password crack ho raha hai... 47%\n[${bar(47)}]`,
  `📂 Gallery download... 68%\n[${bar(68)}]`,
  `💬 Chats copy ho rahi hain... 89%\n[${bar(89)}]`,
  `✅ Hacking complete 100%\n[${bar(100)}]`,
  `😂 *Prank tha!* Koi hack nahi hua — sab jhoot tha, ${name} bilkul safe hai.\n_— AQDAS MD_`
]

export default [
  {
    name: 'battery', alias: ['charge', 'charging'], category: 'fun', desc: 'Battery charging animation + Durood Pak',
    async run (ctx) {
      const sent = await animate(ctx, batteryFrames(), 700)
      await wait(900)
      await ctx.sock.sendMessage(ctx.jid, { text: batteryFinal(), edit: sent.key })
      await wait(900)
      await animate(ctx, magicFrames(), 650)
    }
  },
  {
    name: 'hack', alias: ['hacker', 'prankhack'], category: 'fun', usage: '@user / reply', desc: 'Mazaq wala fake hacking (prank) — aakhir mein "Prank tha!"',
    async run (ctx) {
      const tagged = ctx.mentioned[0] || ctx.quoted?.key?.participant
      const name = tagged ? (ctx.quoted?.key?.participant === tagged && ctx.quoted?.pushName) || 'dost' : (ctx.text || 'dost')
      await animate(ctx, hackFrames(String(name).replace(/@\d+/g, 'dost').slice(0, 30) || 'dost'), 900)
    }
  }
]
