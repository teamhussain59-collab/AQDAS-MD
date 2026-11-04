// Anime motion stickers: free bina key wali APIs (nekos.best, otakugifs, waifu.pics — sirf SFW) -> animated webp sticker
import fs from 'fs'
import config from '../config.js'
import { run, tmpFile, rm } from './utils.js'
import { addExif } from './media.js'

export const NEKOS = ['angry', 'baka', 'bite', 'bleh', 'blowkiss', 'blush', 'bonk', 'bored', 'carry', 'clap', 'confused', 'cry', 'cuddle', 'dance', 'facepalm', 'feed', 'handhold', 'handshake', 'happy', 'highfive', 'hug', 'kabedon', 'kick', 'kiss', 'lappillow', 'laugh', 'lurk', 'nod', 'nom', 'nope', 'nya', 'pat', 'peck', 'poke', 'pout', 'punch', 'run', 'salute', 'shake', 'shocked', 'shoot', 'shrug', 'sip', 'slap', 'sleep', 'smile', 'smug', 'spin', 'stare', 'tableflip', 'teehee', 'think', 'thumbsup', 'tickle', 'wag', 'wave', 'wink', 'yawn', 'yeet']
export const OTAKU = ['airkiss', 'angrystare', 'bite', 'bleh', 'blush', 'brofist', 'celebrate', 'cheers', 'clap', 'confused', 'cool', 'cry', 'cuddle', 'dance', 'drool', 'evillaugh', 'facepalm', 'handhold', 'happy', 'headbang', 'hug', 'huh', 'kiss', 'laugh', 'lick', 'love', 'mad', 'nervous', 'no', 'nom', 'nosebleed', 'nuzzle', 'nyah', 'pat', 'peek', 'pinch', 'poke', 'pout', 'punch', 'run', 'sad', 'scared', 'shout', 'shrug', 'shy', 'sigh', 'sing', 'sip', 'slap', 'sleep', 'slowclap', 'smack', 'smile', 'smug', 'sneeze', 'sorry', 'stare', 'stop', 'surprised', 'sweat', 'thumbsup', 'tickle', 'tired', 'wave', 'wink', 'woah', 'yawn', 'yay', 'yes']
export const WAIFU = ['awoo', 'bite', 'blush', 'bonk', 'bully', 'cringe', 'cry', 'cuddle', 'dance', 'glomp', 'handhold', 'happy', 'highfive', 'hug', 'kick', 'kiss', 'lick', 'nom', 'pat', 'poke', 'slap', 'smile', 'smug', 'wave', 'wink', 'yeet']
export const CATEGORIES = [...new Set([...NEKOS, ...OTAKU, ...WAIFU])].sort()

// command naam jo kisi aur command se takrata hai -> alag naam (category wahi)
export const RENAME = { love: 'lovegif', roll: 'rollgif', kick: 'kickgif' }
// .animesticker <word>: aam alfaaz -> category
export const SYNONYM = { hello: 'wave', hi: 'wave', bye: 'wave', goodbye: 'wave', thanks: 'thumbsup', ok: 'thumbsup', yes: 'nod', haha: 'laugh', lol: 'laugh', rofl: 'laugh', sad: 'cry', angry: 'angry', gussa: 'angry', pyar: 'love', ishq: 'love', sorry: 'sorry', sone: 'sleep', neend: 'sleep', khana: 'nom', eat: 'nom', hit: 'punch', thappar: 'slap', naach: 'dance', hasna: 'laugh', rona: 'cry', shy: 'blush', sharam: 'blush', jhappi: 'hug', chumma: 'kiss', welcome: 'wave', party: 'celebrate', congrats: 'celebrate', mubarak: 'celebrate', wow: 'woah', omg: 'shocked', shock: 'shocked', bored: 'bored', tired: 'tired', thak: 'tired', clapping: 'clap', smile: 'smile', muskurahat: 'smile' }

export function findCategory (word, { strict = false } = {}) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return null
  if (CATEGORIES.includes(w)) return w
  const r = Object.entries(RENAME).find(([, v]) => v === w); if (r) return r[0]
  if (SYNONYM[w] && CATEGORIES.includes(SYNONYM[w])) return SYNONYM[w]
  if (strict) return null
  return CATEGORIES.find(c => c.startsWith(w)) || CATEGORIES.find(c => w.startsWith(c)) || CATEGORIES.find(c => c.includes(w)) || null
}

export function sourcesFor (cat) {
  const s = []
  if (NEKOS.includes(cat)) s.push({ name: 'nekos.best', api: `https://nekos.best/api/v2/${cat}`, pick: j => ({ url: j?.results?.[0]?.url, anime: j?.results?.[0]?.anime_name }) })
  if (OTAKU.includes(cat)) s.push({ name: 'otakugifs', api: `https://api.otakugifs.xyz/gif?reaction=${cat}`, pick: j => ({ url: j?.url }) })
  if (WAIFU.includes(cat)) s.push({ name: 'waifu.pics', api: `https://api.waifu.pics/sfw/${cat}`, pick: j => ({ url: j?.url }) })
  // ek hi source pe sab load na ho: shuru ka source har dafa badlo
  if (s.length > 1) { const k = Math.floor(Math.random() * s.length); return s.slice(k).concat(s.slice(0, k)) }
  return s
}

const okMedia = u => /^https:\/\//.test(u || '') && /\.(gif|mp4|webm|webp)(\?|$)/i.test(u)

export async function fetchAnime (cat, { fetchImpl = fetch, timeout = 15000 } = {}) {
  if (!CATEGORIES.includes(cat)) throw new Error('Ye category nahi hai: ' + cat)
  const errors = []
  for (const s of sourcesFor(cat)) {
    try {
      const r = await fetchImpl(s.api, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) })
      if (!r.ok) { errors.push(`${s.name} ${r.status}`); continue }
      const p = s.pick(await r.json())
      if (!okMedia(p.url)) { errors.push(`${s.name} no gif`); continue }
      const m = await fetchImpl(p.url, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0' }, signal: AbortSignal.timeout(timeout * 2) })
      if (!m.ok) { errors.push(`${s.name} media ${m.status}`); continue }
      const buf = Buffer.from(await m.arrayBuffer())
      if (buf.length < 1000 || buf.length > 25 * 1024 * 1024) { errors.push(`${s.name} bad size`); continue }
      return { buffer: buf, source: s.name, anime: p.anime || null, url: p.url }
    } catch (e) { errors.push(`${s.name} ${e.name === 'TimeoutError' ? 'timeout' : 'error'}`) }
  }
  throw new Error('Anime GIF nahi mili (' + errors.join(', ') + '). Thori dair baad try karo.')
}

const ffprobe = () => process.env.FFPROBE_PATH || String(config.ffmpeg || 'ffmpeg').replace(/ffmpeg(\.exe)?$/, 'ffprobe$1')
export async function mediaDuration (file) {
  try {
    const { stdout } = await run(ffprobe(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 20000 })
    const d = parseFloat(stdout); return Number.isFinite(d) && d > 0 ? d : null
  } catch { return null }
}

// chhoti GIF ko loop karke ~3 sec, lambi ko 6 sec tak; har koshish ke baad size check (WhatsApp animated sticker ~500 KB)
export const MAX_STICKER = 490 * 1024
export function planLength (d) {
  if (!d) return { loop: false, t: 4 }
  if (d >= 3) return { loop: false, t: Math.min(d, 6) }
  return { loop: true, t: Math.min(6, d * Math.ceil(3 / d)) }
}
// compression_level 4: level 6 se ~6x tez, size sirf ~10% zyada (runner pe har sticker ~1-2 sec)
const TRIES = [{ fps: 15, q: 50, s: 512 }, { fps: 12, q: 40, s: 512 }, { fps: 10, q: 30, s: 448 }, { fps: 8, q: 22, s: 384 }, { fps: 6, q: 15, s: 320 }]

export async function toAnimSticker (buf, { pack = config.packname, author = config.author, maxBytes = MAX_STICKER } = {}) {
  const head = buf.slice(0, 4).toString('latin1')
  const ext = head.startsWith('GIF') ? 'gif' : head === 'RIFF' ? 'webp' : 'mp4'
  const inp = tmpFile(ext), out = tmpFile('webp')
  fs.writeFileSync(inp, buf)
  try {
    const plan = planLength(await mediaDuration(inp))
    let data = null
    for (const tr of TRIES) {
      const vf = `fps=${tr.fps},scale=${tr.s}:${tr.s}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`
      const pre = plan.loop ? (ext === 'gif' ? ['-ignore_loop', '0'] : ['-stream_loop', '-1']) : []
      await run(config.ffmpeg, ['-y', '-v', 'error', ...pre, '-i', inp, '-t', plan.t.toFixed(2), '-vf', vf, '-c:v', 'libwebp', '-loop', '0', '-q:v', String(tr.q), '-compression_level', '4', '-an', '-fps_mode', 'passthrough', out], { timeout: 120000 })
      data = fs.readFileSync(out)
      if (data.length <= maxBytes) break
    }
    if (!data || data.length > maxBytes) throw new Error('Sticker bohat bara ban raha hai')
    return { sticker: await addExif(data, pack, author), seconds: plan.t }
  } finally { rm(inp, out) }
}
