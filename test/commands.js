// Naye commands: fancy fonts, text tools, games, photo effects (real ffmpeg), API commands (recorded responses), menu > 500
// Run: node test/commands.js
process.env.DATA_DIR = './tmp-test-cmds'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-cmds-session'
const fs = await import('fs')
const path = await import('path')
const { pathToFileURL } = await import('url')
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins, commands, list } = await import('../lib/plugins.js')
const { buildCtx, dispatch, handleMessage } = await import('../lib/handler.js')
const { menuText } = await import('../plugins/main.js')
const { customList } = await import('../lib/customcmds.js')
const { FONTS } = await import('../lib/fancy.js')
const { T } = await import('../plugins/texttools.js')
const { FX } = await import('../plugins/imagefx.js')
const { API } = await import('../plugins/apicmds.js')
const { run, tmpFile } = await import('../lib/utils.js')
const config = (await import('../config.js')).default

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', String(e.stderr || e.message).slice(0, 500)) } }
fs.rmSync('./tmp-test-cmds', { recursive: true, force: true })
settings._reset?.()
await loadPlugins()

function mockSock () { const sent = []; return { sent, user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} } }
const mockBot = sock => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' })
async function say (text) { const sock = mockSock(); await handleMessage(mockBot(sock), { key: { remoteJid: '923000000005@s.whatsapp.net', id: 'C' + Math.random(), fromMe: false }, pushName: 'Ali', message: { conversation: text } }); return sock.sent }
const texts = sent => sent.filter(s => s.content?.text).map(s => s.content.text)

console.log('\n[cmds] totals + menu')
await t('500+ built-in commands, menu "Commands" > 500, har category menu mein', async () => {
  assert.ok(list.length > 500, 'only ' + list.length)
  const m = menuText({ settings })
  const n = Number((m.match(/Commands: (\d+)/) || [])[1]); assert.ok(n > 500 && n === list.length + customList().length, String(n))
  for (const title of ['LOGO MAKER', 'ANIME STICKERS', 'VOICE CHANGER', 'PHOTO EFFECTS', 'FANCY FONTS', 'TEXT TOOLS', 'GAMES', 'RANDOM / API', 'ANIMALS', 'SEARCH / INFO']) assert.ok(m.includes(title), 'menu missing ' + title)
  for (const c of list) assert.ok(m.includes(`│ ➤ .${c.name}`), 'menu missing .' + c.name)
})
await t('koi naam / alias do commands mein nahi (sab plugin files)', async () => {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'plugins'); const seen = new Map(); const dup = []
  const KNOWN = new Set(['song']) // purana: main.js .song (theme) vs download.js alias
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href); for (const c of [].concat(mod.default)) for (const n of [c.name, ...(c.alias || [])]) { const k = n.toLowerCase(); if (seen.has(k) && !KNOWN.has(k)) dup.push(`${k}: ${seen.get(k)} / ${f}`); else seen.set(k, f) }
  }
  assert.deepStrictEqual(dup, [])
  for (const own of ['tech', 'heart', 'vqr']) assert.ok(!seen.has(own), `panel ki custom command .${own} built-in se dab jati`)
})

console.log('\n[cmds] fancy fonts')
await t(`${FONTS.length} fonts: har ek text badalta hai, .font1 alias, .fancy sab`, async () => {
  assert.ok(FONTS.length >= 35)
  const outs = new Set()
  for (const [n, , f] of FONTS) { const o = f('Aqdas MD 7'); assert.ok(o && o !== 'Aqdas MD 7', n); outs.add(o) }
  assert.strictEqual(outs.size, FONTS.length, 'do fonts ka output same')
  assert.deepStrictEqual(texts(await say('.boldfont AQDAS')), ['𝐀𝐐𝐃𝐀𝐒'])
  assert.deepStrictEqual(texts(await say('.font1 AQDAS')), ['𝐀𝐐𝐃𝐀𝐒'])
  assert.deepStrictEqual(texts(await say('.scriptfont BE')), ['ℬℰ'])
  const all = texts(await say('.fancy Hi'))[0]; assert.ok(all.includes('𝐇𝐢') && all.includes('ʜɪ'))
})

console.log('\n[cmds] text tools')
await t('round trips: binary / morse / base64 / hex / rot13 / atbash / ascii / urlencode', async () => {
  const rt = (a, b, s) => assert.strictEqual(T[b].f(T[a].f(s), []), s, a)
  rt('binary', 'unbinary', 'AQDAS MD ✓'); rt('base64', 'unbase64', 'salam 123'); rt('hex', 'unhex', 'hello'); rt('rot13', 'rot13', 'Hello'); rt('atbash', 'atbash', 'Hello'); rt('ascii', 'fromascii', 'Hi!'); rt('urlencode', 'urldecode', 'a b&c')
  assert.strictEqual(T.unmorse.f(T.morse.f('sos 2026')), 'SOS 2026')
})
await t('har text tool chalta hai aur jawab deta hai', async () => {
  const sample = { caesar: '3 abc', repeat: '2 hi', password: '12', lorem: '10', unbinary: '01001000 01101001', unmorse: '... --- ...', unbase64: 'aGk=', unhex: '48 69', fromascii: '72 105', urldecode: 'a%20b' }
  for (const n of Object.keys(T)) { const r = texts(await say(`.${n} ${sample[n] ?? 'Aqdas Hacker Bot'}`)); assert.ok(r.length === 1 && !/^❌|⚠️/.test(r[0]), `${n}: ${r[0]}`) }
  assert.deepStrictEqual(texts(await say('.mock hello world')), ['hElLo WoRlD'])
  assert.deepStrictEqual(texts(await say('.caesar 1 abz')), ['bca'])
  assert.ok(texts(await say('.unbinary 0100100001101001'))[0] === 'Hi')
  assert.ok(/Use:/.test(texts(await say('.upper'))[0]))
})

console.log('\n[cmds] games')
await t('har game jawab deta hai; ship ka % do dafa same', async () => {
  const sample = { '8ball': 'pass hounga?', rating: 'biryani', ship: 'Ali Sara', lovecalc: 'Ali Sara', rps: 'rock', choose: 'a, b, c' }
  for (const c of list.filter(c => c.category === 'games' && !c.group)) { const r = texts(await say(`.${c.name} ${sample[c.name] || ''}`)); assert.ok(r.length >= 1 && !/⚠️/.test(r[0]), c.name + ' ' + r[0]) }
  const a = texts(await say('.ship Ali Sara'))[0], b = texts(await say('.ship Sara Ali'))[0]; assert.strictEqual(a.match(/(\d+)%/)[1], b.match(/(\d+)%/)[1])
  assert.ok(/Tum: .* vs {2}Bot:/.test(texts(await say('.rps paper'))[0]))
})

console.log('\n[cmds] photo effects (real ffmpeg)')
const photo = tmpFile('jpg'); await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x480', '-frames:v', '1', photo])
const PHOTO = fs.readFileSync(photo)
await t(`${Object.keys(FX).length} effects: photo pe reply -> nayi photo (circle -> sticker), sab alag`, async () => {
  const hashes = new Set(); const crypto = await import('crypto')
  for (const n of Object.keys(FX)) {
    const sock = mockSock()
    const ctx = await buildCtx(mockBot(sock), { key: { remoteJid: '923000000005@s.whatsapp.net', id: 'F' + Math.random() }, message: { extendedTextMessage: { text: '.' + n, contextInfo: { stanzaId: 'Q', participant: '923000000005@s.whatsapp.net', quotedMessage: { imageMessage: { mimetype: 'image/jpeg' } } } } } })
    ctx.download = async () => PHOTO
    await dispatch(ctx)
    const out = sock.sent.find(s => s.content?.image || s.content?.sticker)
    assert.ok(out, n + ': ' + texts(sock.sent).join(' '))
    const b = out.content.image || out.content.sticker; assert.ok(b.length > 1500, n)
    hashes.add(crypto.createHash('md5').update(b).digest('hex'))
  }
  assert.ok(hashes.size >= Object.keys(FX).length - 1, 'effects same output de rahe hain')
})
await t('photo ke bagair -> usage message', async () => { assert.ok(/reply/.test(texts(await say('.grey'))[0])) })

console.log('\n[cmds] API commands (recorded real responses, network mocked)')
const FIX = JSON.parse(fs.readFileSync(new URL('./fixtures/apis.json', import.meta.url)))
const PNG = fs.readFileSync(photo)
function replay (recs) {
  let i = 0
  return async (u) => {
    const r = recs[Math.min(i++, recs.length - 1)]
    if (!r) throw new Error('no fixture for ' + u)
    const body = typeof r.body === 'string' ? Buffer.from(r.body) : PNG
    return new Response(body, { status: r.status, headers: { 'content-type': r.type || 'application/json' } })
  }
}
const SAMPLE = JSON.parse(fs.readFileSync(new URL('./fixtures/apis-samples.json', import.meta.url)))
const origFetch = globalThis.fetch
await t(`${Object.keys(API).length} API commands, har ek ke liye asli jawab record hai aur reply banta hai`, async () => {
  const missing = Object.keys(API).filter(n => !FIX[n]); assert.deepStrictEqual(missing, [])
  const bad = []
  for (const n of Object.keys(API)) {
    globalThis.fetch = replay(FIX[n])
    const sent = await say(`.${n} ${SAMPLE[n] || ''}`.trim())
    const out = sent.find(s => s.content?.text || s.content?.image)
    if (!out || /⚠️|ℹ️/.test(out.content.text || '')) bad.push(n + ': ' + (out?.content.text || 'no reply').slice(0, 80))
  }
  globalThis.fetch = origFetch
  assert.deepStrictEqual(bad, [])
})
await t('API down / timeout -> saaf "baad mein try karo" message (crash nahi)', async () => {
  globalThis.fetch = async () => { throw new Error('ECONNRESET') }
  for (const n of ['advice', 'cat', 'crypto', 'ayah', 'hadith']) { const r = texts(await say(`.${n}`)); assert.ok(r.length === 1 && /⚠️/.test(r[0]), n + ' ' + r[0]) }
  globalThis.fetch = async () => new Response('oops', { status: 500 })
  assert.ok(/⚠️/.test(texts(await say('.dadjoke'))[0]))
  globalThis.fetch = origFetch
})
await t('bina zaroori text -> usage (network ko hath nahi)', async () => {
  let called = 0; globalThis.fetch = async () => { called++; throw new Error('x') }
  for (const n of ['time', 'movie', 'pokemon', 'qibla', 'synonym']) assert.ok(/Use:/.test(texts(await say(`.${n}`))[0]), n)
  globalThis.fetch = origFetch; assert.strictEqual(called, 0)
})
await t('offline islamic: .kalima 1-6, .dua', async () => {
  assert.ok(texts(await say('.kalima'))[0].includes('Chhata Kalima'))
  assert.ok(texts(await say('.dua 5'))[0].includes('رَّبِّ زِدْنِىْ عِلْمًا'))
})

fs.rmSync('./tmp-test-cmds', { recursive: true, force: true }); fs.rmSync('./tmp-test-cmds-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} commands: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
