// ===== Anti-delete: koi message delete kare to us ki copy SIRF is number ki apni "Message yourself" chat mein =====
// (asal chat / group mein kabhi dobara post nahi). Sirf tab yaad rakhta hai jab .antidelete ON ho; har number ke ~500 / 3 ghante.
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { num } from './utils.js'

const stores = new Map() // sid -> Map(id -> { msg, at })
const MAX = 500, TTL = 3 * 3600 * 1000
export function remember (sid, msg) {
  if (!msg?.key?.id || msg.key.fromMe || !msg.message || msg.message.protocolMessage || msg.message.reactionMessage) return
  let m = stores.get(sid); if (!m) stores.set(sid, (m = new Map()))
  m.set(msg.key.id, { msg, at: Date.now() })
  if (m.size > MAX) m.delete(m.keys().next().value)
}
export function recall (sid, id) { const e = stores.get(sid)?.get(id); if (!e || Date.now() - e.at > TTL) return null; return e }
export const isRevoke = msg => msg?.message?.protocolMessage?.type === 0 || msg?.message?.protocolMessage?.type === 'REVOKE'

export async function onRevoke (bot, msg, { groupName } = {}) {
  const id = msg.message.protocolMessage.key?.id
  const e = id && recall(bot.id, id)
  if (!e) return false
  stores.get(bot.id)?.delete(id)
  const me = jidNormalizedUser(bot.sock.user.id)
  const o = e.msg
  const chat = o.key.remoteJid
  const who = o.pushName || ('+' + num(o.key.participantAlt || o.key.participant || o.key.remoteJidAlt || chat))
  const where = chat.endsWith('@g.us') ? `Group: ${groupName || 'group'}` : 'Private chat'
  const when = new Date(e.at).toLocaleString('en-GB', { timeZone: process.env.TZ || 'Asia/Karachi', hour12: true })
  await bot.sock.sendMessage(me, { text: `🗑️ *Deleted message pakra gaya*\n👤 ${who}\n💬 ${where}\n🕒 ${when}` })
  await bot.sock.sendMessage(me, { forward: o }).catch(async () => {
    const t = o.message?.conversation || o.message?.extendedTextMessage?.text
    if (t) await bot.sock.sendMessage(me, { text: t })
  })
  return true
}
export function _clear () { stores.clear() }
