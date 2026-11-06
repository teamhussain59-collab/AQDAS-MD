// ===== AQDAS Bot Maker =====
// Koi bhi /make pe apna bot banaye: naam, owner naam, DP, song, channel link -> apna panel link /u/<slug>
// Us link se jo number pair ho, us number ke bot pe ye branding lagti hai (saari commands wahi).
// Makers GitHub ki `makers` branch pe save hote hain (Railway restart pe bhi rehte hain).
import crypto from 'crypto'
import { log } from './logger.js'
import { GH_ON, ensureBranch, putFile, listDir, getRaw } from './github.js'

const BRANCH = 'makers'
const makers = new Map()
let loaded = false
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,23}$/
const RESERVED = new Set(['admin', 'api', 'make', 'u', 'health', 'main', 'aqdas', 'aqdas-md', 'qr', 'pair'])
export const cleanSlug = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 24)
const hashPass = (p, salt = crypto.randomBytes(12).toString('hex')) => salt + ':' + crypto.scryptSync(String(p), salt, 32).toString('hex')
const passOk = (p, h) => { try { const [salt] = String(h).split(':'); const a = Buffer.from(hashPass(p, salt)), b = Buffer.from(String(h)); return a.length === b.length && crypto.timingSafeEqual(a, b) } catch { return false } }
const clip = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n)
export const CH_RE = /^https:\/\/(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]+\/?$/i

export async function loadMakers () {
  if (loaded) return
  loaded = true
  if (!GH_ON) return
  try {
    const files = await listDir(BRANCH, 'bots')
    for (const f of files || []) {
      const name = typeof f === 'string' ? f : f.path
      if (!name || !name.endsWith('.json')) continue
      try { const m = JSON.parse(await getRaw(BRANCH, name)); if (m?.slug) makers.set(m.slug, m) } catch {}
    }
    log.info(`bot maker: ${makers.size} bots load hue`)
  } catch (e) { log.warn('bot maker load:', e.message) }
}

async function persist (m) {
  if (!GH_ON) return
  try { await ensureBranch(BRANCH) } catch {}
  await putFile(BRANCH, 'bots/' + m.slug + '.json', JSON.stringify(m) + '\n', 'maker: ' + m.slug)
}

export const getMaker = slug => makers.get(cleanSlug(slug)) || null
export const publicMaker = m => m && ({ slug: m.slug, name: m.name, owner: m.owner, channel: m.channel || '', hasDp: !!m.dp, hasSong: !!m.song, createdAt: m.createdAt })
export const brandOf = m => m && ({ maker: m.slug, botName: m.name, ownerName: m.owner, ownerNumber: m.ownerNumber || '', channel: m.channel || '' })
export const makerCount = () => makers.size

// data: { slug, name, owner, channel, password, dp (base64 jpg/png), song (base64 mp3) }
export async function saveMaker (data, { edit = false } = {}) {
  await loadMakers()
  const slug = cleanSlug(data.slug || data.name)
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) throw Object.assign(new Error('Link ka naam 2-24 letters/numbers ho (misal: ali-bot)'), { code: 400 })
  const old = makers.get(slug)
  if (old && !edit) throw Object.assign(new Error('Ye naam pehle se kisi ne le liya, koi aur naam rakho'), { code: 409 })
  if (edit && (!old || !passOk(data.password, old.pass))) throw Object.assign(new Error('Password ghalat hai'), { code: 403 })
  const name = clip(data.name, 30); const owner = clip(data.owner, 30)
  if (!name) throw Object.assign(new Error('Bot ka naam likho'), { code: 400 })
  const channel = clip(data.channel, 120)
  const ownerNumber = String(data.ownerNumber || old?.ownerNumber || '').replace(/[^0-9]/g, '').slice(0, 15)
  if (ownerNumber && ownerNumber.length < 10) throw Object.assign(new Error('Owner number country code ke saath likho (misal 923001234567)'), { code: 400 })
  if (channel && !CH_RE.test(channel)) throw Object.assign(new Error('Channel link aisa ho: https://whatsapp.com/channel/XXXX'), { code: 400 })
  if (!edit && String(data.password || '').length < 4) throw Object.assign(new Error('Password kam az kam 4 letters'), { code: 400 })
  const dp = data.dp ? String(data.dp).replace(/^data:[^,]*,/, '') : (old?.dp || '')
  const song = data.song ? String(data.song).replace(/^data:[^,]*,/, '') : (old?.song || '')
  if (dp.length > 1.4e6) throw Object.assign(new Error('DP bohat bari hai (max ~1 MB)'), { code: 400 })
  if (song.length > 6e6) throw Object.assign(new Error('Song bohat bara hai (max ~4 MB, 30 sec kaafi hai)'), { code: 400 })
  const m = { slug, name, owner: owner || name, ownerNumber, channel, dp, song, pass: old?.pass || hashPass(data.password), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), v: (old?.v || 0) + 1 }
  makers.set(slug, m)
  try { await persist(m) } catch (e) { log.warn('maker save fail:', e.message) }
  return m
}
