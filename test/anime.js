// Anime motion stickers + .stickersearch — network mocked, conversion = real ffmpeg. Run: node test/anime.js
process.env.DATA_DIR = './tmp-test-anime'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-anime-session'
const fs = await import('fs')
const assert = (await import('assert')).default
const webp = (await import('node-webpmux')).default
const settings = await import('../lib/settings.js')
const { loadPlugins, commands } = await import('../lib/plugins.js')
const { handleMessage } = await import('../lib/handler.js')
const anime = await import('../lib/anime.js')
const ssx = await import('../lib/stickersearch.js')
const { run, tmpFile } = await import('../lib/utils.js')
const config = (await import('../config.js')).default

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', String(e.stderr || e.message).slice(0, 400)) } }
fs.rmSync('./tmp-test-anime', { recursive: true, force: true })
settings._reset?.()
await loadPlugins()

// test GIFs: 1 sec (loop hoga ~3 sec tak) aur 8 sec (6 sec tak katega)
async function makeGif (sec, size = '480x270') { const f = tmpFile('gif'); await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${size}:r=15:d=${sec}`, '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', f]); return fs.readFileSync(f) }
const GIF1 = await makeGif(1), GIF8 = await makeGif(8)
const PNG = await (async () => { const f = tmpFile('png'); await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=400x300', '-frames:v', '1', f]); return fs.readFileSync(f) })()
const res = (status, body, type) => ({ ok: status < 400, status, headers: { get: k => (k.toLowerCase() === 'content-type' ? type : null) }, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) } })
const calls = []
function fakeFetch ({ nekosDown = false, gif = GIF1 } = {}) {
  return async (u) => {
    calls.push(u)
    if (u.startsWith('https://nekos.best/api/v2/')) return nekosDown ? res(503, {}) : res(200, { results: [{ url: 'https://nekos.best/api/v2/x/1.gif', anime_name: 'Test Anime' }] })
    if (u.startsWith('https://api.otakugifs.xyz/')) return res(200, { url: 'https://cdn.otakugifs.xyz/gifs/x/2.gif' })
    if (u.startsWith('https://api.waifu.pics/')) return res(200, { url: 'https://i.waifu.pics/3.gif' })
    if (/\.gif$/.test(u)) return res(200, gif, 'image/gif')
    if (u.includes('noto-emoji-animation')) return res(200, { icons: [{ codepoint: '1f63a', popularity: 9, tags: [':smiley-cat:'] }, { codepoint: '1f63a_1f3fb', popularity: 9, tags: [':smiley-cat:'] }, { codepoint: '1f628', popularity: 5, tags: [':scared:'] }, { codepoint: '1f355', popularity: 3, tags: [':pizza:'] }] })
    if (u.startsWith('https://api.openverse.org/')) return res(200, { results: [{ url: 'https://example.org/cat.png', title: 'cat', mature: false }] })
    if (u.startsWith('https://commons.wikimedia.org/')) return res(200, { query: { pages: { 1: { title: 'File:War stamp.gif', imageinfo: [{ url: 'https://upload.wikimedia.org/a.gif', size: 5000, mime: 'image/gif' }] } } } })
    if (u === 'https://example.org/cat.png') return res(200, PNG, 'image/png')
    return res(404, {})
  }
}
const info = async buf => { const img = new webp.Image(); await img.load(buf); return { w: img.width, h: img.height, anim: img.hasAnim, frames: img.frames?.length || 0, exif: !!img.exif, alpha: (buf[20] & 0x10) !== 0 } }

console.log('\n[anime] categories')
await t(`>= 90 SFW categories (${anime.CATEGORIES.length}), sab commands registered, category anime`, () => {
  assert.ok(anime.CATEGORIES.length >= 90)
  for (const must of ['hug', 'kiss', 'slap', 'pat', 'cry', 'dance', 'smile', 'wave', 'wink', 'punch', 'bite', 'blush', 'happy', 'poke', 'cuddle', 'highfive']) assert.ok(anime.CATEGORIES.includes(must), must)
  for (const c of anime.CATEGORIES) { const n = anime.RENAME[c] || c; const cmd = commands.get(n); assert.ok(cmd && cmd.category === 'anime' && cmd.name === n, 'missing ' + n) }
  for (const bad of ['kill', 'nsfw', 'hentai', 'lewd']) assert.ok(!anime.CATEGORIES.includes(bad))
})
await t('naam takrane wale renamed: .kick (group) aur .love/.roll purane hi rehte', () => {
  assert.strictEqual(commands.get('kick').category, 'group'); assert.strictEqual(commands.get('kickgif').category, 'anime')
  assert.strictEqual(commands.get('love').category, 'logo'); assert.strictEqual(commands.get('roll').name, 'dice')
})
await t('findCategory: naam, synonym (jhappi -> hug), strict mode (car != carry)', () => {
  assert.strictEqual(anime.findCategory('hug'), 'hug'); assert.strictEqual(anime.findCategory('jhappi'), 'hug')
  assert.strictEqual(anime.findCategory('lovegif'), 'love'); assert.strictEqual(anime.findCategory('car', { strict: true }), null)
  assert.strictEqual(anime.findCategory('zzzz'), null)
})
await t('planLength: 1 sec -> 3 sec loop, 8 sec -> 6 sec', () => {
  assert.deepStrictEqual(anime.planLength(1), { loop: true, t: 3 }); assert.deepStrictEqual(anime.planLength(8), { loop: false, t: 6 })
  assert.strictEqual(anime.planLength(0.48).t.toFixed(2), '3.36'); assert.strictEqual(anime.planLength(4).t, 4)
})

console.log('\n[anime] fetch fallback + real ffmpeg sticker')
await t('nekos.best down -> otakugifs / waifu.pics se mil jati hai', async () => {
  for (let i = 0; i < 4; i++) { const r = await anime.fetchAnime('hug', { fetchImpl: fakeFetch({ nekosDown: true }) }); assert.ok(r.buffer.length > 1000 && r.source !== 'nekos.best') }
})
await t('sab sources down = saaf error', async () => {
  await assert.rejects(anime.fetchAnime('hug', { fetchImpl: async () => res(500, {}) }), /nahi mili/)
})
await t('1 sec GIF -> animated webp 512x512, loop ~3 sec, < 500 KB, exif + alpha flag', async () => {
  const s = await anime.toAnimSticker(GIF1); const i = await info(s.sticker)
  assert.ok(i.w === 512 && i.h === 512 && i.anim && i.exif && i.alpha, JSON.stringify(i))
  assert.ok(s.sticker.length < anime.MAX_STICKER + 2048, 'size ' + s.sticker.length); assert.ok(s.seconds >= 3)
})
await t('8 sec GIF -> 6 sec tak, phir bhi < 500 KB (quality khud kam hoti hai)', async () => {
  const s = await anime.toAnimSticker(GIF8); const i = await info(s.sticker)
  assert.ok(i.anim && s.seconds === 6 && s.sticker.length < anime.MAX_STICKER + 2048, `${s.sticker.length} ${i.frames}`)
})

console.log('\n[anime] commands')
function mockSock () { const sent = []; return { sent, user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} } }
const mockBot = sock => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' })
const pmsg = (text, extra = {}) => ({ key: { remoteJid: '923000000005@s.whatsapp.net', id: 'P' + Math.random(), fromMe: false }, pushName: 'u', message: { extendedTextMessage: { text, contextInfo: extra } } })
const origFetch = globalThis.fetch
globalThis.fetch = fakeFetch()
await t('.hug -> sticker; .hug @user -> sticker + mention text', async () => {
  let sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.hug'))
  assert.ok(sock.sent.find(s => s.content?.sticker))
  sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.hug @923000000009', { mentionedJid: ['923000000009@s.whatsapp.net'] }))
  const m = sock.sent.find(s => s.content?.mentions); assert.ok(sock.sent.find(s => s.content?.sticker) && m && m.content.text.includes('@923000000009'))
})
await t('.animesticker naach -> dance sticker; bina word -> list', async () => {
  let sock = mockSock(); calls.length = 0; await handleMessage(mockBot(sock), pmsg('.animesticker naach'))
  assert.ok(sock.sent.find(s => s.content?.sticker)); assert.ok(calls.some(u => /dance/.test(u)))
  sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.animesticker'))
  const txt = sock.sent.find(s => s.content?.text)?.content.text || ''; assert.ok(txt.includes('.hug') && txt.includes('.kickgif'))
})
await t('stickersearch: noto emoji tags (skin tone copies nahi), commons sirf naam match', async () => {
  ssx._setNoto(null)
  const e = await ssx.notoEmoji('cat', { fetchImpl: fakeFetch() }); assert.strictEqual(e.length, 1); assert.ok(e[0].url.endsWith('/1f63a/512.gif'))
  assert.strictEqual((await ssx.notoEmoji('car', { fetchImpl: fakeFetch() })).length, 0, 'car must not match scared')
  assert.strictEqual((await ssx.commonsGifs('cat', { fetchImpl: fakeFetch() })).length, 0, 'War stamp is not a cat')
})
await t('.stickersearch cat -> stickers (emoji + photo); .ssearch hug -> anime; khali -> usage', async () => {
  let sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.stickersearch cat'))
  assert.ok(sock.sent.filter(s => s.content?.sticker).length >= 2, 'stickers: ' + sock.sent.filter(s => s.content?.sticker).length)
  sock = mockSock(); calls.length = 0; await handleMessage(mockBot(sock), pmsg('.ssearch hug 2'))
  assert.strictEqual(sock.sent.filter(s => s.content?.sticker).length, 2); assert.ok(calls.some(u => /hug/.test(u)))
  sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.stickersearch')); assert.ok(sock.sent.some(s => /Use:/.test(s.content?.text || '')))
})
await t('.stickersearch: kuch na mile = saaf message', async () => {
  globalThis.fetch = async () => res(404, {}); ssx._setNoto({ icons: [] })
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.stickersearch qwertyzz'))
  assert.ok(!sock.sent.find(s => s.content?.sticker) && sock.sent.some(s => /nahi mila/.test(s.content?.text || '')))
})
globalThis.fetch = origFetch

fs.rmSync('./tmp-test-anime', { recursive: true, force: true }); fs.rmSync('./tmp-test-anime-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} anime: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
