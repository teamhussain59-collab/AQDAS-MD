import config from '../config.js'
import { log } from './logger.js'

const history = new Map() // chat -> last messages (thori memory)

export const AQDAS_AI = `You are "AQDAS AI", a friendly WhatsApp assistant made by AQDAS HACKER, chatting on behalf of this WhatsApp number. Reply in the same language and script the user writes in (Roman Urdu, Urdu, or English). Keep replies short and natural (1-4 sentences), warm and respectful, no markdown headings. If asked who you are, say you are AQDAS AI by AQDAS HACKER.`
// Key: OPENROUTER_API_KEY (GitHub secret / .env) — woh na ho to website admin wali key (Firestore settings/openrouter,
// bot ke FIREBASE_SA se, 10 min cache). Key kabhi log / reply mein nahi aati.
let keyFn = null
export function _setKeyFn (fn) { keyFn = fn } // tests
export async function aiKey () {
  if (config.openrouterKey) return config.openrouterKey
  try { const fn = keyFn || (await import('./customcmds.js')).openrouterKeyFromFirestore; return String((await fn()) || '') } catch { return '' }
}
export const AI_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK || 'openrouter/free'
const RETRY_STATUS = [402, 404, 408, 429, 500, 502, 503, 504]
export async function askAI (chatId, prompt, { fetchImpl = fetch, key, model = config.openrouterModel, system = null, keep = 8 } = {}) {
  if (key === undefined) key = await aiKey()
  if (!key) throw new Error('AI key nahi mili: GitHub secret OPENROUTER_API_KEY (ya website admin mein OpenRouter key) daalo')
  const past = history.get(chatId) || []
  const messages = [
    { role: 'system', content: system || `You are ${config.botName}, a friendly WhatsApp assistant made by ${config.ownerName}. Reply short and helpful. If the user writes Roman Urdu, reply in Roman Urdu.` },
    ...past, { role: 'user', content: prompt }
  ]
  const call = (m) => fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/aqdas-md', 'X-Title': config.botName },
    body: JSON.stringify({ model: m, messages, max_tokens: 800 }),
    signal: AbortSignal.timeout(60000)
  })
  const t0 = Date.now()
  let used = model
  let res = await call(model)
  let data = await res.json().catch(() => ({}))
  // model busy / credit khatam / model hat gaya: ek dafa free model se
  if (!res.ok && RETRY_STATUS.includes(res.status) && AI_FALLBACK_MODEL && model !== AI_FALLBACK_MODEL) {
    log.warn(`AI: ${model} ne ${res.status} diya, ${AI_FALLBACK_MODEL} try kar raha hoon`)
    used = AI_FALLBACK_MODEL
    res = await call(AI_FALLBACK_MODEL)
    data = await res.json().catch(() => ({}))
  }
  if (!res.ok) { log.warn(`AI error ${res.status} (${used})`); throw new Error(data?.error?.message || `OpenRouter error ${res.status}`) }
  const answer = data?.choices?.[0]?.message?.content?.trim()
  if (!answer) throw new Error('AI ne jawab nahi diya')
  log.info(`AI: jawab ${answer.length} chars (${used}, ${Date.now() - t0} ms)`)
  history.set(chatId, [...past, { role: 'user', content: prompt }, { role: 'assistant', content: answer }].slice(-keep))
  return answer
}
export function clearAI (chatId) { history.delete(chatId) }
