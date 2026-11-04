// Memory guard: slots ki ginti nahi — nayi pairing tab tak jab tak runner pe RAM bachi ho
import fs from 'fs'
import os from 'os'
import v8 from 'v8'

export const MIN_FREE_MB = Math.max(100, Number(process.env.MIN_FREE_MB || 700))
export const MAX_HEAP_PCT = Math.min(95, Math.max(50, Number(process.env.MAX_HEAP_PCT || 85)))
const MB = 1048576

// MemAvailable (Linux) asli "kitni RAM aur mil sakti hai" hai; os.freemem() cache ko used ginta hai
export function availableMB (read = p => fs.readFileSync(p, 'utf8')) {
  try { const m = /MemAvailable:\s+(\d+)\s*kB/.exec(read('/proc/meminfo')); if (m) return Math.round(Number(m[1]) / 1024) } catch {}
  return Math.round(os.freemem() / MB)
}

let probe = { availableMB, heap: () => v8.getHeapStatistics() }
export const _setProbe = p => { probe = { ...probe, ...p } } // tests

// startup pe (koi guest nahi) process ka RSS — per-session andaze ke liye
let baseRss = null
export const markBaseline = () => { baseRss = process.memoryUsage().rss }

export function check () {
  const free = probe.availableMB()
  const h = probe.heap()
  const heapPct = Math.round(h.used_heap_size / h.heap_size_limit * 100)
  if (free < MIN_FREE_MB) return { ok: false, free, heapPct, reason: `Server ki memory abhi full hai (sirf ${free} MB khali). Thori der baad dobara try karo 🙏` }
  if (heapPct >= MAX_HEAP_PCT) return { ok: false, free, heapPct, reason: `Bot abhi bohat numbers chala raha hai (memory ${heapPct}%). Thori der baad dobara try karo 🙏` }
  return { ok: true, free, heapPct }
}

// status.json ke liye: asli numbers + kitne aur numbers ka andaza
export function stats (sessions) {
  const free = probe.availableMB()
  const h = probe.heap()
  const rss = process.memoryUsage().rss
  const per = sessions > 0 && baseRss ? Math.max(15, Math.round((rss - baseRss) / MB / sessions)) : null
  const perGuess = per || 60 // naya run: jab tak naap na ho, 60 MB/number maan lo
  const byRam = Math.max(0, Math.floor((free - MIN_FREE_MB) / perGuess))
  const heapLeft = Math.max(0, h.heap_size_limit * MAX_HEAP_PCT / 100 - h.used_heap_size) / MB
  const byHeap = Math.floor(heapLeft / Math.max(10, perGuess * 0.6)) // heap RSS ka ~60%
  return {
    sessions,
    free_mb: free,
    total_mb: Math.round(os.totalmem() / MB),
    rss_mb: Math.round(rss / MB),
    heap_mb: Math.round(h.used_heap_size / MB),
    heap_limit_mb: Math.round(h.heap_size_limit / MB),
    per_session_mb: per,
    room_for: Math.min(byRam, byHeap)
  }
}
