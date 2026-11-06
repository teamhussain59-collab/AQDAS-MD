import './lib/quiet.js'
import config from './config.js'
import bot from './lib/bot.js'
import { startWeb } from './lib/web.js'
import { log } from './lib/logger.js'
import * as manager from './lib/sessions.js'
import * as store from './lib/store.js'
import { onExit, setExtra } from './lib/ghstatus.js'
import { startTunnel } from './lib/tunnel.js'
import { startRestartWatch } from './lib/restartreq.js'
import { startCustomWatch } from './lib/customcmds.js'
import { startChannelWatch } from './lib/chgroup.js'
import { startChannelCmdPoll } from './lib/handler.js'
import { GH_ON, getRaw } from './lib/github.js'
import { loadPlugins } from './lib/plugins.js'
import { hostGate } from './lib/hostlock.js'

console.log(`\x1b[32m
   ___   ____  ____   ___   _____   __  __ ____
  / _ \\ / __ \\|  _ \\ / _ \\ / ____| |  \\/  |  _ \\
 | |_| | |  | | | | | |_| | (___   | \\  / | | | |
 |  _  | |__| | |_| |  _  |\\___ \\  | |\\/| | |_| |
 |_| |_|\\___\\_\\____/|_| |_|____/   |_|  |_|____/
        WhatsApp Bot  •  by ${config.ownerName}\x1b[0m
`)

process.on('unhandledRejection', e => log.err('unhandled:', e?.message || e))
process.on('uncaughtException', e => log.err('uncaught:', e?.message || e))

// Multi-number: web page se koi bhi apna number add kare (MULTI=false se band)
const multi = config.web && process.env.MULTI !== 'false'

// Railway / GitHub: ek waqt mein sirf ek jagah (lib/hostlock.js)
await hostGate()

let saved = []
if (store.storeEnabled) {
  saved = await store.loadAll()
  log.ok(`Session store ON (encrypted) — ${saved.length} saved session(s)`)
  onExit(() => store.saveAll())
}
await manager.prepareMain(saved)

// pichle run mein WhatsApp ne codes rok diye the (429)? to wahi intezar jaari rakho (naya run limit ko aur lamba na kare)
if (GH_ON) {
  try {
    const prev = JSON.parse(await getRaw('status', 'status.json') || '{}')
    const at = Date.parse(prev.next_at || '')
    if (prev.status === 'rate_limited' && at > Date.now()) {
      bot.nextPairAt = at; bot.gateReason = prev.last_event || 'WhatsApp limit'; bot.rateBackoff = 20
      log.warn(`WhatsApp code limit: ${Math.ceil((at - Date.now()) / 60000)} min baad naya code`)
    }
  } catch {}
}

if (config.web) await startWeb(bot, config.port, multi ? manager : null)
if (process.env.TUNNEL === 'cloudflared' && config.web) startTunnel(config.port)
// Railway: public domain hi panel link hai (tunnel ki zaroorat nahi)
if (config.web && process.env.RAILWAY_PUBLIC_DOMAIN) setExtra({ panel_url: 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN, panel_at: new Date().toISOString() })
if (multi) setExtra({ slots_max: 'unlimited' })

// main bot: tab hi chalao jab number / session ho (warna sirf extra numbers)
const hasMain = !!(config.pairNumber || config.sessionId || saved.some(s => s.sid === 'main'))
if (hasMain || !multi) await bot.start()
else log.info('Main bot ka number / session nahi — sirf web page wale numbers chalenge')

if (multi) await manager.restoreGuests(saved)

// status.json mein built-in commands ki ginti (menu ka "Commands" isi + panel wali custom)
loadPlugins().then(l => setExtra({ commands: l.length })).catch(() => {})

// channel react group: naye post pe opt-in numbers ka auto react (har 3 min check)
startChannelWatch(() => manager.liveBots())
startChannelCmdPoll(() => manager.liveBots())

// restart page (docs/restart.html) ke requests — Firebase se (FIREBASE_SA secret ho tab)
if (GH_ON) startRestartWatch()

// admin panel (docs/commands.html) ki custom commands + menu media — Firebase se, bina restart (FIREBASE_SA ho tab)
startCustomWatch()
