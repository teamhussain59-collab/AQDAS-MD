import { pick } from './utils.js'

// Auto-react ka faisla: kis message pe kaunsa emoji (ya null)
const lastReact = new Map()
export function decideReact (msg, s, now = Date.now(), cooldownMs = 3000) {
  if (!s.autoReact) return null
  const jid = msg.key?.remoteJid || ''
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) return null
  if (msg.key.fromMe) return null
  const m = msg.message || {}
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage && Object.keys(m).length === 1) return null
  const isGroup = jid.endsWith('@g.us')
  if (s.reactScope === 'private' && isGroup) return null
  if (s.reactScope === 'group' && !isGroup) return null
  const emojis = (s.reactEmojis || []).filter(Boolean)
  if (!emojis.length) return null
  // ek chat mein 3 second mein ek dafa (ban risk kam)
  const last = lastReact.get(jid)
  if (last !== undefined && now - last < cooldownMs) return null
  lastReact.set(jid, now)
  return pick(emojis)
}
export function _resetReact () { lastReact.clear() }
