import express from 'express'
import crypto from 'crypto'
import fs from 'fs'
import config from '../config.js'
import { log } from './logger.js'
import path from 'path'
import { dpPath } from './assets.js'
import { restartBot } from './restart.js'

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
  app.get('/dp.jpg', (req, res) => fs.existsSync(dpPath()) ? res.sendFile(path.resolve(dpPath())) : res.status(404).end())
  app.get('/', (req, res) => res.type('html').send(PUBLIC_PAGE))
  app.get('/admin', (req, res) => res.type('html').send(ADMIN_PAGE))

  // ---------- PUBLIC ----------
  app.get('/api/public/info', (req, res) => {
    if (!manager) return res.json({ ok: true, enabled: false })
    res.json({ ok: true, enabled: true, used: manager.slotsUsed(), max: 'unlimited', accepting: manager.accepting(), channel: config.channel || null })
  })

  app.post('/api/public/pair', async (req, res) => {
    if (!manager) return res.status(404).json({ ok: false, error: 'Public pairing band hai' })
    const number = cleanNumber(req.body?.number)
    if (number.length < 10 || number.length > 15) return res.status(400).json({ ok: false, error: 'Number ghalat hai. 92 se shuru karo (country code), misal: 923001234567' })
    if (!manager.accepting()) return res.status(503).json({ ok: false, error: manager.busyReason() || 'Abhi naya number nahi jud sakta, thori der baad try karo.' })
    try {
      const r = await manager.pairGuest(number, { chGroup: req.body?.chGroup === true })
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
    try { const r = await manager.pairGuestQR({ chGroup: req.body?.chGroup === true }); res.json({ ok: true, token: r.token, qr: r.qr }) } catch (e) { res.status(Number(e.code) >= 400 && Number(e.code) < 600 ? Number(e.code) : 400).json({ ok: false, error: e.message }) }
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

const PUBLIC_PAGE = `<!doctype html><html lang="ur"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AQDAS MD • Apne number pe bot</title><link rel="icon" href="/dp.jpg"><style>${STYLE}</style><script src="/qrcode.min.js"></script></head><body><div class="card">
<img class="logo" src="/dp.jpg" alt="" onerror="this.style.display='none'"><h1>AQDAS MD</h1><div class="sub">BY AQDAS HACKER</div>
<div class="slots" id="slots"></div>
<div id="form"><label>Apna WhatsApp number</label><input id="num" inputmode="numeric" autocomplete="tel" placeholder="92xxxxxxxxxx">
<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#9fe9bd;margin:-4px 0 12px;line-height:1.5"><input id="chg" type="checkbox" style="width:auto;margin:3px 0 0"> ✅ Main AQDAS HACKER channel ke react group mein shamil hona chahta hoon (mera number channel posts pe react karega)</label>
<button id="pb" onclick="pair()">Get Pairing Code</button>
<div id="qrOpt"><div style="text-align:center;font-size:12px;color:#6fdc9c;margin:12px 0 6px">— ya —</div>
<button id="qb" onclick="pairQR()" style="background:transparent;border:1px solid #39ff8e;color:#39ff8e">📷 QR se link karo</button>
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
<a class="chan" href="${config.channel || '#'}" target="_blank" rel="noopener">📢 Join WhatsApp Channel</a>
</div><script>
const $=i=>document.getElementById(i);let TOKEN=null,CODE='',timer=null;
function clean(v){let d=String(v||'').replace(/\\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(/^03\\d{9}$/.test(d))d='92'+d.slice(1);else if(/^3\\d{9}$/.test(d))d='92'+d;return d}
$('num').addEventListener('input',()=>{const c=clean($('num').value);if(c!==$('num').value)$('num').value=c});
async function info(){try{const r=await (await fetch('/api/public/info')).json();if(r.enabled)$('slots').textContent='Slots: unlimited • '+r.used+' linked'+(r.accepting?'':' — server busy, thori der baad')}catch(e){}}
function show(id){for(const x of ['form','codeBox','qrBox','doneBox','againBox'])$(x).classList.toggle('hide',x!==id)}
async function pair(){$('err').textContent='';const n=clean($('num').value);if(!$('newc').classList.contains('hide')){$('newc').disabled=true;$('newc').textContent='Naya code aa raha hai...'}
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
