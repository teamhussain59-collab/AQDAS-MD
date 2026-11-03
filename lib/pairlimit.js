// ===== .pair anti-spam (public command) =====
// Har banda 10 min mein 1 dafa, har target number 2 min mein 1 dafa, poore bot pe ~20 / ghanta.
// Memory mein (sab linked numbers ek hi process mein chalte hain, isliye limit sab pe ek saath).
export const USER_MS = Number(process.env.PAIR_USER_MS || 10 * 60000)
export const TARGET_MS = Number(process.env.PAIR_TARGET_MS || 2 * 60000)
export const GLOBAL_MAX = Number(process.env.PAIR_GLOBAL_MAX || 20)
export const GLOBAL_MS = 60 * 60000

const byUser = new Map() // requester id -> last time
const byTarget = new Map() // target number -> last time
let recent = [] // global timestamps (last hour)

const mins = ms => { const m = Math.ceil(ms / 60000); return m <= 1 ? '1 minute' : `${m} minute` }
const secs = ms => { const s = Math.ceil(ms / 1000); return s >= 60 ? mins(ms) : `${s} sec` }

// requesters: sender ke sab ids (phone / lid); exempt: owner (sirf user + global limit maaf, target limit sab pe)
export function check ({ requesters = [], target, exempt = false, now = Date.now() }) {
  recent = recent.filter(t => now - t < GLOBAL_MS)
  const tLast = byTarget.get(target)
  if (tLast && now - tLast < TARGET_MS) return { ok: false, reason: 'target', wait: TARGET_MS - (now - tLast), msg: `⏳ Is number ka code abhi abhi bheja gaya hai. ${secs(TARGET_MS - (now - tLast))} baad dobara try karo.` }
  if (exempt) return { ok: true }
  for (const r of requesters) {
    const last = byUser.get(r)
    if (last && now - last < USER_MS) return { ok: false, reason: 'user', wait: USER_MS - (now - last), msg: `⏳ Aap ne thori der pehle code liya tha. Spam rokne ke liye har banda 10 min mein 1 dafa .pair kar sakta hai. ${mins(USER_MS - (now - last))} baad try karo 🙏` }
  }
  if (recent.length >= GLOBAL_MAX) {
    const wait = GLOBAL_MS - (now - recent[0])
    return { ok: false, reason: 'global', wait, msg: `😅 Bot pe abhi bohat log code le rahe hain. ${mins(wait)} baad try karo.` }
  }
  return { ok: true }
}

export function note ({ requesters = [], target, exempt = false, now = Date.now() }) {
  byTarget.set(target, now)
  if (exempt) return
  for (const r of requesters) byUser.set(r, now)
  recent.push(now)
}

export function _reset () { byUser.clear(); byTarget.clear(); recent = [] }
