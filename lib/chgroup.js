// ===== Channel react group (opt-in) =====
// Sirf woh numbers jinhon ne khud shamil hona chuna (panel ka checkbox ya apne number se .chjoin) — settings.chGroup = true.
// Owner (OWNER_NUMBER) ka .chreact / naya channel post: har opt-in, connected number ek dafa react karta hai,
// numbers ke beech random 3-15 sec ka gap. Kisi number se ek post pe ek se zyada react kabhi nahi.
import config from '../config.js'
import * as settings from './settings.js'
import { log } from './logger.js'
import { GH_ON, putFile, getRaw } from './github.js'
import { setExtra } from './ghstatus.js'

export const LINK = /whatsapp\.com\/channel\/([A-Za-z0-9]+)(?:\/(\d+))?/i
export const DEFAULT_EMOJIS = ['🥰', '🐣', '🤨', '❤️', '🔥']
const jids = new Map()
const reacted = new Set() // sid|invite|post
const running = new Set() // invite|post
let sleep = ms => new Promise(r => setTimeout(r, ms))
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timeout')), ms))])
export function _setSleep (fn) { sleep = fn }
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
export const isOptedIn = sid => !!settings.load(sid).chGroup
export const splitEmojis = s => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(String(s || ''))].map(x => x.segment).filter(g => /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(g))

export async function channelJid (sock, invite) {
  if (jids.has(invite)) return jids.get(invite)
  const meta = await within(sock.newsletterMetadata('invite', invite), 20000, 'channel info')
  const id = meta?.id
  if (!id) throw new Error('Channel nahi mila (link check karo)')
  const v = { id, name: meta?.thread_metadata?.name?.text || meta?.name || '' }
  jids.set(invite, v)
  return v
}

export const alreadyReacted = (sid, invite, post) => reacted.has(`${sid}|${invite}|${post}`)

// ek number se react (ek post pe ek hi dafa)
export async function reactOne (b, invite, post, emoji) {
  const k = `${b.sid}|${invite}|${post}`
  if (reacted.has(k)) return 'dup'
  if (!b.bot?.sock || b.bot.status !== 'open') return 'offline'
  const ch = await channelJid(b.bot.sock, invite)
  await within(b.bot.sock.newsletterReactMessage(ch.id, String(post), emoji), 20000, 'react')
  reacted.add(k)
  return 'ok'
}

// bots: [{ sid, bot }]  first: jis number pe command aayi (pehle woh react kare, opt-in ho ya na ho)
export async function fanOut ({ bots, invite, post, emojis, first = null, gap = [3000, 10000], random = false }) {
  const key = `${invite}|${post}`
  if (running.has(key)) return { busy: true, ok: 0, skip: 0, total: 0 }
  running.add(key)
  try {
    const list = []
    if (first) list.push(first)
    for (const b of bots) if (isOptedIn(b.sid) && !list.some(x => x.sid === b.sid)) list.push(b)
    const em = emojis?.length ? emojis : DEFAULT_EMOJIS
    let ok = 0, skip = 0, i = rand(0, em.length - 1), errors = []
    for (let n = 0; n < list.length; n++) {
      const b = list[n]
      const emoji = random ? em[rand(0, em.length - 1)] : em[i++ % em.length]
      let r
      try { r = await reactOne(b, invite, post, emoji) } catch (e) { r = 'err'; errors.push(String(e?.message || e).slice(0, 60)) }
      if (r === 'ok') ok++; else skip++
      if (r === 'ok' && list.slice(n + 1).some(x => x.bot?.status === 'open')) await sleep(rand(gap[0], gap[1]))
    }
    if (errors.length) log.warn('channel react errors:', errors.slice(0, 3).join(' | '))
    return { ok, skip, total: list.length, errors }
  } finally { running.delete(key) }
}

// ===== Auto mode: channel pe naya post -> opt-in numbers react =====
// config status branch ke channel.json mein (public, koi secret nahi): { auto, emojis, last_post }
let cfg = { auto: true, emojis: DEFAULT_EMOJIS, last_post: 0 }
let cfgLoaded = false
async function loadCfg () {
  if (cfgLoaded) return cfg
  cfgLoaded = true
  if (GH_ON) { try { const t = await getRaw('status', 'channel.json'); if (t) cfg = { ...cfg, ...JSON.parse(t) } } catch {} }
  return cfg
}
async function saveCfg () { if (GH_ON) { try { await putFile('status', 'channel.json', JSON.stringify(cfg, null, 2) + '\n', 'channel: last post ' + cfg.last_post) } catch (e) { log.warn('channel.json save fail:', e.message) } } }
export async function getCfg () { return loadCfg() }
export async function setCfg (patch) { await loadCfg(); cfg = { ...cfg, ...patch }; await saveCfg(); return cfg }

// newsletterFetchMessages ka jawab: har <message server_id=..>
export function postIds (node) {
  const out = []
  const walk = n => { if (!n || typeof n !== 'object') return; if (n.tag === 'message' && n.attrs?.server_id) out.push(Number(n.attrs.server_id)); if (Array.isArray(n.content)) n.content.forEach(walk) }
  walk(node)
  return [...new Set(out.filter(Number.isFinite))].sort((a, b) => a - b)
}

// channel ke aakhri posts ke server_id: pehle Baileys ka tareeqa, khali aaye to WhatsApp Web wala purana <messages> query
export let lastFetchInfo = null
export async function fetchPostIds (sock, jid, invite) {
  const tags = n => (Array.isArray(n?.content) ? n.content.map(x => x.tag).join(',') : typeof n?.content)
  let ids = []
  try { const r = await within(sock.newsletterFetchMessages(jid, 10), 20000, 'channel posts'); ids = postIds(r); lastFetchInfo = 'updates:' + tags(r) + ':' + ids.length } catch (e) { lastFetchInfo = 'updates err ' + String(e.message).slice(0, 40) }
  if (ids.length || typeof sock.query !== 'function') return ids
  try {
    const r = await within(sock.query({ tag: 'iq', attrs: { id: sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now()), type: 'get', xmlns: 'newsletter', to: 's.whatsapp.net' }, content: [{ tag: 'messages', attrs: { type: 'invite', key: invite, count: '10', after: '100' } }] }), 20000, 'channel posts (web)')
    ids = postIds(r); lastFetchInfo += ' | messages:' + tags(r) + ':' + ids.length
  } catch (e) { lastFetchInfo += ' | messages err ' + String(e.message).slice(0, 40) }
  return ids
}

let watchTimer = null, watching = false
export function startChannelWatch (getBots, everyMs = 3 * 60000) {
  const m = LINK.exec(config.mainChannel || '')
  if (!m || watchTimer) return
  const invite = m[1]
  const tick = async () => {
    if (watching) return
    watching = true
    try {
      const bots = getBots().filter(b => b.bot?.status === 'open' && b.bot.sock)
      if (!bots.length) { setExtra({ channel: { ok: false, error: 'koi connected number nahi' } }); return }
      await loadCfg()
      const reader = bots[0]
      const ch = await channelJid(reader.bot.sock, invite)
      const ids = await fetchPostIds(reader.bot.sock, ch.id, invite)
      const latest = ids.length ? ids[ids.length - 1] : 0
      const optedIn = bots.filter(b => isOptedIn(b.sid)).length
      setExtra({ channel: { ok: true, name: ch.name || null, latest_post: latest || null, auto: cfg.auto !== false, opted_in: optedIn, fetch: lastFetchInfo } })
      if (!latest) return
      if (!cfg.last_post) { cfg.last_post = latest; await saveCfg(); return } // pehli dafa: sirf yaad rakho
      const fresh = ids.filter(x => x > cfg.last_post).slice(-3)
      if (!fresh.length) return
      cfg.last_post = latest; await saveCfg()
      if (cfg.auto === false) return
      for (const post of fresh) {
        const r = await fanOut({ bots: getBots(), invite, post, emojis: cfg.emojis, gap: [3000, 15000], random: true })
        log.ok(`Channel naya post ${post}: ${r.ok} numbers ne react kiya, ${r.skip} skip`)
        setExtra({ channel_last_auto: { post, ok: r.ok, skip: r.skip, at: new Date().toISOString() } })
      }
    } catch (e) {
      setExtra({ channel: { ok: false, error: String(e?.message || e).slice(0, 120) } })
      log.warn('channel watch:', e?.message || e)
    } finally { watching = false }
  }
  watchTimer = setInterval(tick, everyMs); watchTimer.unref?.()
  setTimeout(tick, 60000).unref?.()
}
