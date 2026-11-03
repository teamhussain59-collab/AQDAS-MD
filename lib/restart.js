// ===== Restart (admin panel ka "🔄 Restart bot") =====
// GitHub Actions mein: naya run-bot run dispatch karo (GITHUB_TOKEN runner ke andar hi rehta hai, kabhi public nahi).
// Workflow ka concurrency group purana run (ye wala) cancel karta hai -> SIGINT/SIGTERM -> sessions save -> exit.
// Dispatch na ho sake to khud save karke band ho jao — watchdog workflow 5-15 min mein wapas chala deta hai.
import { log } from './logger.js'
import { GH_ON, gh } from './github.js'
import { shutdown } from './ghstatus.js'
import * as store from './store.js'

let pending = null
export function restartBot (who = 'admin') {
  if (pending) return pending
  pending = (async () => {
    try { await store.saveAll() } catch {}
    if (GH_ON) {
      const wf = (String(process.env.GITHUB_WORKFLOW_REF || '').split('@')[0].split('/').pop()) || 'run-bot.yml'
      const ref = process.env.GITHUB_REF_NAME || 'main'
      try {
        const r = await gh('POST', `/actions/workflows/${encodeURIComponent(wf)}/dispatches`, { ref })
        if (r.status === 204) {
          log.warn(`Restart (${who}): naya run start — ye run cancel hote waqt sessions save karega`)
          // safety: naya run 4 min mein bhi na aaye to khud band (watchdog wapas layega)
          setTimeout(() => shutdown('restart fallback'), 4 * 60000).unref?.()
          return { mode: 'dispatch' }
        }
        log.warn(`Restart dispatch nahi hua (${r.status}) — khud band ho raha hoon, watchdog wapas layega`)
      } catch (e) { log.warn('Restart dispatch fail:', e.message) }
    }
    setTimeout(() => shutdown('restart'), 1500)
    return { mode: 'exit' }
  })()
  return pending
}
