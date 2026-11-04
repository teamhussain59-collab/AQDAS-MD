import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { log } from './logger.js'

// ===== Plugin loader: plugins/ folder ki har .js file ek ya zyada commands =====
export const commands = new Map() // name/alias -> command
export const list = []
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins')

// Har linked number apna bot.start() chalata hai aur sab ek saath loadPlugins() bulate hain. Pehle har call
// commands.clear() karke apni copy push karti thi (await ke beech) — 3 numbers = menu mein har command 3 baar.
// Ab ek hi load chalta hai (sab callers usi promise ka intezar karte hain), aur ek naam sirf ek dafa register hota hai.
let loading = null
export function loadPlugins (force = false) {
  if (loading && !force) return loading
  const run = (async () => {
    if (loading && force) { try { await loading } catch {} }
    const found = []
    const map = new Map()
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    for (const f of files) {
      try {
        const mod = await import(pathToFileURL(path.join(dir, f)).href + (force ? `?v=${Date.now()}` : ''))
        const cmds = Array.isArray(mod.default) ? mod.default : [mod.default]
        for (const c of cmds) {
          if (!c?.name || typeof c.run !== 'function') continue
          const key = c.name.toLowerCase()
          if (found.some(x => x.name.toLowerCase() === key)) { log.warn(`command ${c.name} (${f}) do dafa hai, doosri skip`); continue }
          c.category = c.category || 'other'
          c.file = f
          found.push(c)
          for (const n of [c.name, ...(c.alias || [])]) if (!map.has(n.toLowerCase())) map.set(n.toLowerCase(), c)
        }
      } catch (e) { log.err(`plugin ${f} load nahi hua:`, e.message) }
    }
    // poori list tayyar hone ke baad ek dafa badlo (beech mein koi aadhi / dugni list na dekhe)
    commands.clear(); for (const [k, v] of map) commands.set(k, v)
    list.length = 0; list.push(...found)
    log.ok(`${list.length} commands loaded (${files.length} plugin files)`)
    return list
  })()
  loading = run
  run.catch(() => { if (loading === run) loading = null })
  return run
}
