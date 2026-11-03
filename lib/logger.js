import pino from 'pino'

// Baileys ka apna logger chup rakho (sirf errors), hamara logger saaf
export const waLogger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' })

const ts = () => new Date().toLocaleTimeString('en-GB', { hour12: false })
const c = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', m: '\x1b[35m', x: '\x1b[0m', b: '\x1b[1m' }
export const log = {
  info: (...a) => console.log(`${c.c}[${ts()}]${c.x}`, ...a),
  ok: (...a) => console.log(`${c.g}[${ts()}] ✔${c.x}`, ...a),
  warn: (...a) => console.log(`${c.y}[${ts()}] !${c.x}`, ...a),
  err: (...a) => console.log(`${c.r}[${ts()}] ✖${c.x}`, ...a),
  cmd: (...a) => console.log(`${c.m}[${ts()}] ➜${c.x}`, ...a),
  big: (s) => console.log(`\n${c.b}${c.g}${s}${c.x}\n`)
}
