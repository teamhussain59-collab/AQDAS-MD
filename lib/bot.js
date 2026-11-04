import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { EventEmitter } from 'events'
import makeWASocket, {
  useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers, makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'
import config from '../config.js'
import { waLogger, log } from './logger.js'
import * as settings from './settings.js'
import { runAs } from './ctx.js'
import { wrapSend } from './safemode.js'
import { handleMessage, handleGroupUpdate, startPresenceLoop, wantUpsert } from './handler.js'
import { loadPlugins } from './plugins.js'
import { dpPath } from './assets.js'
import { publishStatus, statusEnabled, publishQrPng } from './ghstatus.js'

let waVersion = null
async function getVersion () {
  if (waVersion) return waVersion
  try { ({ version: waVersion } = await fetchLatestBaileysVersion()) } catch {}
  return waVersion
}

// ===== Bot: ek WhatsApp number = ek Bot (connection, pairing code, auto-reconnect) =====
// id 'main' = asli bot (PAIR_NUMBER / SESSION_ID). Baaki = web page se add hue numbers (guest).
export class Bot extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.id = opts.id || 'main'
    this.isMain = this.id === 'main'
    this.sessionDir = opts.sessionDir || config.sessionDir
    this.basePairNumber = opts.pairNumber ?? (this.isMain ? (config.pairNumber || '') : '')
    this.oneShot = !!opts.oneShot // guest: code expire = khatam (dobara web se mango)
    // 'code' = pairing code (default), 'qr' = QR scan (dusre screen se; fallback: PAIR_MODE=qr)
    this.nextPairAt = 0
    this.unusedCodes = 0
    this.rateBackoff = 0
    this.pairMode = opts.pairMode || (this.isMain ? (process.env.PAIR_MODE || 'code') : 'code')
    this.qr = null
    this.sock = null
    this.status = 'idle' // idle | connecting | waiting_pair | open | closed | logged_out | stopped
    this.pairCode = null
    this.pairNumber = this.basePairNumber
    this.retries = 0
    this.startedAt = Date.now()
    this.groupCache = new Map()
    this.msgCache = new Map()
    this._pairWaiters = []
    this._askedTerminal = false
    this.pairAttempts = 0
    this.stopped = false
    this.wasOpen = false
    // GitHub Actions mein web page se pair hota hai, is liye zyada codes
    this.maxPairAttempts = statusEnabled ? 40 : 5
  }

  get registered () { return !!this.sock?.authState?.creds?.registered }
  get number () { return this.sock?.user?.id?.split(':')[0] || this.pairNumber || '' }

  _pub (status, extra = {}) { if (this.isMain) publishStatus(status, { number: this.pairNumber, ...extra }) }

  restoreSession () {
    const credsFile = path.join(this.sessionDir, 'creds.json')
    fs.mkdirSync(this.sessionDir, { recursive: true })
    if (this.isMain && !fs.existsSync(credsFile) && config.sessionId) {
      try {
        const raw = config.sessionId.replace(/^AQDAS[-_]MD[~:_-]?/i, '')
        const json = Buffer.from(raw, 'base64').toString('utf8')
        JSON.parse(json)
        fs.writeFileSync(credsFile, json)
        log.ok('SESSION_ID se session restore ho gaya')
      } catch { log.err('SESSION_ID ghalat hai, ignore kar diya') }
    }
  }

  sessionString () {
    try { return 'AQDAS-MD~' + fs.readFileSync(path.join(this.sessionDir, 'creds.json')).toString('base64') } catch { return '' }
  }

  async start () {
    if (this.stopped) return
    this.restoreSession()
    await loadPlugins()
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir)
    const version = await getVersion()
    if (this.stopped) return
    this.status = 'connecting'
    this.emit('status', this.status)
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, waLogger) },
      logger: waLogger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome'),
      // pairing code zyada der valid rahe (har QR ref 40s, ~4 min per code)
      qrTimeout: 40000,
      markOnlineOnConnect: runAs(this.id, () => settings.get('alwaysOnline')),
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      cachedGroupMetadata: async jid => this.groupCache.get(jid),
      getMessage: async key => this.msgCache.get(key.id)
    })
    wrapSend(sock, this.id) // safe mode: outgoing messages ki had (default ON)
    this.sock = sock
    sock.ev.on('creds.update', async (u) => {
      await saveCreds()
      this.emit('creds')
      if (u?.registered && this.status !== 'open' && !this.wasOpen && !this._linkAnnounced) {
        this._linkAnnounced = true
        this.lastEvent = 'phone ne code accept kiya, link ho raha hai'
        log.ok(`[${this.tag}] Pairing code accept hua, link ho raha hai...`)
        this._pub('linking', { event: this.lastEvent })
        this.emit('linking')
      }
    })

    // Pairing diagnostics (sirf link hone tak): server se aane wale frames ke tag/type (koi content / key nahi)
    if (!sock.authState.creds.registered) {
      this.diag = []
      const mask = s => String(s || '').replace(/\d{6,}/g, m => '*'.repeat(m.length - 4) + m.slice(-4))
      const rec = (kind) => (n) => {
        if (sock.authState.creds.registered && this.wasOpen) return
        const kids = Array.isArray(n?.content) ? n.content.map(c => c?.tag + (c?.attrs?.stage ? '[' + c.attrs.stage + ']' : '')).join('+') : ''
        const e = `${new Date().toISOString().slice(11, 19)} ${kind}:${n?.attrs?.type || ''}${kids ? ' <' + kids + '>' : ''}${n?.attrs?.code ? ' code=' + n.attrs.code : ''}`
        this.diag.push(mask(e)); if (this.diag.length > 30) this.diag.shift()
        this.emit('diag', this.diag)
      }
      for (const k of ['iq', 'notification', 'stream:error', 'failure', 'success', 'ib', 'xmlstreamend']) sock.ws.on('CB:' + k, rec(k))
    }

    // Pehli dafa pairing code
    clearTimeout(this._gateT)
    if (!sock.authState.creds.registered) { this._pub('starting', { event: this.lastEvent }); if (this.pairMode === 'code') this._schedulePairing() } else this._pub(this.wasOpen ? 'reconnecting' : 'starting', { event: this.lastEvent })

    sock.ev.on('connection.update', async (u) => {
      if (sock !== this.sock) return
      const { connection, lastDisconnect, qr } = u
      if (u.aqdasRegRefresh) {
        this.lastEvent = 'reg refresh: ' + u.aqdasRegRefresh
        log.info(`[${this.tag}] WhatsApp companion_reg_refresh: ${u.aqdasRegRefresh}`)
        if (this.pairMode === 'code') this._pub('waiting_pair', { code: this.pairCode, event: this.lastEvent })
      }
      if (qr && !sock.authState.creds.registered) {
        this.status = 'waiting_pair'
        this.emit('status', this.status)
        this._socketReady = true
        this._flushPairWaiters()
        if (this.pairMode === 'qr') {
          this.qr = qr; this.qrAt = Date.now()
          this.emit('qr', qr)
          if (this.isMain) { if (!this._qrLogged) { this._qrLogged = true; log.big('📷 QR ready — GitHub web page pe scan karo (Linked devices > Link a device)') } this._pub('waiting_qr', { qr, event: this.lastEvent }); publishQrPng(qr) }
        }
      }
      if (connection === 'open') {
        this.status = 'open'; this.wasOpen = true; this.retries = 0; this.pairCode = null; this.pairAttempts = 0; this.qr = null; this.unusedCodes = 0
        this.emit('status', this.status)
        this.emit('open')
        log.big(`✅ ${config.botName} CONNECTED ${this.isMain ? '' : '(extra number) '}as ${this.isMain ? sock.user?.id?.split(':')[0] : '****' + this.number.slice(-4)} (${sock.user?.name || ''})`)
        runAs(this.id, () => this._onOpen()).catch(e => log.err('onOpen', e.message))
        this._pub('connected', { number: this.number })
        if (this.isMain && this.pairMode === 'qr') publishQrPng('')
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        const why = lastDisconnect?.error?.message || ''
        const hadCode = !!this.pairCode && !sock.authState.creds.registered
        this.status = 'closed'; this._socketReady = false
        if (this.stopped) { this.status = 'stopped'; return }
        log.warn(`[${this.tag}] connection close: code ${code || '?'} ${why}${hadCode ? ' (pairing code pending tha)' : ''}`)
        this.lastEvent = `close ${code || '?'}${why ? ' ' + why.slice(0, 80) : ''}${hadCode ? ' (code pending)' : ''}`
        if (hadCode) this.pairCode = null
        this.emit('closed', code, why)
        this.qr = null
        this.emit('status', this.status)
        // Abhi link nahi hua (pairing chal rahi thi): code ka time khatam / connection toota.
        // Ye logout nahi hai. Adhoore creds hata ke naya socket + naya code (purane creds se login try = 401).
        if (!sock.authState.creds.registered && !this.wasOpen && code !== DisconnectReason.restartRequired) {
          if (this.oneShot) {
            log.warn(`[${this.tag}] Pairing code ka time khatam, link nahi hua.`)
            this.emit('pair_failed', code)
            return
          }
          log.warn(code === DisconnectReason.timedOut ? 'Pairing code ka time khatam (link nahi hua). Naya code aa raha hai...' : `Pairing ke dauran connection band (code ${code || '?'}). Naya code aa raha hai...`)
          if (!this.pairNumber) this.pairNumber = this.basePairNumber
          setTimeout(() => { if (this.stopped) return; this.clearSession(); this.start().catch(e => log.err('restart', e.message)) }, 2500)
          return
        }
        if (code === DisconnectReason.loggedOut) {
          log.err(`[${this.tag}] Logged out! Session delete kar raha hoon.${this.isMain ? ' Dobara pair karo.' : ''}`)
          this.status = 'logged_out'
          this._pub('logged_out', { event: this.lastEvent })
          this.clearSession(); this._askedTerminal = false; this.pairNumber = this.basePairNumber; this.wasOpen = false
          this.emit('status', this.status)
          this.emit('logged_out')
          if (!this.isMain) { this.stopped = true; return }
          setTimeout(() => this.start(), 3000)
          return
        }
        if (code === DisconnectReason.restartRequired && !this.wasOpen) { log.ok(`[${this.tag}] Pairing kamyab, WhatsApp restart maang raha hai (normal). Reconnect...`); this._pub('linking', { event: 'pair success, restart (515)' }) }
        const wait = code === DisconnectReason.restartRequired ? 1500 : Math.min(30000, 2000 * (++this.retries))
        log.warn(`[${this.tag}] Connection band (code ${code || '?'}), ${Math.round(wait / 1000)}s mein reconnect...`)
        setTimeout(() => this.start().catch(e => log.err('restart', e.message)), wait)
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        // 'append' = bot offline/restart ke dauran aaye messages: sirf taaza status lo (warna status seen/react miss)
        if (!wantUpsert(msg, type)) continue
        try { await runAs(this.id, () => handleMessage(this, msg)) } catch (e) { log.err('message error:', e?.message) }
      }
    })
    sock.ev.on('group-participants.update', async (ev) => {
      this.groupCache.delete(ev.id)
      try { await runAs(this.id, () => handleGroupUpdate(this, ev)) } catch (e) { log.err('group update:', e?.message) }
    })
    sock.ev.on('groups.update', (ups) => { for (const g of ups) this.groupCache.delete(g.id) })
    return sock
  }

  get tag () { return this.isMain ? 'main' : 'num ****' + String(this.number).slice(-4) }

  async groupMeta (jid) {
    if (this.groupCache.has(jid)) return this.groupCache.get(jid)
    const meta = await this.sock.groupMetadata(jid)
    this.groupCache.set(jid, meta)
    return meta
  }

  remember (sent) { if (sent?.key?.id) { this.msgCache.set(sent.key.id, sent.message); if (this.msgCache.size > 500) this.msgCache.delete(this.msgCache.keys().next().value) } }

  async _onOpen () {
    startPresenceLoop(this)
    if (settings.get('setDpOnFirstConnect') && !settings.get('dpSet')) {
      try {
        await this.sock.updateProfilePicture(this.sock.user.id.split(':')[0] + '@s.whatsapp.net', fs.readFileSync(dpPath()))
        settings.set('dpSet', true)
        log.ok('Bot ka DP laga diya (media/dp.jpg)')
      } catch (e) { log.warn('DP set nahi hua:', e.message) }
    }
    const me = this.sock.user.id.split(':')[0] + '@s.whatsapp.net'
    const welcome = this.isMain
      ? `*${config.botName} connected ✅*\nPrefix: ${settings.get('prefix')}\nMode: ${settings.get('mode')}\nType ${settings.get('prefix')}menu`
      : `*${config.botName} connected ✅*\nBot ab tumhare number pe chal raha hai.\nType ${settings.get('prefix')}menu\n\nBand karna ho: WhatsApp > Linked devices > is device pe tap > Log out. Bot aur uska data foran hat jayega.${config.channel ? '\n\n📢 Channel: ' + config.channel : ''}${settings.get('chGroup') ? '\n\n🤝 Aap react group mein ho. Nikalna ho to ' + settings.get('prefix') + 'chleave likho' : ''}`
    const sent = await this.sock.sendMessage(me, { text: welcome }).catch(() => null)
    this.remember(sent)
    // pehli pairing ke baad SESSION_ID khud apni chat mein (sirf main bot, jab auto-save store band ho)
    if (this.isMain && !config.sessionId && !settings.get('sessionSent') && !process.env.SESSION_KEY) {
      const s = this.sessionString()
      if (s) {
        await this.sock.sendMessage(me, { text: s }).catch(() => {})
        await this.sock.sendMessage(me, { text: '☝️ Ye tumhara *SESSION_ID* hai. GitHub secret `SESSION_B64` (ya server ke `SESSION_ID` env) mein paste karo.\n⚠️ Kisi ko mat dena — is se koi bhi bot number chala sakta hai.' }).catch(() => {})
        settings.set('sessionSent', true)
        log.ok('SESSION_ID bot ki apni chat (Message yourself) mein bhej diya')
      }
    }
  }

  _schedulePairing () {
    // WhatsApp limit: bohat codes = 429 rate-overlimit. Gate ke peeche intezar
    const wait = this.nextPairAt - Date.now()
    if (this.pairNumber && wait > 0) {
      clearTimeout(this._gateT)
      this._gateT = setTimeout(() => { if (!this.stopped && !this.registered && this.sock) this._schedulePairing() }, wait + 1000)
      this._pub('rate_limited', { event: this.gateReason, next_at: new Date(this.nextPairAt).toISOString() })
      return
    }
    // number env/web/terminal se
    if (this.pairNumber && this.pairAttempts >= this.maxPairAttempts) {
      log.warn(this.maxPairAttempts + ' dafa code diya, link nahi hua. Dobara number do (restart / web page).')
      this.pairNumber = ''; this.pairAttempts = 0; this._askedTerminal = false
      this._pub('logged_out', { event: 'bohat codes, link nahi hua — run dobara chalao' })
    }
    if (this.pairNumber) {
      this.pairAttempts++
      this.requestPairing(this.pairNumber).catch(e => {
        log.err('pairing:', e.message)
        if (e.wa?.code === '429') {
          this.rateBackoff = Math.min(60, (this.rateBackoff || 10) * 2)
          this.nextPairAt = Date.now() + this.rateBackoff * 60000
          this.gateReason = `WhatsApp ne bohat codes ki wajah se ${this.rateBackoff} min ke liye rok diya (rate-overlimit)`
          this._schedulePairing()
        } else this._pub('logged_out', { event: 'code nahi bana: ' + e.message })
        this.emit('pair_error', e)
      })
    } else if (this.isMain && !config.web && process.stdin.isTTY && !this._askedTerminal) {
      this._askedTerminal = true
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('\n📱 Bot wala WhatsApp number likho (country code ke sath, e.g. 923001234567): ', (ans) => {
        rl.close()
        const n = String(ans).replace(/[^0-9]/g, '')
        if (n.length < 10) { log.err('Number ghalat hai. Dobara start karo.'); process.exit(1) }
        this.pairNumber = n
        this.requestPairing(n).catch(e => log.err('pairing:', e.message))
      })
    } else if (this.isMain) {
      log.info(`Pairing ke liye web page kholo ya PAIR_NUMBER env set karo. ${config.web ? '(web page port ' + config.port + ')' : ''}`)
    }
  }

  _waitSocketReady (ms = 30000) {
    if (this._socketReady) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WhatsApp server se connection nahi bana (timeout)')), ms)
      this._pairWaiters.push(() => { clearTimeout(t); resolve() })
    })
  }

  _flushPairWaiters () { const w = this._pairWaiters; this._pairWaiters = []; w.forEach(f => f()) }

  async requestPairing (number) {
    number = String(number).replace(/[^0-9]/g, '')
    if (number.length < 10 || number.length > 15) throw new Error('Number ghalat hai (country code ke sath likho, e.g. 923001234567)')
    if (this.registered) throw new Error('Bot pehle se linked hai')
    this.pairNumber = number
    await this._waitSocketReady()
    // WhatsApp code ko reject kare (400 / 429) to Baileys phir bhi code de deta hai — 5 sec error ka intezar
    const ws = this.sock.ws
    const errP = new Promise(resolve => {
      const h = (n) => { const e = (n.content || []).find?.(c => c.tag === 'error'); if (e) { ws.off('CB:iq,type:error', h); resolve(e.attrs) } }
      ws.on('CB:iq,type:error', h)
      setTimeout(() => { ws.off('CB:iq,type:error', h); resolve(null) }, 5000)
    })
    const code = await this.sock.requestPairingCode(number)
    const waErr = await errP
    if (waErr) throw Object.assign(new Error(`WhatsApp ne code reject kiya (${waErr.code} ${waErr.text || ''})`), { wa: waErr })
    this.rateBackoff = 0
    this.pairCode = code?.match(/.{1,4}/g)?.join('-') || code
    this.pairCodeAt = Date.now()
    if (this.isMain) log.big(`🔑 PAIRING CODE: ${this.pairCode}\n   WhatsApp > Linked Devices > Link a device > Link with phone number`)
    else log.info(`[${this.tag}] pairing code bana (web page pe dikhaya)`)
    this.emit('pair', this.pairCode)
    this._pub('waiting_pair', { code: this.pairCode, number })
    return this.pairCode
  }

  clearSession () {
    try { fs.rmSync(this.sessionDir, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(this.sessionDir, { recursive: true })
  }

  async stop () {
    this.stopped = true
    this.status = 'stopped'
    try { this.sock?.end(undefined) } catch {}
  }

  async logout () {
    try { await this.sock?.logout() } catch {}
    this.clearSession()
  }
}

export const bot = new Bot()
export default bot
