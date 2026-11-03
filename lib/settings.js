import fs from 'fs'
import path from 'path'
import config from '../config.js'

// Sab ON/OFF toggles yahan save hotay hain: data/settings.json
const file = () => path.join(config.dataDir, 'settings.json')
let state = null

function fresh () {
  return { ...config.defaults, prefix: config.prefix, mode: config.mode, groups: {}, dpSet: false }
}

export function load () {
  if (state) return state
  try {
    state = { ...fresh(), ...JSON.parse(fs.readFileSync(file(), 'utf8')) }
  } catch { state = fresh() }
  return state
}

export function save () {
  fs.mkdirSync(config.dataDir, { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(state, null, 2))
}

export function get (k) { return load()[k] }
export function set (k, v) { load()[k] = v; save(); return v }

export function group (jid) {
  const s = load()
  if (!s.groups[jid]) s.groups[jid] = { welcome: false, goodbye: false, antilink: 'off', welcomeText: '', goodbyeText: '' }
  return s.groups[jid]
}
export function setGroup (jid, k, v) { group(jid)[k] = v; save(); return v }

// sirf tests ke liye
export function _reset (obj) { state = obj ? { ...fresh(), ...obj } : fresh() }
