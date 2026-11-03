import config from './config.js'
import bot from './lib/bot.js'
import { startWeb } from './lib/web.js'
import { log } from './lib/logger.js'

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

if (config.web) await startWeb(bot)
await bot.start()
