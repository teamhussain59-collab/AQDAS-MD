import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { log } from './logger.js'

// ===== Plugin loader: plugins/ folder ki har .js file ek ya zyada commands =====
export const commands = new Map() // name/alias -> command
export const list = []
let loaded = false
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins')

export async function loadPlugins (force = false) {
  if (loaded && !force) return list
  commands.clear(); list.length = 0
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
  for (const f of files) {
    try {
      const mod = await import(pathToFileURL(path.join(dir, f)).href + (force ? `?v=${Date.now()}` : ''))
      const cmds = Array.isArray(mod.default) ? mod.default : [mod.default]
      for (const c of cmds) {
        if (!c?.name || typeof c.run !== 'function') continue
        c.category = c.category || 'other'
        c.file = f
        list.push(c)
        for (const n of [c.name, ...(c.alias || [])]) commands.set(n.toLowerCase(), c)
      }
    } catch (e) { log.err(`plugin ${f} load nahi hua:`, e.message) }
  }
  loaded = true
  log.ok(`${list.length} commands loaded (${files.length} plugin files)`)
  return list
}
