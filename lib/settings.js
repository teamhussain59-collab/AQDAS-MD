import fs from 'fs'
import path from 'path'
import config from '../config.js'
import { currentSid } from './ctx.js'

// Sab ON/OFF toggles yahan save hotay hain: data/settings.json (main) / data/s/<id>/settings.json (har extra number)
const states = new Map()
export const dir = (sid = currentSid()) => sid === 'main' ? config.dataDir : path.join(config.dataDir, 's', sid)
const file = (sid) => path.join(dir(sid), 'settings.json')

function fresh (sid) {
  const base = { ...config.defaults, prefix: config.prefix, mode: config.mode, groups: {}, dpSet: false, safeMode: true, autoAI: false, autoAIGroup: false, antiDelete: false, chGroup: false }
  // doosre logon ke number pe: DP mat badlo, har message pe react mat karo (woh khud ON kar sakte hain)
  if (sid !== 'main') Object.assign(base, { setDpOnFirstConnect: false, autoReact: false, sessionSent: true, autoStatusView: false, autoStatusReact: false })
  return base
}

export function load (sid = currentSid()) {
  if (states.has(sid)) return states.get(sid)
  let st
  try { st = { ...fresh(sid), ...JSON.parse(fs.readFileSync(file(sid), 'utf8')) } } catch { st = fresh(sid) }
  states.set(sid, st)
  return st
}

const savedHooks = []
export const onSaved = (fn) => savedHooks.push(fn)
export function save (sid = currentSid()) {
  fs.mkdirSync(dir(sid), { recursive: true })
  fs.writeFileSync(file(sid), JSON.stringify(load(sid), null, 2))
  for (const fn of savedHooks) { try { fn(sid) } catch {} }
}

export function get (k) { return load()[k] }
// Bot Maker brand: jis session pe abhi kaam ho raha hai us ka (main pe null)
config.setBrandSource(() => { try { return load().brand || null } catch { return null } })
export function set (k, v) { load()[k] = v; save(); return v }

export function group (jid) {
  const s = load()
  if (!s.groups[jid]) s.groups[jid] = { welcome: false, goodbye: false, antilink: 'off', welcomeText: '', goodbyeText: '' }
  return s.groups[jid]
}
export function setGroup (jid, k, v) { group(jid)[k] = v; save(); return v }

export function exportFor (sid) { try { return fs.readFileSync(file(sid), 'utf8') } catch { return null } }
export function importFor (sid, text) { try { JSON.parse(text); fs.mkdirSync(dir(sid), { recursive: true }); fs.writeFileSync(file(sid), text); states.delete(sid) } catch {} }
export function dropFor (sid) { states.delete(sid); if (sid !== 'main') { try { fs.rmSync(dir(sid), { recursive: true, force: true }) } catch {} } }

// sirf tests ke liye
export function _reset (obj) { states.clear(); if (obj) states.set('main', { ...fresh('main'), ...obj }) }
