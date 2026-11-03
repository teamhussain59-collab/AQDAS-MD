import express from 'express'
import crypto from 'crypto'
import fs from 'fs'
import config from '../config.js'
import { log } from './logger.js'
import path from 'path'
import { dpPath } from './assets.js'

// ===== Web pairing page: number daalo -> pairing code -> status =====
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }

export function createApp (bot) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '10kb' }))
  const fails = new Map(); const pairs = new Map()

  const auth = (req, res, next) => {
    const ip = req.ip
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
  app.get('/', (req, res) => res.type('html').send(PAGE))

  app.get('/api/status', auth, (req, res) => {
    const u = bot.sock?.user
    res.json({ ok: true, status: bot.status, connected: bot.status === 'open', registered: bot.registered, number: u?.id?.split(':')[0] || bot.pairNumber || null, name: u?.name || null, pairCode: bot.status === 'open' ? null : bot.pairCode, botName: config.botName })
  })

  app.post('/api/pair', auth, async (req, res) => {
    const ip = req.ip; const now = Date.now()
    const hist = (pairs.get(ip) || []).filter(t => now - t < 10 * 60000)
    if (hist.length >= 5) return res.status(429).json({ ok: false, error: '10 minute mein 5 codes ho gaye. Thora ruk ke try karo.' })
    pairs.set(ip, [...hist, now])
    try {
      const code = await bot.requestPairing(req.body?.number)
      res.json({ ok: true, code })
    } catch (e) { res.status(400).json({ ok: false, error: e.message }) }
  })

  app.get('/api/session', auth, (req, res) => {
    if (bot.status !== 'open') return res.status(400).json({ ok: false, error: 'Pehle bot connect karo' })
    res.json({ ok: true, session: bot.sessionString() })
  })

  app.post('/api/logout', auth, async (req, res) => {
    await bot.logout()
    res.json({ ok: true })
  })
  return app
}

export function startWeb (bot, port = config.port) {
  const app = createApp(bot)
  return new Promise(resolve => {
    const server = app.listen(port, '0.0.0.0', () => { log.ok(`🌐 Web pairing page: http://localhost:${port}`); resolve(server) })
    // Free host (Render) 15 min baad so jata hai: apne hi /health ko har 10 min ping
    if (config.keepAliveUrl) {
      const url = config.keepAliveUrl.replace(/\/$/, '') + '/health'
      setInterval(() => fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => {}), 10 * 60000).unref()
      log.info('Keep-alive ping on:', url)
    }
  })
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AQDAS MD • Pairing</title><link rel="icon" href="/dp.jpg">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:ui-monospace,Menlo,Consolas,monospace;background:#020805;color:#b7ffcf;display:flex;align-items:center;justify-content:center;padding:18px;
background-image:radial-gradient(circle at 50% 0,#063d1d55,transparent 60%),repeating-linear-gradient(0deg,#00ff6608 0 1px,transparent 1px 4px)}
.card{width:100%;max-width:420px;background:#04130bdd;border:1px solid #1aff7a55;border-radius:18px;padding:24px;box-shadow:0 0 40px #00ff6626}
.logo{width:110px;height:110px;border-radius:50%;display:block;margin:0 auto 10px;border:2px solid #22ff88;box-shadow:0 0 25px #22ff8866}
h1{text-align:center;margin:4px 0 2px;color:#39ff8e;letter-spacing:3px;text-shadow:0 0 12px #39ff8e}
.sub{text-align:center;color:#6fdc9c;font-size:12px;margin-bottom:18px;letter-spacing:2px}
label{font-size:13px;color:#8fffbf}input{width:100%;padding:14px;margin:6px 0 14px;border-radius:10px;border:1px solid #1aff7a66;background:#010a05;color:#d9ffe7;font-size:17px;font-family:inherit}
button{width:100%;padding:14px;border:0;border-radius:10px;background:linear-gradient(90deg,#00e676,#00b0ff);color:#00140a;font-weight:700;font-size:16px;cursor:pointer;font-family:inherit}
button.ghost{background:transparent;border:1px solid #ff5c5c88;color:#ff8a8a;margin-top:10px;font-size:13px;padding:10px}
.code{font-size:34px;text-align:center;letter-spacing:6px;color:#fff;background:#00150a;border:1px dashed #39ff8e;border-radius:12px;padding:16px;margin:14px 0;text-shadow:0 0 10px #39ff8e;user-select:all}
.st{text-align:center;padding:10px;border-radius:10px;margin:12px 0;font-size:14px}.on{background:#00391a;color:#5cff9d}.off{background:#2a1a00;color:#ffc65c}
.err{color:#ff7b7b;font-size:13px;min-height:18px;text-align:center}.steps{font-size:12.5px;color:#9fe9bd;line-height:1.6}.hide{display:none}
textarea{width:100%;height:80px;background:#010a05;color:#9fe9bd;border:1px solid #1aff7a44;border-radius:8px;font-size:11px}
</style></head><body><div class="card">
<img class="logo" src="/dp.jpg" alt=""><h1>AQDAS MD</h1><div class="sub">BY AQDAS HACKER</div>
<div id="login"><label>Admin password</label><input id="pw" type="password" placeholder="ADMIN_PASSWORD"><button onclick="login()">Login</button></div>
<div id="main" class="hide">
 <div id="st" class="st off">Status: ...</div>
 <div id="pairBox"><label>Bot wala WhatsApp number (country code ke sath)</label><input id="num" inputmode="numeric" placeholder="923001234567">
 <button id="pb" onclick="pair()">Get Pairing Code</button>
 <div id="codeBox" class="hide"><div class="code" id="code">----</div>
 <div class="steps">1) Bot wale phone pe WhatsApp kholo<br>2) ⋮ / Settings &gt; <b>Linked devices</b> &gt; <b>Link a device</b><br>3) <b>Link with phone number instead</b> dabao<br>4) Upar wala code likho. Code ~1 minute mein expire hota hai, dobara le lo.</div></div></div>
 <div id="sessBox" class="hide"><button onclick="sess()">Show SESSION_ID (free host backup)</button><textarea id="sess" class="hide" readonly></textarea></div>
 <button class="ghost" onclick="logout()">Unlink / Logout bot</button>
</div><div class="err" id="err"></div></div>
<script>
let PW=sessionStorage.getItem('pw')||'';const $=i=>document.getElementById(i);
async function api(p,o={}){o.headers=Object.assign({'content-type':'application/json','x-admin-password':PW},o.headers||{});const r=await fetch(p,o);const j=await r.json().catch(()=>({ok:false,error:'Server error'}));if(!r.ok||!j.ok)throw new Error(j.error||'Error');return j}
async function login(){PW=$('pw').value;try{await api('/api/status');sessionStorage.setItem('pw',PW);$('login').classList.add('hide');$('main').classList.remove('hide');$('err').textContent='';poll()}catch(e){$('err').textContent=e.message}}
async function poll(){try{const s=await api('/api/status');const on=s.connected;$('st').className='st '+(on?'on':'off');
$('st').textContent=on?('✅ CONNECTED: +'+s.number+(s.name?' ('+s.name+')':'')):('⏳ Not linked — '+({waiting_pair:'pairing code ka intezar',connecting:'connect ho raha hai',closed:'reconnect ho raha hai',logged_out:'logout, dobara pair karo'}[s.status]||s.status));$('pairBox').classList.toggle('hide',on);$('sessBox').classList.toggle('hide',!on);
if(!on&&s.pairCode){$('code').textContent=s.pairCode;$('codeBox').classList.remove('hide')}}catch(e){$('err').textContent=e.message}setTimeout(poll,4000)}
async function pair(){$('err').textContent='';$('pb').disabled=true;$('pb').textContent='Code aa raha hai...';try{const j=await api('/api/pair',{method:'POST',body:JSON.stringify({number:$('num').value})});$('code').textContent=j.code;$('codeBox').classList.remove('hide')}catch(e){$('err').textContent=e.message}$('pb').disabled=false;$('pb').textContent='Get Pairing Code'}
async function sess(){try{const j=await api('/api/session');$('sess').value=j.session;$('sess').classList.remove('hide')}catch(e){$('err').textContent=e.message}}
async function logout(){if(!confirm('Bot unlink karna hai?'))return;try{await api('/api/logout',{method:'POST'})}catch(e){$('err').textContent=e.message}}
if(PW){$('pw').value=PW;login()}
</script></body></html>`
