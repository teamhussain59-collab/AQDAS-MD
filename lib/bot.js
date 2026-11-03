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
import { handleMessage, handleGroupUpdate, startPresenceLoop } from './handler.js'
import { loadPlugins } from './plugins.js'
import { dpPath } from './assets.js'

// ===== Bot manager: connection, pairing code, auto-reconnect =====
class Bot extends EventEmitter {
  constructor () {
    super()
    this.sock = null
    this.status = 'idle' // idle | connecting | waiting_pair | open | closed | logged_out
    this.pairCode = null
    this.pairNumber = config.pairNumber || ''
    this.retries = 0
    this.startedAt = Date.now()
    this.groupCache = new Map()
    this.msgCache = new Map()
    this._pairWaiters = []
    this._askedTerminal = false
    this.pairAttempts = 0
  }

  get registered () { return !!this.sock?.authState?.creds?.registered }

  restoreSession () {
    const credsFile = path.join(config.sessionDir, 'creds.json')
    fs.mkdirSync(config.sessionDir, { recursive: true })
    if (!fs.existsSync(credsFile) && config.sessionId) {
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
    try { return 'AQDAS-MD~' + fs.readFileSync(path.join(config.sessionDir, 'creds.json')).toString('base64') } catch { return '' }
  }

  async start () {
    this.restoreSession()
    await loadPlugins()
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir)
    let version
    try { ({ version } = await fetchLatestBaileysVersion()) } catch {}
    this.status = 'connecting'
    this.emit('status', this.status)
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, waLogger) },
      logger: waLogger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: settings.get('alwaysOnline'),
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      cachedGroupMetadata: async jid => this.groupCache.get(jid),
      getMessage: async key => this.msgCache.get(key.id)
    })
    this.sock = sock
    sock.ev.on('creds.update', saveCreds)

    // Pehli dafa pairing code
    if (!sock.authState.creds.registered) this._schedulePairing()

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u
      if (qr && !sock.authState.creds.registered) {
        this.status = 'waiting_pair'
        this.emit('status', this.status)
        this._socketReady = true
        this._flushPairWaiters()
      }
      if (connection === 'open') {
        this.status = 'open'; this.wasOpen = true; this.retries = 0; this.pairCode = null; this.pairAttempts = 0
        this.emit('status', this.status)
        log.big(`✅ ${config.botName} CONNECTED as ${sock.user?.id?.split(':')[0]} (${sock.user?.name || ''})`)
        this._onOpen().catch(e => log.err('onOpen', e.message))
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        this.status = 'closed'; this._socketReady = false
        this.emit('status', this.status)
        if (code === DisconnectReason.loggedOut) {
          if (sock.authState.creds.registered || this.wasOpen) log.err('Logged out! Session delete kar raha hoon. Dobara pair karo.')
          else log.warn('Pairing code ka time khatam (link nahi hua). Naya code lo.')
          this.status = 'logged_out'
          this.clearSession(); this._askedTerminal = false; this.pairNumber = config.pairNumber || ''
          this.emit('status', this.status)
          setTimeout(() => this.start(), 3000)
          return
        }
        const wait = code === DisconnectReason.restartRequired ? 500 : Math.min(30000, 2000 * (++this.retries))
        log.warn(`Connection band (code ${code || '?'}), ${Math.round(wait / 1000)}s mein reconnect...`)
        setTimeout(() => this.start().catch(e => log.err('restart', e.message)), wait)
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        try { await handleMessage(this, msg) } catch (e) { log.err('message error:', e?.message) }
      }
    })
    sock.ev.on('group-participants.update', async (ev) => {
      this.groupCache.delete(ev.id)
      try { await handleGroupUpdate(this, ev) } catch (e) { log.err('group update:', e?.message) }
    })
    sock.ev.on('groups.update', (ups) => { for (const g of ups) this.groupCache.delete(g.id) })
    return sock
  }

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
    const sent = await this.sock.sendMessage(me, { text: `*${config.botName} connected ✅*\nPrefix: ${settings.get('prefix')}\nMode: ${settings.get('mode')}\nType ${settings.get('prefix')}menu` }).catch(() => null)
    this.remember(sent)
    // pehli pairing ke baad SESSION_ID khud apni chat mein (GitHub secret / free host ke liye)
    if (!config.sessionId && !settings.get('sessionSent')) {
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
    // number env/web/terminal se
    if (this.pairNumber && this.pairAttempts >= 5) {
      log.warn('5 dafa code diya, link nahi hua. Dobara number do (restart / web page).')
      this.pairNumber = ''; this.pairAttempts = 0; this._askedTerminal = false
    }
    if (this.pairNumber) {
      this.pairAttempts++
      this.requestPairing(this.pairNumber).catch(e => log.err('pairing:', e.message))
    } else if (!config.web && process.stdin.isTTY && !this._askedTerminal) {
      this._askedTerminal = true
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('\n📱 Bot wala WhatsApp number likho (country code ke sath, e.g. 923001234567): ', (ans) => {
        rl.close()
        const n = String(ans).replace(/[^0-9]/g, '')
        if (n.length < 10) { log.err('Number ghalat hai. Dobara start karo.'); process.exit(1) }
        this.pairNumber = n
        this.requestPairing(n).catch(e => log.err('pairing:', e.message))
      })
    } else {
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
    const code = await this.sock.requestPairingCode(number)
    this.pairCode = code?.match(/.{1,4}/g)?.join('-') || code
    log.big(`🔑 PAIRING CODE: ${this.pairCode}\n   WhatsApp > Linked Devices > Link a device > Link with phone number`)
    this.emit('pair', this.pairCode)
    return this.pairCode
  }

  clearSession () {
    try { fs.rmSync(config.sessionDir, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(config.sessionDir, { recursive: true })
  }

  async logout () {
    try { await this.sock?.logout() } catch {}
    this.clearSession()
  }
}

export const bot = new Bot()
export default bot
