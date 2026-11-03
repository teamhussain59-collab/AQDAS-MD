// ===== Safe mode (default ON): har number ke outgoing messages pe had =====
// Max ~20 messages / minute (zyada hon to line mein intezar), text se pehle chhota random "typing" waqfa, koi bulk send nahi.
// Ban ka khatra KAM hota hai, khatam nahi. Reactions / edits / status reacts is had se bahar (halki cheezein).
import * as settings from './settings.js'

export const MAX_PER_MIN = 20
export function wrapSend (sock, sid, { sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), typing = () => 300 + Math.floor(Math.random() * 900) } = {}) {
  if (!sock || sock._safeWrapped) return sock
  const orig = sock.sendMessage.bind(sock)
  const sent = []
  let chain = Promise.resolve()
  sock.sendMessage = (jid, content, opts) => {
    const light = !!(content?.react || content?.edit || content?.delete || jid === 'status@broadcast')
    if (light || settings.load(sid).safeMode === false) return orig(jid, content, opts)
    const slot = chain.then(async () => {
      for (;;) {
        const t = now()
        while (sent.length && t - sent[0] >= 60000) sent.shift()
        if (sent.length < MAX_PER_MIN) break
        await sleep(60000 - (t - sent[0]) + 50)
      }
      sent.push(now())
      if (content?.text) await sleep(typing())
    })
    chain = slot.catch(() => {})
    return slot.then(() => orig(jid, content, opts))
  }
  sock._safeWrapped = true
  sock._safeSent = sent
  return sock
}
