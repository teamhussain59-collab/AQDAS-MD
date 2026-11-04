// NumberPanel (numberpanel.tech) — temp number + OTP
// .setnumkey <key>  (owner, apne bot ki chat mein)  → API key save
// .getnum [country] → naya WhatsApp number (20 min)
// .otp              → tumhare number ka latest OTP (sirf tumhe, DM mein)
// .change           → purana number release, naya number
// .cancelnum        → number release
const BASE = 'https://numberpanel.tech/api'
const active = new Map() // senderJid -> { number, at, timer }
const TTL = 20 * 60 * 1000

const keyOf = (ctx) => ctx.settings.get('npKey')
const hide = s => String(s || '').replace(/[A-Za-z0-9_\-]{24,}/g, '***').slice(0, 200)

async function api (ctx, method, path, body) {
  const key = keyOf(ctx)
  if (!key) throw new Error('NOKEY')
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000)
  try {
    const r = await fetch(BASE + path, {
      method, signal: ac.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'AQDAS-MD' },
      body: body ? JSON.stringify(body) : undefined
    })
    let j = null; try { j = await r.json() } catch {}
    if (!r.ok || (j && j.success === false)) throw new Error(hide(j?.error || j?.message || ('HTTP ' + r.status)))
    return j || {}
  } finally { clearTimeout(t) }
}
const pickNum = j => j.number || j.phone || j.phone_number || j.data?.number || j.data?.phone || j.result?.number || null
function pickOtp (j) {
  const d = j.data || j.result || j
  const o = d.otp || d.code || d.latest_otp?.otp || d.latest_otp?.code || (Array.isArray(d.otps) && (d.otps[0]?.otp || d.otps[0]?.code)) || null
  const sms = d.sms || d.message_text || d.text || d.latest_otp?.message || d.latest_otp?.sms || (typeof d.message === 'string' && /\d{3}/.test(d.message) ? d.message : '') || ''
  let code = o
  if (!code && sms) { const m = String(sms).match(/\b(\d{3}[- ]?\d{3}|\d{4,8})\b/); if (m) code = m[1] }
  return code ? { code: String(code), sms: String(sms || '') } : null
}
const dm = (ctx, text) => ctx.sock.sendMessage(ctx.sender, { text })
const errText = (e, ctx) => e.message === 'NOKEY'
  ? `❌ API key set nahi. Owner bot ki chat mein likhe: *${ctx.prefix}setnumkey YOUR_KEY*`
  : `❌ Number Panel error: ${hide(e.message)}`

function startPoll (ctx, rec) {
  let n = 0
  const tick = async () => {
    if (active.get(ctx.sender) !== rec || rec.got) return
    n++
    try {
      const j = await api(ctx, 'GET', '/latest_otp?number=' + encodeURIComponent(rec.number))
      const o = pickOtp(j)
      if (o && o.code !== rec.last) {
        rec.last = o.code; rec.got = true
        await dm(ctx, `🔐 *OTP aa gaya!*\n📱 ${rec.number}\n🔑 Code: *${o.code}*${o.sms ? '\n\n💬 ' + o.sms.slice(0, 300) : ''}\n\n> AQDAS MD ⚡`)
        return
      }
    } catch {}
    if (n < 60) rec.timer = setTimeout(tick, 5000)
  }
  rec.timer = setTimeout(tick, 5000)
}

async function release (ctx, rec) {
  if (!rec) return
  clearTimeout(rec.timer); active.delete(ctx.sender)
  try { await api(ctx, 'POST', '/release_number', { number: rec.number }) } catch {}
}

async function getNew (ctx) {
  const country = (ctx.args[0] || 'random').trim()
  const j = await api(ctx, 'POST', '/request_number', { service: 'whatsapp', country })
  const number = pickNum(j)
  if (!number) throw new Error('number nahi mila, dobara try karo')
  const rec = { number, at: Date.now(), timer: null, got: false, last: null }
  active.set(ctx.sender, rec)
  setTimeout(() => { if (active.get(ctx.sender) === rec) { clearTimeout(rec.timer); active.delete(ctx.sender) } }, TTL)
  startPoll(ctx, rec)
  return rec
}

export default [
  {
    name: 'setnumkey', category: 'owner', owner: true, usage: '<api key>', desc: 'Number Panel API key save (sirf owner)',
    async run (ctx) {
      const k = (ctx.args[0] || '').trim()
      if (!k) return ctx.reply(`Likho: *${ctx.prefix}setnumkey YOUR_KEY*`)
      ctx.settings.set('npKey', k)
      try { await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key }) } catch {}
      await ctx.reply('✅ Number Panel API key save ho gayi (message delete kar diya).')
    }
  },
  {
    name: 'getnum', alias: ['tempnum', 'vnum'], category: 'tools', usage: '[country]', desc: 'Temp WhatsApp number + OTP (20 min)',
    async run (ctx) {
      const old = active.get(ctx.sender)
      if (old) return ctx.reply(`⚠️ Tumhare paas pehle se number hai: *${old.number}*\nNaya chahiye to *${ctx.prefix}change*`)
      await ctx.react('⏳')
      try {
        const rec = await getNew(ctx)
        await ctx.react('✅')
        await ctx.reply(`📱 *Tumhara number:* ${rec.number}\n⏰ 20 min ke liye\n\nIs number pe WhatsApp ka code mangwao. OTP aate hi main *tumhe DM mein* bhej dunga (sirf tumhe).\n\n🔁 ${ctx.prefix}otp — khud check\n🔄 ${ctx.prefix}change — naya number\n❌ ${ctx.prefix}cancelnum — band`)
      } catch (e) { await ctx.react('❌'); await ctx.reply(errText(e, ctx)) }
    }
  },
  {
    name: 'otp', alias: ['getotp'], category: 'tools', desc: 'Apne temp number ka OTP (DM mein)',
    async run (ctx) {
      const rec = active.get(ctx.sender)
      if (!rec) return ctx.reply(`Pehle number lo: *${ctx.prefix}getnum*`)
      try {
        const j = await api(ctx, 'GET', '/latest_otp?number=' + encodeURIComponent(rec.number))
        const o = pickOtp(j)
        if (!o) return ctx.reply(`⏳ Abhi OTP nahi aaya ${rec.number} pe. Thodi der baad *${ctx.prefix}otp*`)
        rec.last = o.code; rec.got = true
        await dm(ctx, `🔐 OTP: *${o.code}*\n📱 ${rec.number}`)
        if (ctx.isGroup) await ctx.reply('✅ OTP tumhe DM kar diya')
      } catch (e) { await ctx.reply(errText(e, ctx)) }
    }
  },
  {
    name: 'change', alias: ['changenum', 'newnum'], category: 'tools', usage: '[country]', desc: 'Number badlo (purana release)',
    async run (ctx) {
      await ctx.react('⏳')
      await release(ctx, active.get(ctx.sender))
      try {
        const rec = await getNew(ctx)
        await ctx.react('✅')
        await ctx.reply(`🔄 *Naya number:* ${rec.number}\n⏰ 20 min. OTP aate hi DM mein aayega.`)
      } catch (e) { await ctx.react('❌'); await ctx.reply(errText(e, ctx)) }
    }
  },
  {
    name: 'cancelnum', alias: ['releasenum'], category: 'tools', desc: 'Temp number band karo',
    async run (ctx) {
      const rec = active.get(ctx.sender)
      if (!rec) return ctx.reply('Koi active number nahi.')
      await release(ctx, rec)
      await ctx.reply(`✅ ${rec.number} release kar diya`)
    }
  }
]
