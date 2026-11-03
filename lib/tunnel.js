// ===== Public link (cloudflared quick tunnel) — GitHub Actions run ke andar web panel ko internet pe laata hai =====
import { spawn } from 'child_process'
import { log } from './logger.js'
import { setExtra } from './ghstatus.js'

let child = null
let url = null
export const tunnelUrl = () => url

export function startTunnel (port) {
  const bin = process.env.CLOUDFLARED_PATH || 'cloudflared'
  const run = () => {
    url = null
    child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] })
    const onData = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (m && m[0] !== url) {
        url = m[0]
        log.big(`🌐 PUBLIC PANEL: ${url}`)
        setExtra({ panel_url: url, panel_at: new Date().toISOString() })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', e => log.warn('cloudflared nahi chala:', e.message))
    child.on('exit', (code) => {
      log.warn(`cloudflared band hua (code ${code}), 15s mein dobara...`)
      url = null
      setExtra({ panel_url: null })
      setTimeout(run, 15000)
    })
  }
  run()
  for (const s of ['exit']) process.once(s, () => { try { child?.kill() } catch {} })
}
