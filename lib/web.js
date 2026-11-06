import express from 'express'
import crypto from 'crypto'
import fs from 'fs'
import config from '../config.js'
import { log } from './logger.js'
import path from 'path'
import { dpPath } from './assets.js'
import { restartBot } from './restart.js'
import * as makers from './makers.js'
import { INSTANCE } from './github.js'

// ===== Web panel =====
// PUBLIC  (/): koi bhi apna number daale -> pairing code -> uske number pe AQDAS MD chalne lage
// ADMIN   (/admin): ADMIN_PASSWORD se — sab numbers ki list, kisi ko hatao, main bot ka status
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }
const digits = v => String(v || '').replace(/[^0-9]/g, '')
// 03001234567 -> 923001234567, 00923.. -> 923.., +92 300.. -> 92300..
export const cleanNumber = (v) => { let d = digits(v); if (d.startsWith('00')) d = d.slice(2); if (/^03\d{9}$/.test(d)) d = '92' + d.slice(1); else if (/^3\d{9}$/.test(d)) d = '92' + d; return d }

function clientIp (req) {
  const ra = req.socket?.remoteAddress || ''
  if (/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(ra)) return String(req.get('cf-connecting-ip') || req.get('x-forwarded-for') || 'local').split(',')[0].trim()
  return ra
}

function limiter (max, ms) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const h = (hits.get(key) || []).filter(t => now - t < ms)
    if (h.length >= max) { hits.set(key, h); return false }
    h.push(now); hits.set(key, h)
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < ms)) hits.delete(k)
    return true
  }
}

export function createApp (bot, manager = null) {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api/maker', express.json({ limit: '8mb' }))
  app.use(express.json({ limit: '10kb' }))
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next() })
  const fails = new Map()
  const adminPairs = new Map()

  const auth = (req, res, next) => {
    const ip = clientIp(req)
    const f = fails.get(ip) || { n: 0, t: 0 }
    if (f.n >= 10 && Date.now() - f.t < 15 * 60000) return res.status(429).json({ ok: false, error: 'Bohat ghalat password. 15 minute baad try karo.' })
    if (!config.adminPassword || config.adminPassword === 'change-me-123') return res.status(403).json({ ok: false, error: 'Server pe ADMIN_PASSWORD env set karo (default password nahi chalega).' })
    if (!safeEq(req.get('x-admin-password') || '', config.adminPassword)) {
      fails.set(ip, { n: f.n + 1, t: Date.now() })
      return res.status(401).json({ ok: false, error: 'Password ghalat hai' })
    }
    fails.delete(ip); next()
  }

  app.get('/health', (req, res) => res.json({ ok: true, status: bot.status, uptime: Math.round(process.uptime()) }))
  app.get('/logo.jpg', (req, res) => { const p = path.resolve('media/panel_logo.jpg'); fs.existsSync(p) ? res.sendFile(p) : (fs.existsSync(dpPath()) ? res.sendFile(path.resolve(dpPath())) : res.status(404).end()) })
  app.get('/intro.mp3', (req, res) => { const p = ['media/intro.mp3', 'media/song.mp3'].map(f => path.resolve(f)).find(f => fs.existsSync(f)); p ? res.type('audio/mpeg').sendFile(p) : res.status(404).end() })
  app.get('/dp.jpg', (req, res) => fs.existsSync(dpPath()) ? res.sendFile(path.resolve(dpPath())) : res.status(404).end())
  app.get('/', (req, res) => res.type('html').send(PUBLIC_PAGE))
  app.get('/admin', (req, res) => res.type('html').send(ADMIN_PAGE))


  // ---------- BOT MAKER (/make -> /u/<naam>) ----------
  // Bot Maker sirf usi server pe jahan INSTANCE set ho (naya Railway) ya BOT_MAKER=on
  const MAKER_ON = !!INSTANCE || /^(1|on|true|yes)$/i.test(process.env.BOT_MAKER || '')
  if (MAKER_ON) makers.loadMakers().catch(() => {})
  app.use(['/make', '/u', '/api/maker'], (req, res, next) => MAKER_ON ? next() : res.status(404).type('html').send('<meta name="viewport" content="width=device-width"><body style="background:#05030d;color:#c4b5fd;font-family:sans-serif;text-align:center;padding:40px">Bot Maker yahan band hai</body>'))
  const makeLimit = limiter(5, 60 * 60000)
  app.get('/make', (req, res) => res.type('html').send(MAKE_PAGE))
  app.post('/api/maker/create', async (req, res) => {
    if (!makeLimit(clientIp(req))) return res.status(429).json({ ok: false, error: 'Bohat zyada try, 1 ghante baad' })
    try { const m = await makers.saveMaker(req.body || {}); log.info('bot maker: naya bot ' + m.slug); res.json({ ok: true, slug: m.slug, name: m.name }) } catch (e) { res.status(Number(e.code) || 400).json({ ok: false, error: e.message }) }
  })
  app.post('/api/maker/edit', async (req, res) => {
    if (!makeLimit(clientIp(req))) return res.status(429).json({ ok: false, error: 'Bohat zyada try, 1 ghante baad' })
    try { const m = await makers.saveMaker(req.body || {}, { edit: true }); res.json({ ok: true, slug: m.slug, name: m.name }) } catch (e) { res.status(Number(e.code) || 400).json({ ok: false, error: e.message }) }
  })
  app.get('/api/maker/info/:slug', async (req, res) => { await makers.loadMakers(); const m = makers.getMaker(req.params.slug); m ? res.json({ ok: true, ...makers.publicMaker(m) }) : res.status(404).json({ ok: false }) })
  app.get('/u/:slug/dp.jpg', async (req, res) => {
    await makers.loadMakers(); const m = makers.getMaker(req.params.slug)
    if (m?.dp) return res.type('jpg').send(Buffer.from(m.dp, 'base64'))
    fs.existsSync(dpPath()) ? res.sendFile(path.resolve(dpPath())) : res.status(404).end()
  })
  app.get('/u/:slug/song.mp3', async (req, res) => { await makers.loadMakers(); const m = makers.getMaker(req.params.slug); if (m?.song) return res.type('audio/mpeg').send(Buffer.from(m.song, 'base64')); res.redirect('/intro.mp3') })
  app.get('/u/:slug', async (req, res) => {
    await makers.loadMakers(); const m = makers.getMaker(req.params.slug)
    if (!m) return res.status(404).type('html').send('<meta name="viewport" content="width=device-width"><body style="background:#000;color:#39ff8e;font-family:monospace;text-align:center;padding:40px">Ye bot nahi mila 😕<br><br><a style="color:#fff" href="/make">Apna bot banao</a></body>')
    res.type('html').send(brandPage(m))
  })

  // ---------- PUBLIC ----------
  app.get('/api/public/info', (req, res) => {
    if (!manager) return res.json({ ok: true, enabled: false })
    res.json({ ok: true, enabled: true, used: manager.slotsUsed(), max: 'unlimited', accepting: manager.accepting(), channel: config.mainChannel || null })
  })

  app.post('/api/public/pair', async (req, res) => {
    if (!manager) return res.status(404).json({ ok: false, error: 'Public pairing band hai' })
    const number = cleanNumber(req.body?.number)
    if (number.length < 10 || number.length > 15) return res.status(400).json({ ok: false, error: 'Number ghalat hai. 92 se shuru karo (country code), misal: 923001234567' })
    if (!manager.accepting()) return res.status(503).json({ ok: false, error: manager.busyReason() || 'Abhi naya number nahi jud sakta, thori der baad try karo.' })
    try {
      const mk = req.body?.maker ? makers.getMaker(req.body.maker) : null
      const r = await manager.pairGuest(number, { chGroup: !mk && req.body?.chGroup === true, maker: mk?.slug || null })
      log.info(`web: pairing code diya (****${number.slice(-4)})`)
      res.json({ ok: true, token: r.token, code: r.code })
    } catch (e) {
      const msg = e.wa?.code === '429' ? 'WhatsApp ne limit lagayi hai (is number pe bohat codes). 30-40 min baad try karo.' : e.message
      res.status(e.code && Number(e.code) >= 400 && Number(e.code) < 600 ? Number(e.code) : 400).json({ ok: false, error: msg })
    }
  })

  app.post('/api/public/qr', async (req, res) => {
    if (!manager) return res.status(404).json({ ok: false, error: 'Public pairing band hai' })
    if (!manager.accepting()) return res.status(503).json({ ok: false, error: manager.busyReason() || 'Abhi naya number nahi jud sakta, thori der baad try karo.' })
    try { const mk = req.body?.maker ? makers.getMaker(req.body.maker) : null; const r = await manager.pairGuestQR({ chGroup: !mk && req.body?.chGroup === true, maker: mk?.slug || null }); res.json({ ok: true, token: r.token, qr: r.qr }) } catch (e) { res.status(Number(e.code) >= 400 && Number(e.code) < 600 ? Number(e.code) : 400).json({ ok: false, error: e.message }) }
  })

  app.get('/qrcode.min.js', (req, res) => { const p = path.resolve('docs/qrcode.min.js'); fs.existsSync(p) ? res.type('js').sendFile(p) : res.status(404).end() })

  app.get('/api/public/pair/:token', (req, res) => {
    if (!manager) return res.status(404).json({ ok: false })
    res.json({ ok: true, ...manager.pairStatus(req.params.token) })
  })

  // ---------- ADMIN ----------
  app.get('/api/status', auth, (req, res) => {
    const u = bot.sock?.user
    res.json({ ok: true, status: bot.status, connected: bot.status === 'open', registered: bot.registered, number: u?.id?.split(':')[0] || bot.pairNumber || null, name: u?.name || null, pairCode: bot.status === 'open' ? null : bot.pairCode, botName: config.botName, slots: manager ? { used: manager.slotsUsed(), max: manager.MAX_SESSIONS } : null })
  })

  // main bot ka pairing code (admin)
  app.post('/api/pair', auth, async (req, res) => {
    const ip = clientIp(req); const now = Date.now()
    const hist = (adminPairs.get(ip) || []).filter(t => now - t < 10 * 60000)
    if (hist.length >= 5) return res.status(429).json({ ok: false, error: '10 minute mein 5 codes ho gaye. Thora ruk ke try karo.' })
    adminPairs.set(ip, [...hist, now])
    try {
      const code = await bot.requestPairing(cleanNumber(req.body?.number))
      res.json({ ok: true, code })
    } catch (e) { res.status(400).json({ ok: false, error: e.message }) }
  })

  app.get('/api/admin/sessions', auth, (req, res) => res.json({ ok: true, sessions: manager ? manager.list() : [{ id: 'main', number: bot.number || '', status: bot.status, main: true }] }))

  app.post('/api/admin/remove', auth, async (req, res) => {
    if (!manager) return res.status(404).json({ ok: false, error: 'Manager nahi' })
    try { await manager.removeGuest(String(req.body?.id || '')); res.json({ ok: true }) } catch (e) { res.status(e.code || 400).json({ ok: false, error: e.message }) }
  })

  // 🔄 Restart: sessions save -> naya run (GitHub) ya band ho ke watchdog se wapas
  app.post('/api/admin/restart', auth, async (req, res) => {
    try { const r = await restartBot('admin panel'); res.json({ ok: true, mode: r.mode }) } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  app.post('/api/logout', auth, async (req, res) => {
    await bot.logout()
    res.json({ ok: true })
  })
  return app
}

export function startWeb (bot, port = config.port, manager = null) {
  const app = createApp(bot, manager)
  return new Promise(resolve => {
    const server = app.listen(port, '0.0.0.0', () => { log.ok(`🌐 Web panel: http://localhost:${port}`); resolve(server) })
    // Free host (Render) 15 min baad so jata hai: apne hi /health ko har 10 min ping
    if (config.keepAliveUrl) {
      const url = config.keepAliveUrl.replace(/\/$/, '') + '/health'
      setInterval(() => fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => {}), 10 * 60000).unref()
      log.info('Keep-alive ping on:', url)
    }
  })
}

const STYLE = `*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:ui-monospace,Menlo,Consolas,monospace;background:#020805;color:#b7ffcf;display:flex;align-items:center;justify-content:center;padding:18px;
background-image:radial-gradient(circle at 50% 0,#063d1d55,transparent 60%),repeating-linear-gradient(0deg,#00ff6608 0 1px,transparent 1px 4px)}
.card{width:100%;max-width:440px;background:#04130bdd;border:1px solid #1aff7a55;border-radius:18px;padding:24px;box-shadow:0 0 40px #00ff6626}
.logo{width:100px;height:100px;border-radius:50%;display:block;margin:0 auto 10px;border:2px solid #22ff88;box-shadow:0 0 25px #22ff8866;object-fit:cover}
h1{text-align:center;margin:4px 0 2px;color:#39ff8e;letter-spacing:3px;text-shadow:0 0 12px #39ff8e}
.sub{text-align:center;color:#6fdc9c;font-size:12px;margin-bottom:16px;letter-spacing:2px}
label{font-size:13px;color:#8fffbf}input{width:100%;padding:14px;margin:6px 0 14px;border-radius:10px;border:1px solid #1aff7a66;background:#010a05;color:#d9ffe7;font-size:18px;font-family:inherit;letter-spacing:1px}
button{width:100%;padding:14px;border:0;border-radius:10px;background:linear-gradient(90deg,#00e676,#00b0ff);color:#00140a;font-weight:700;font-size:16px;cursor:pointer;font-family:inherit}
button:disabled{opacity:.6}button.ghost{background:transparent;border:1px solid #ff5c5c88;color:#ff8a8a;margin-top:10px;font-size:13px;padding:10px}
.code{font-size:36px;text-align:center;letter-spacing:6px;color:#fff;background:#00150a;border:1px dashed #39ff8e;border-radius:12px;padding:16px 6px;margin:14px 0 10px;text-shadow:0 0 10px #39ff8e;user-select:all}
.st{text-align:center;padding:12px;border-radius:10px;margin:12px 0;font-size:14px}.on{background:#00391a;color:#5cff9d;font-size:18px;font-weight:700}.off{background:#2a1a00;color:#ffc65c}.wait{background:#002a33;color:#7fe7ff}
.err{color:#ff7b7b;font-size:13px;min-height:18px;text-align:center;margin-top:8px}.steps{font-size:12.5px;color:#9fe9bd;line-height:1.7;margin-top:10px}.hide{display:none}
.note{font-size:12px;color:#ffd38a;line-height:1.6;background:#1d1500;border:1px solid #ffc65c44;border-radius:10px;padding:10px;margin-top:14px}
.chan{display:block;text-align:center;margin-top:14px;padding:12px;border-radius:10px;border:1px solid #25d366;color:#25d366;text-decoration:none;font-weight:700}
.slots{text-align:center;font-size:12px;color:#6fdc9c;margin-bottom:10px}
table{width:100%;font-size:12px;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #1aff7a22}td button{padding:4px 8px;font-size:11px;width:auto}`


const escH = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// Bot Maker: wahi pairing page, us bot ke naam / DP / channel ke saath
function brandPage (m) {
  const dp = '/u/' + m.slug + '/dp.jpg?v=' + m.v
  const mk = JSON.stringify(m.slug)
  return PUBLIC_PAGE
    .replace('<title>AQDAS PANEL • Apne number pe bot</title>', '<title>' + escH(m.name) + ' • Apne number pe bot</title>')
    .split('src="/logo.jpg"').join('src="' + dp + '"').split('href="/logo.jpg"').join('href="' + dp + '"')
    .replace('<div class="iname">AQDAS PANEL</div>', '<div class="iname">' + escH(m.name) + '</div>').replace('BY AQDAS HACKER</div>\n<div style="margin-top:46px', 'BY ' + escH(m.owner) + '</div>\n<div style="margin-top:46px').replace('src="/intro.mp3"', 'src="/u/' + m.slug + '/song.mp3"')
    .replace('<h1>AQDAS MD</h1>', '<h1>' + escH(m.name) + '</h1>')
    .replace('<div class="sub">BY AQDAS HACKER</div>', '<div class="sub">BY ' + escH(m.owner) + '</div>')
    .replace(/<label style="display:flex;gap:8px[^]*?<\/label>/, '<input id="chg" type="checkbox" style="display:none">')
    .split("JSON.stringify({number:n,chGroup:$('chg').checked})").join('JSON.stringify({number:n,chGroup:false,maker:' + mk + '})')
    .split("JSON.stringify({chGroup:$('chg').checked})").join('JSON.stringify({chGroup:false,maker:' + mk + '})')
    .split('href="' + (config.mainChannel || '#') + '"').join('href="' + escH(m.channel || config.mainChannel || '#') + '"')
}

const PSTYLE = STYLE + `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Inter:wght@400;500;600&display=swap');
body{font-family:Inter,sans-serif;color:#e9e6ff;background:#05030d;background-image:radial-gradient(900px 500px at 85% -10%,#6d28d955,transparent 60%),radial-gradient(700px 500px at -10% 30%,#7c3aed40,transparent 60%),radial-gradient(600px 400px at 50% 110%,#a21caf40,transparent 60%),linear-gradient(180deg,#07041a,#0a0420 40%,#05030d);background-attachment:fixed}
.card{background:#0f0a24cc;border:1px solid #8b5cf666;box-shadow:0 0 40px #7c3aed33;backdrop-filter:blur(8px)}
.logo{border:2px solid #c084fc;box-shadow:0 0 30px #a855f7}
h1{font-family:Orbitron,sans-serif;color:#f5f3ff;text-shadow:0 0 18px #8b5cf6;background:linear-gradient(90deg,#c4b5fd,#f0abfc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub,.slots{color:#c4b5fd;letter-spacing:3px}
label{color:#ddd6fe}label input[type=checkbox]{accent-color:#a855f7}
input,select{background:#0a0618!important;border:1px solid #8b5cf666!important;color:#fff!important}
button{font-family:Orbitron,sans-serif;letter-spacing:2px;color:#fff;background:linear-gradient(90deg,#4c1d95,#7e22ce,#4c1d95);border:1px solid #c084fc;box-shadow:0 0 22px #8b5cf688}
button.ghost{box-shadow:none}
.code{font-family:Orbitron,sans-serif;color:#f0abfc;background:#0a0618;border:1px dashed #a78bfa;text-shadow:0 0 12px #c026d3}
.wait{background:#1d1442;color:#ddd6fe}.on{background:#14321f;color:#6ee7b7}
.steps{color:#c4b5fd}.chan{border-color:#a855f7;color:#e9d5ff}
.ok{background:#1d1442!important;border-color:#a855f7!important}.ok a{color:#f0abfc!important}
.pv img{border-color:#c084fc!important}
div[style*="color:#6fdc9c"],div[style*="color:#9fe9bd"]{color:#c4b5fd!important}
`

const PUBLIC_PAGE = `<!doctype html><html lang="ur"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AQDAS MD • Apne number pe bot</title><link rel="icon" href="/logo.jpg"><style>${PSTYLE}</style><script src="/qrcode.min.js"></script></head><body><div id="intro" style="position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05030d;background-image:radial-gradient(600px 400px at 50% 40%,#6d28d955,transparent 70%);cursor:pointer;transition:opacity .6s">
<img src="/logo.jpg" alt="" style="width:130px;height:130px;border-radius:50%;border:2px solid #c084fc;box-shadow:0 0 40px #a855f7;animation:ipulse 2s ease-in-out infinite">
<div class="iname">AQDAS PANEL</div>
<div style="letter-spacing:6px;font-size:11px;color:#c4b5fd;margin-top:8px">BY AQDAS HACKER</div>
<div style="margin-top:46px;font-size:12px;letter-spacing:3px;color:#a5a0c8;animation:iblink 1.6s infinite">👆 TAP ANYWHERE</div></div>
<style>.iname{font-family:Orbitron,sans-serif;font-weight:800;font-size:34px;letter-spacing:3px;margin-top:20px;color:#f5f3ff;animation:iflick 2.6s infinite}
@keyframes iflick{0%,18%,22%,25%,53%,57%,100%{text-shadow:0 0 6px #fff,0 0 14px #c084fc,0 0 30px #a855f7,0 0 60px #7e22ce;opacity:1}20%,24%,55%{text-shadow:none;opacity:.35}}
@keyframes ipulse{50%{box-shadow:0 0 70px #c026d3}}@keyframes iblink{50%{opacity:.3}}</style>
<audio id="isong" src="/intro.mp3" preload="auto"></audio>
<script>(function(){const i=document.getElementById('intro');if(sessionStorage.getItem('aqIn')){i.remove();return}
i.addEventListener('click',function(){const a=document.getElementById('isong');try{a.volume=0.5;a.play().catch(()=>{})}catch(e){}sessionStorage.setItem('aqIn','1');i.style.opacity='0';setTimeout(()=>i.remove(),650)},{once:true})})()</script><div class="card">
<img class="logo" src="/logo.jpg" alt="" onerror="this.style.display='none'"><h1>AQDAS MD</h1><div class="sub">BY AQDAS HACKER</div>
<div class="slots" id="slots"></div>
<div id="form"><label>Country</label><select id="cc" style="width:100%;padding:12px;border-radius:10px;background:#00150a;color:#fff;border:1px solid #1aff7a55;font-size:15px;margin-bottom:12px"><option value="92">🇵🇰 Pakistan (+92)</option><option value="91">🇮🇳 India (+91)</option><option value="880">🇧🇩 Bangladesh (+880)</option><option value="93">🇦🇫 Afghanistan (+93)</option><option value="966">🇸🇦 Saudi Arabia (+966)</option><option value="971">🇦🇪 UAE (+971)</option><option value="974">🇶🇦 Qatar (+974)</option><option value="968">🇴🇲 Oman (+968)</option><option value="965">🇰🇼 Kuwait (+965)</option><option value="973">🇧🇭 Bahrain (+973)</option><option value="964">🇮🇶 Iraq (+964)</option><option value="98">🇮🇷 Iran (+98)</option><option value="90">🇹🇷 Turkey (+90)</option><option value="20">🇪🇬 Egypt (+20)</option><option value="962">🇯🇴 Jordan (+962)</option><option value="44">🇬🇧 UK (+44)</option><option value="1">🇺🇸 USA / 🇨🇦 Canada (+1)</option><option value="49">🇩🇪 Germany (+49)</option><option value="33">🇫🇷 France (+33)</option><option value="39">🇮🇹 Italy (+39)</option><option value="34">🇪🇸 Spain (+34)</option><option value="31">🇳🇱 Netherlands (+31)</option><option value="46">🇸🇪 Sweden (+46)</option><option value="47">🇳🇴 Norway (+47)</option><option value="30">🇬🇷 Greece (+30)</option><option value="351">🇵🇹 Portugal (+351)</option><option value="7">🇷🇺 Russia (+7)</option><option value="61">🇦🇺 Australia (+61)</option><option value="64">🇳🇿 New Zealand (+64)</option><option value="60">🇲🇾 Malaysia (+60)</option><option value="62">🇮🇩 Indonesia (+62)</option><option value="65">🇸🇬 Singapore (+65)</option><option value="66">🇹🇭 Thailand (+66)</option><option value="63">🇵🇭 Philippines (+63)</option><option value="86">🇨🇳 China (+86)</option><option value="81">🇯🇵 Japan (+81)</option><option value="82">🇰🇷 South Korea (+82)</option><option value="977">🇳🇵 Nepal (+977)</option><option value="94">🇱🇰 Sri Lanka (+94)</option><option value="234">🇳🇬 Nigeria (+234)</option><option value="254">🇰🇪 Kenya (+254)</option><option value="27">🇿🇦 South Africa (+27)</option><option value="55">🇧🇷 Brazil (+55)</option><option value="52">🇲🇽 Mexico (+52)</option><option value="54">🇦🇷 Argentina (+54)</option></select><label>Apna WhatsApp number (country code ke baghair)</label><input id="num" inputmode="numeric" autocomplete="tel" placeholder="3xxxxxxxxx">
<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#9fe9bd;margin:-4px 0 12px;line-height:1.5"><input id="chg" type="checkbox" style="width:auto;margin:3px 0 0"> ✅ Main AQDAS HACKER channel ke react group mein shamil hona chahta hoon (mera number channel posts pe react karega)</label>
<button id="pb" onclick="pair()">Get Pairing Code</button>
<div id="qrOpt"><div style="text-align:center;font-size:12px;color:#6fdc9c;margin:12px 0 6px">— ya —</div>
<button id="qb" onclick="pairQR()" style="background:transparent;border:1px solid #c084fc;color:#e9d5ff;box-shadow:none">📷 QR se link karo</button>
<div style="text-align:center;font-size:11.5px;color:#6fdc9c;margin-top:6px">QR ke liye ye page kisi dusre phone / PC pe kholo</div></div></div>
<div id="qrBox" class="hide"><div class="st wait" id="qst">📷 Apne WhatsApp wale phone se scan karo</div><div style="background:#fff;border-radius:14px;padding:12px;margin:12px auto;width:fit-content"><div id="qr"></div></div>
<div class="steps">1) Jis number pe bot chahiye us phone pe WhatsApp kholo<br>2) ⋮ / Settings &gt; <b>Linked devices</b> &gt; <b>Link a device</b><br>3) Camera is QR pe rakho ✅ (QR khud badalta rehta hai)</div></div>
<div id="codeBox" class="hide"><div class="st wait" id="st">🔑 Code ready — jaldi daalo</div><div class="code" id="code">----</div>
<div class="steps" id="cd" style="text-align:center;font-size:14px;color:#ffd38a"></div>
<button id="copy" onclick="copyCode()">📋 Copy Code</button>
<button id="newc" class="hide" onclick="pair()" style="margin-top:10px">🔄 Naya code lo</button>
<div class="steps">1) Isi number wale phone pe WhatsApp kholo<br>2) ⋮ / Settings &gt; <b>Linked devices</b> &gt; <b>Link a device</b><br>3) <b>Link with phone number instead</b> dabao<br>4) Upar wala code daal do ✅</div></div>
<div id="doneBox" class="hide"><div class="st on">✅ CONNECTED</div><div class="steps" style="text-align:center">Bot tumhare number pe chal raha hai 🚀<br>Kisi bhi chat mein <b>.menu</b> likho.</div></div>
<div id="againBox" class="hide"><div class="st off" id="againMsg"></div><button onclick="reset()">🔄 Naya code lo</button></div>
<div class="err" id="err"></div>
<div class="note">ℹ️ Bot tumhare WhatsApp pe chalega; jab chaho Linked devices se logout karo, bot hat jayega aur uska data foran delete ho jayega. Hum tumhari chats save ya forward nahi karte.</div>
<a class="chan" href="${config.mainChannel || '#'}" target="_blank" rel="noopener">📢 Join WhatsApp Channel</a>
</div><script>
const $=i=>document.getElementById(i);let TOKEN=null,CODE='',timer=null;
function clean(v){let d=String(v||'').replace(/\\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(/^03\\d{9}$/.test(d))d='92'+d.slice(1);else if(/^3\\d{9}$/.test(d))d='92'+d;return d}
$('num').addEventListener('input',()=>{const c=$('num').value.replace(/[^0-9]/g,'');if(c!==$('num').value)$('num').value=c});
function full(){const cc=$('cc').value;let d=$('num').value.replace(/[^0-9]/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.startsWith(cc)&&d.length>=cc.length+9)return d;d=d.replace(/^0+/,'');return cc+d}
try{const sv=localStorage.getItem('aqcc');if(sv)$('cc').value=sv}catch(e){}
$('cc').addEventListener('change',()=>{try{localStorage.setItem('aqcc',$('cc').value)}catch(e){}});
async function info(){try{const r=await (await fetch('/api/public/info')).json();if(r.enabled)$('slots').textContent='Slots: unlimited • '+r.used+' linked'+(r.accepting?'':' — server busy, thori der baad')}catch(e){}}
function show(id){for(const x of ['form','codeBox','qrBox','doneBox','againBox'])$(x).classList.toggle('hide',x!==id)}
async function pair(){$('err').textContent='';const n=full();if(!$('newc').classList.contains('hide')){$('newc').disabled=true;$('newc').textContent='Naya code aa raha hai...'}
 if(n.length<10||n.length>15){$('err').textContent='Number ghalat hai. 92 se shuru karo, misal: 923001234567';return}
 if(n.startsWith('92')&&n.length!==12){$('err').textContent='Pakistan number 12 digit ka hota hai (92 + 10 digit)';return}
 $('pb').disabled=true;$('pb').textContent='Code aa raha hai... (10-20 sec)';
 try{const r=await fetch('/api/public/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({number:n,chGroup:$('chg').checked})});const j=await r.json();
  if(!j.ok)throw new Error(j.error||'Error');TOKEN=j.token;CODE=j.code;$('code').textContent=j.code;$('code').style.opacity=1;$('copy').textContent='📋 Copy Code';$('copy').classList.remove('hide');$('newc').classList.add('hide');$('st').className='st wait';$('st').textContent='🔑 Code ready — jaldi daalo';show('codeBox');countdown();poll()}
 catch(e){$('err').textContent=e.message;if(TOKEN===null)show('form')}$('pb').disabled=false;$('pb').textContent='Get Pairing Code';$('newc').disabled=false;$('newc').textContent='🔄 Naya code lo';info()}
let cdT=null,LINKING=false;function countdown(){clearInterval(cdT);LINKING=false;let left=60;const tick=()=>{if(LINKING){$('cd').textContent='';clearInterval(cdT);return}
 if(left<=0){clearInterval(cdT);$('cd').textContent='⌛ Ye code purana ho gaya';$('code').style.opacity=.35;$('copy').classList.add('hide');$('newc').classList.remove('hide');return}
 $('cd').textContent='⏱️ '+left+' sec mein code daalo';left--};tick();cdT=setInterval(tick,1000)}
async function poll(){clearTimeout(timer);if(!TOKEN)return;try{const s=await (await fetch('/api/public/pair/'+TOKEN)).json();
 if(s.state==='connected'){show('doneBox');return}
 if(s.state==='linking'){LINKING=true;$('cd').textContent='';$('st').className='st on';$('st').textContent='🔗 Code accept — link ho raha hai...'}

 if(s.state==='linking'){$('qst').className='st on';$('qst').textContent='🔗 Scan ho gaya — link ho raha hai...'}
 if(s.state==='pairing'&&s.qr)drawQR(s.qr)
 if(s.mode==='code'&&s.state==='expired'){clearInterval(cdT);$('cd').textContent='⌛ Code ka time khatam';$('code').style.opacity=.35;$('copy').classList.add('hide');$('newc').classList.remove('hide');return}
 if(['expired','logged_out','unknown'].includes(s.state)){$('againMsg').textContent=s.state==='expired'?'⌛ Code ka time khatam, link nahi hua.':'⚠️ Session khatam.';show('againBox');return}
}catch(e){}timer=setTimeout(poll,3000)}
function reset(){TOKEN=null;show('form')}
let QR='';function drawQR(q){if(q===QR)return;QR=q;try{const x=qrcode(0,'L');x.addData(q);x.make();$('qr').innerHTML=x.createSvgTag({cellSize:5,margin:2,scalable:true});const sv=$('qr').querySelector('svg');if(sv){sv.style.width='250px';sv.style.height='250px'}}catch(e){$('qr').textContent='QR error'}}
async function pairQR(){$('err').textContent='';$('qb').disabled=true;$('qb').textContent='QR aa raha hai...';
 try{const r=await fetch('/api/public/qr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chGroup:$('chg').checked})});const j=await r.json();if(!j.ok)throw new Error(j.error||'Error');TOKEN=j.token;drawQR(j.qr);show('qrBox');poll()}
 catch(e){$('err').textContent=e.message}$('qb').disabled=false;$('qb').textContent='📷 QR se link karo';info()}
async function copyCode(){const raw=CODE.replace(/[^A-Za-z0-9]/g,'');try{await navigator.clipboard.writeText(raw)}catch(e){const t=document.createElement('textarea');t.value=raw;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}$('copy').textContent='✅ Copied: '+raw}
info();setInterval(info,30000);
</script></body></html>`

const ADMIN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>AQDAS MD • Admin</title><style>${STYLE}</style></head><body><div class="card">
<h1>AQDAS MD</h1><div class="sub">ADMIN PANEL</div>
<div id="login"><label>Admin password</label><input id="pw" type="password"><button onclick="login()">Login</button></div>
<div id="main" class="hide"><div class="st wait" id="st">...</div><table id="tbl"></table><button id="rst" onclick="restart()">🔄 Restart bot</button><div class="sub" id="rmsg"></div><button class="ghost" onclick="logoutMain()">Main bot unlink</button></div>
<div class="err" id="err"></div></div><script>
let PW=sessionStorage.getItem('pw')||'';const $=i=>document.getElementById(i);
async function api(p,o={}){o.headers=Object.assign({'content-type':'application/json','x-admin-password':PW},o.headers||{});const r=await fetch(p,o);const j=await r.json().catch(()=>({ok:false,error:'Server error'}));if(!r.ok||!j.ok)throw new Error(j.error||'Error');return j}
const esc=s=>String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
async function login(){PW=$('pw').value;try{await api('/api/status');sessionStorage.setItem('pw',PW);$('login').classList.add('hide');$('main').classList.remove('hide');$('err').textContent='';load()}catch(e){$('err').textContent=e.message}}
async function load(){try{const s=await api('/api/status');$('st').textContent='Main: '+s.status+(s.number?' (+'+s.number+')':'')+(s.slots?' • slots: unlimited ('+s.slots.used+' linked)':'');
 const l=await api('/api/admin/sessions');$('tbl').innerHTML='<tr><td>Number</td><td>Status</td><td></td></tr>'+l.sessions.map(x=>'<tr><td>'+(x.main?'👑 ':'')+'+'+esc(x.number)+'</td><td>'+esc(x.status)+'</td><td>'+(x.main?'':'<button onclick="rm(\\''+esc(x.id)+'\\')">Remove</button>')+'</td></tr>').join('')}catch(e){$('err').textContent=e.message}setTimeout(load,8000)}
async function rm(id){if(!confirm('Is number ka bot hatana hai?'))return;try{await api('/api/admin/remove',{method:'POST',body:JSON.stringify({id})})}catch(e){$('err').textContent=e.message}}
async function restart(){if(!confirm('Bot restart karna hai? Sab numbers save rahenge, dobara pair nahi karna.'))return;$('rst').disabled=true;$('rst').textContent='Restart ho raha hai...';try{const r=await api('/api/admin/restart',{method:'POST'});$('rmsg').textContent=r.mode==='dispatch'?'✅ Restart shuru. 2-3 min mein bot wapas online. Panel ka link badal jayega: Owner page se naya Panel kholo.':'✅ Bot save karke band ho raha hai. 5-15 min mein khud wapas aa jayega.'}catch(e){$('err').textContent=e.message;$('rst').disabled=false;$('rst').textContent='🔄 Restart bot'}}
async function logoutMain(){if(!confirm('Main bot unlink karna hai?'))return;try{await api('/api/logout',{method:'POST'})}catch(e){$('err').textContent=e.message}}
if(PW){$('pw').value=PW;login()}
</script></body></html>`

const MAKE_PAGE = `<!doctype html><html lang="ur"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AQDAS Bot Maker • Apna WhatsApp bot banao</title><link rel="icon" href="/logo.jpg"><style>${PSTYLE}
.pv{display:flex;gap:10px;align-items:center;margin:-4px 0 12px}.pv img{width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid #39ff8e}
input[type=file]{padding:9px;font-size:13px}.ok{background:#00331a;border:1px solid #39ff8e;border-radius:12px;padding:14px;margin-top:14px;word-break:break-all}
.ok a{color:#39ff8e;font-weight:700}</style></head><body><div id="intro" style="position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05030d;background-image:radial-gradient(600px 400px at 50% 40%,#6d28d955,transparent 70%);cursor:pointer;transition:opacity .6s">
<img src="/logo.jpg" alt="" style="width:130px;height:130px;border-radius:50%;border:2px solid #c084fc;box-shadow:0 0 40px #a855f7;animation:ipulse 2s ease-in-out infinite">
<div class="iname">AQDAS PANEL</div>
<div style="letter-spacing:6px;font-size:11px;color:#c4b5fd;margin-top:8px">BY AQDAS HACKER</div>
<div style="margin-top:46px;font-size:12px;letter-spacing:3px;color:#a5a0c8;animation:iblink 1.6s infinite">👆 TAP ANYWHERE</div></div>
<style>.iname{font-family:Orbitron,sans-serif;font-weight:800;font-size:34px;letter-spacing:3px;margin-top:20px;color:#f5f3ff;animation:iflick 2.6s infinite}
@keyframes iflick{0%,18%,22%,25%,53%,57%,100%{text-shadow:0 0 6px #fff,0 0 14px #c084fc,0 0 30px #a855f7,0 0 60px #7e22ce;opacity:1}20%,24%,55%{text-shadow:none;opacity:.35}}
@keyframes ipulse{50%{box-shadow:0 0 70px #c026d3}}@keyframes iblink{50%{opacity:.3}}</style>
<audio id="isong" src="/intro.mp3" preload="auto"></audio>
<script>(function(){const i=document.getElementById('intro');if(sessionStorage.getItem('aqIn')){i.remove();return}
i.addEventListener('click',function(){const a=document.getElementById('isong');try{a.volume=0.5;a.play().catch(()=>{})}catch(e){}sessionStorage.setItem('aqIn','1');i.style.opacity='0';setTimeout(()=>i.remove(),650)},{once:true})})()</script><div class="card">
<img class="logo" src="/logo.jpg" alt="" onerror="this.style.display='none'"><h1>AQDAS BOT MAKER</h1><div class="sub">APNA WHATSAPP BOT BANAO • FREE</div>
<div id="form">
<label>Bot ka naam</label><input id="name" maxlength="30" placeholder="ALI MD">
<label>Owner ka naam</label><input id="owner" maxlength="30" placeholder="ALI KHAN">
<label>Owner ka WhatsApp number (country code ke saath)</label><input id="onum" inputmode="numeric" maxlength="15" placeholder="923001234567">
<label>Panel link ka naam (sirf english letters / numbers)</label><input id="slug" maxlength="24" placeholder="ali-md"><div id="lk" style="font-size:12px;color:#6fdc9c;margin:-6px 0 12px"></div>
<label>Apna WhatsApp channel link (optional)</label><input id="channel" placeholder="https://whatsapp.com/channel/...">
<label>Bot ki DP (photo)</label><input id="dp" type="file" accept="image/*"><div class="pv" id="pv"></div>
<label>Menu song (mp3, 30 sec behtar)</label><input id="song" type="file" accept="audio/*"><div id="sg" style="font-size:12px;color:#6fdc9c;margin:-6px 0 12px"></div>
<label>Password (baad mein bot edit karne ke liye, yaad rakhna)</label><input id="pass" type="password" placeholder="kam az kam 4 letters">
<button id="go" onclick="make()">🚀 Deploy</button>
<div class="st" id="st" style="display:none"></div>
</div>
<div id="done" class="hide"></div>
<div style="text-align:center;font-size:11.5px;color:#6fdc9c;margin-top:16px">Powered by AQDAS MD • BY AQDAS HACKER</div>
</div><script>
const $=i=>document.getElementById(i);let dpB='',songB='';
const slugOf=s=>String(s||'').toLowerCase().trim().replace(/\\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,24);
function showLink(){const s=slugOf($('slug').value||$('name').value);$('lk').textContent=s?('Link: '+location.origin+'/u/'+s):''}
$('slug').oninput=showLink;$('name').oninput=()=>{if(!$('slug').value)showLink()};
function shrink(file){return new Promise((ok,no)=>{const img=new Image();img.onload=()=>{const m=640,r=Math.min(1,m/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);c.getContext('2d').drawImage(img,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.85))};img.onerror=no;img.src=URL.createObjectURL(file)})}
$('dp').onchange=async()=>{const f=$('dp').files[0];if(!f)return;try{dpB=await shrink(f);$('pv').innerHTML='<img src="'+dpB+'"> DP tayyar ✅'}catch(e){$('pv').textContent='❌ Ye photo nahi khuli'}};
$('song').onchange=()=>{const f=$('song').files[0];if(!f)return;if(f.size>4*1024*1024){songB='';$('sg').textContent='❌ Song 4 MB se chhota ho (30 sec kaafi hai)';return}const r=new FileReader();r.onload=()=>{songB=r.result;$('sg').textContent='🎵 '+f.name+' tayyar ✅'};r.readAsDataURL(f)};
function msg(t,c){const s=$('st');s.style.display='block';s.className='st '+(c||'wait');s.textContent=t}
async function make(){const b=$('go');const d={name:$('name').value.trim(),owner:$('owner').value.trim(),ownerNumber:$('onum').value.replace(/\\D/g,''),slug:slugOf($('slug').value||$('name').value),channel:$('channel').value.trim(),password:$('pass').value,dp:dpB,song:songB};
if(!d.name)return msg('Bot ka naam likho','err');if(!d.slug)return msg('Panel link ka naam likho','err');if(d.password.length<4)return msg('Password kam az kam 4 letters','err');
b.disabled=true;msg('⏳ Bot ban raha hai...');
try{const r=await fetch('/api/maker/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json();
if(!j.ok){b.disabled=false;return msg('❌ '+(j.error||'Error'),'err')}
const u=location.origin+'/u/'+j.slug;$('form').classList.add('hide');const D=$('done');D.classList.remove('hide');
D.innerHTML='<div class="ok">✅ <b>'+j.name+'</b> tayyar hai!<br><br>Tumhara panel link:<br><a href="'+u+'">'+u+'</a><br><br>Is link pe apna number daalo, pairing code lo, aur bot tumhare number pe chalega. Ye link doston ko bhi do 😎<br><br><button onclick="navigator.clipboard.writeText(\\''+u+'\\');this.textContent=\\'Copied ✅\\'">📋 Link copy</button></div>'}
catch(e){b.disabled=false;msg('❌ Net ka masla, dobara try karo','err')}}
</script></body></html>`
