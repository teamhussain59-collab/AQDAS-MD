// Store test: custom menu song / DP 6h restart ke baad bhi rahe (mock GitHub contents API, real ffmpeg)
// Run: node test/store.js   (npm test bhi chalata hai)
process.env.DATA_DIR = './tmp-store-data'
process.env.SESSION_DIR = './tmp-store-session'
process.env.OWNER_NUMBER = '923000000001'
process.env.GITHUB_ACTIONS = 'true'
process.env.GITHUB_TOKEN = 'test-token'
process.env.GITHUB_REPOSITORY = 'test/repo'
process.env.SESSION_KEY = 'unit-test-session-key-0123456789'
const fs = (await import('fs')).default
const path = (await import('path')).default
const crypto = (await import('crypto')).default
const assert = (await import('assert')).default

// ---- in-memory GitHub contents API (sirf jo store.js / github.js use karte hain) ----
const repo = new Map() // "branch:path" -> Buffer
let fail500 = 0 // agle itne PUT pe GitHub 500 de
const calls = []
const sha = b => crypto.createHash('sha1').update(b).digest('hex')
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url); const m = (o.method || 'GET').toUpperCase(); const accept = o.headers?.Accept || ''
  const rel = u.pathname.replace('/repos/test/repo', '')
  calls.push(m + ' ' + rel)
  const res = (status, j, text) => ({ ok: status < 300, status, json: async () => j, text: async () => text ?? JSON.stringify(j) })
  if (rel.startsWith('/git/ref/heads/')) return res(200, { object: { sha: 'base' } })
  if (rel.startsWith('/contents')) {
    const p = rel.slice('/contents/'.length)
    if (m === 'GET') {
      const branch = u.searchParams.get('ref')
      if (!p) return res(200, [...repo.keys()].filter(k => k.startsWith(branch + ':')).map(k => { const n = k.slice(branch.length + 1); return { name: n, path: n, sha: sha(repo.get(k)) } }))
      const b = repo.get(branch + ':' + p)
      if (!b) return res(404, { message: 'Not Found' })
      if (accept.includes('raw')) return res(200, null, b.toString('utf8'))
      // asli GitHub: 1 MB se bari file pe default JSON media type kaam nahi karta, object media type karta hai
      if (b.length > 1024 * 1024 && !accept.includes('object')) return res(403, { message: 'too_large' })
      return res(200, { name: p, path: p, sha: sha(b) })
    }
    const body = JSON.parse(o.body)
    const key = body.branch + ':' + p; const cur = repo.get(key)
    if (m === 'PUT' && fail500 > 0) { fail500--; return res(500, { message: 'Server Error' }) }
    if (m === 'PUT') {
      if (cur && body.sha !== sha(cur)) return res(409, { message: 'sha mismatch' })
      if (!cur && body.sha) return res(422, { message: 'no file' })
      const b = Buffer.from(body.content, 'base64'); repo.set(key, b)
      return res(cur ? 200 : 201, { content: { sha: sha(b) } })
    }
    if (m === 'DELETE') { if (!cur || body.sha !== sha(cur)) return res(409, {}); repo.delete(key); return res(200, {}) }
  }
  return res(404, {})
}

const store = await import('../lib/store.js')
const settings = await import('../lib/settings.js')
const { runAs } = await import('../lib/ctx.js')
const { songPath, customSong, dpPath, customDp, ORIGINAL_SONG, ORIGINAL_DP } = await import('../lib/assets.js')
const { buildCtx, dispatch, handleMessage } = await import('../lib/handler.js')
const manager = await import('../lib/sessions.js')
const { run } = await import('../lib/utils.js')
const { loadPlugins } = await import('../lib/plugins.js')
await loadPlugins()

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.stack) } }
const wipe = () => { for (const d of ['./tmp-store-data', './tmp-store-session']) fs.rmSync(d, { recursive: true, force: true }) }
wipe(); settings._reset()

function mockSock () {
  const sent = []
  return { sent, user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid', name: 'AQDAS MD' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' + sent.length }, message: {} } }, readMessages: async () => {}, sendPresenceUpdate: async () => {}, updateProfilePicture: async (jid, buf) => { sent.push({ pp: jid, size: buf.length }) }, updateMediaMessage: async m => m }
}
const mockBot = (sock, id) => ({ id, sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, sessionString: () => '', status: 'open' })
const OWNER = '923000000001@s.whatsapp.net'
const GUEST_NUMBER = '923009998887'
const GSID = store.sidFor(GUEST_NUMBER)
const reply = (text, quoted) => ({ key: { remoteJid: OWNER, id: 'R' + Math.random() }, message: { extendedTextMessage: { text, contextInfo: { stanzaId: 'Q', quotedMessage: quoted } } } })

// test audio / photo
fs.mkdirSync('./tmp-store-data', { recursive: true })
await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=40', '-c:a', 'libmp3lame', './tmp-store-data/in.mp3'])
const AUDIO = fs.readFileSync('./tmp-store-data/in.mp3'); fs.rmSync('./tmp-store-data/in.mp3')
const PHOTO = crypto.randomBytes(1500 * 1024) // 1.5 MB "photo" (asli GitHub ki 1 MB JSON had test)
const guestDir = settings.dir(GSID)

console.log('\n[store] custom song / DP restart ke baad')
await t('store is on in this test (mock GitHub)', () => assert.ok(store.storeEnabled))
await t('panel number: sid != main, own data folder', () => { assert.notEqual(GSID, 'main'); assert.ok(guestDir.includes(path.join('s', GSID))) })

await t('session saved (creds) for panel number + main', async () => {
  fs.mkdirSync('./tmp-store-session/g', { recursive: true }); fs.writeFileSync('./tmp-store-session/g/creds.json', '{"me":1}')
  store.scheduleSave(GSID, () => ({ number: GUEST_NUMBER, files: store.packDir('./tmp-store-session/g'), settings: settings.exportFor(GSID) }), 10)
  await store.saveNow(GSID)
  fs.mkdirSync('./tmp-store-session/m', { recursive: true }); fs.writeFileSync('./tmp-store-session/m/creds.json', '{"me":0}')
  store.scheduleSave('main', () => ({ number: 'main', files: store.packDir('./tmp-store-session/m'), settings: settings.exportFor('main') }), 10)
  await store.saveNow('main')
  assert.equal([...repo.keys()].length, 2)
})

await t('.setsong on panel number -> saved per-session AND pushed encrypted right away', async () => {
  const sock = mockSock(); const bot = mockBot(sock, GSID)
  const before = repo.size
  await runAs(GSID, async () => { const ctx = await buildCtx(bot, reply('.setsong', { audioMessage: { mimetype: 'audio/mpeg' } })); ctx.download = async () => AUDIO; await dispatch(ctx) })
  assert.ok(fs.existsSync(path.join(guestDir, 'menu_song.mp3')), 'song not in guest dir')
  assert.ok(!fs.existsSync(path.join(settings.dir('main'), 'menu_song.mp3')), 'song leaked into main dir')
  assert.equal(repo.size, before + 1, 'asset file not pushed')
  assert.equal(runAs(GSID, () => songPath()), path.join(guestDir, 'menu_song.mp3'))
  assert.equal(runAs('main', () => songPath()), ORIGINAL_SONG)
})

await t('.setdp (1.5 MB) on panel number -> saved + pushed, update works past 1 MB', async () => {
  const sock = mockSock(); const bot = mockBot(sock, GSID)
  await runAs(GSID, async () => { const ctx = await buildCtx(bot, reply('.setdp', { imageMessage: { mimetype: 'image/jpeg' } })); ctx.download = async () => PHOTO; await dispatch(ctx) })
  assert.ok(sock.sent.find(s => s.pp))
  assert.ok(Buffer.compare(fs.readFileSync(path.join(guestDir, 'menu_dp.jpg')), PHOTO) === 0)
  const assetKey = [...repo.keys()].find(k => repo.get(k).length > 1024 * 1024)
  assert.ok(assetKey, 'big asset file not on branch')
})

await t('branch: only .enc names, no number, no plaintext media', () => {
  const songB64 = fs.readFileSync(path.join(guestDir, 'menu_song.mp3')).subarray(1000, 1040).toString('base64')
  for (const [k, b] of repo) {
    assert.ok(k.startsWith('sessions:') && k.endsWith('.enc'), k)
    assert.ok(!k.includes(GUEST_NUMBER) && !k.includes(GSID), 'number/sid in filename ' + k)
    const s = b.toString('utf8'); assert.ok(s.startsWith('AQ1:'))
    assert.ok(!s.includes(GUEST_NUMBER) && !s.includes(songB64), 'plaintext leaked')
  }
})

await t('session file stays small (song/DP not inside it)', () => {
  const sizes = [...repo.values()].map(b => b.length).sort((a, b) => a - b)
  assert.ok(sizes[0] < 10000 && sizes[1] < 10000, 'session files: ' + sizes)
})

await t('RESTART: wipe data dir -> loadAll -> restore -> song + DP back (panel number)', async () => {
  const song = fs.readFileSync(path.join(guestDir, 'menu_song.mp3'))
  wipe(); settings._reset()
  assert.ok(!fs.existsSync(path.join(guestDir, 'menu_song.mp3')))
  const saved = await store.loadAll()
  const g = saved.find(s => s.sid === GSID)
  assert.ok(g && g.number === GUEST_NUMBER && g.files['creds.json'], 'guest session not loaded')
  assert.deepEqual(Object.keys(g.assets).sort(), ['menu_dp.jpg', 'menu_song.mp3'])
  manager.restoreAssets(GSID, g.assets)
  assert.ok(Buffer.compare(fs.readFileSync(path.join(guestDir, 'menu_song.mp3')), song) === 0, 'song bytes differ')
  assert.ok(Buffer.compare(fs.readFileSync(path.join(guestDir, 'menu_dp.jpg')), PHOTO) === 0, 'dp bytes differ')
  assert.equal(runAs(GSID, () => songPath()), runAs(GSID, () => customSong()))
  assert.equal(runAs(GSID, () => dpPath()), runAs(GSID, () => customDp()))
  assert.equal(runAs('main', () => songPath()), ORIGINAL_SONG)
  // .menu on the restored panel number plays the custom song
  const sock = mockSock(); const bot = mockBot(sock, GSID)
  await runAs(GSID, async () => { settings.set('menuSong', true); await handleMessage(bot, { key: { remoteJid: OWNER, id: 'M1' }, message: { conversation: '.menu' } }) })
  const a = sock.sent.find(s => s.content?.audio)
  assert.ok(a && Buffer.compare(a.content.audio, song) === 0, '.menu did not play custom song')
})

await t('RESTART: main number song via prepareMain', async () => {
  const sock = mockSock(); const bot = mockBot(sock, 'main')
  await runAs('main', async () => { const ctx = await buildCtx(bot, reply('.setsong', { audioMessage: { mimetype: 'audio/mpeg' } })); ctx.download = async () => AUDIO; await dispatch(ctx) })
  assert.ok(fs.existsSync(path.join(settings.dir('main'), 'menu_song.mp3')))
  wipe(); settings._reset()
  const saved = await store.loadAll()
  await manager.prepareMain(saved)
  assert.ok(fs.existsSync(path.join(settings.dir('main'), 'menu_song.mp3')), 'main song not restored')
})

await t('.setsong reset / .setdp reset -> removed from branch, stays reset after restart', async () => {
  manager.restoreAssets(GSID, (await store.loadAll()).find(s => s.sid === GSID).assets) // jaise startup pe
  const sock = mockSock(); const bot = mockBot(sock, GSID)
  const n = repo.size
  await runAs(GSID, async () => { await handleMessage(bot, { key: { remoteJid: OWNER, id: 'X1' }, message: { conversation: '.setsong reset' } }) })
  assert.equal(repo.size, n, 'dp still there so file stays')
  await runAs(GSID, async () => { await handleMessage(bot, { key: { remoteJid: OWNER, id: 'X2' }, message: { conversation: '.setdp reset' } }) })
  assert.equal(repo.size, n - 1, 'asset file not deleted')
  wipe(); settings._reset()
  const saved = await store.loadAll()
  assert.ok(!saved.find(s => s.sid === GSID).assets)
  assert.equal(runAs(GSID, () => songPath()), ORIGINAL_SONG)
  assert.equal(runAs(GSID, () => dpPath()), ORIGINAL_DP)
})

await t('.setmenu video on panel number -> pushed encrypted, survives RESTART, .menu sends it as gif; reset removes it', async () => {
  fs.mkdirSync('./tmp-store-data', { recursive: true })
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '5', '-pix_fmt', 'yuv420p', './tmp-store-data/v.mp4'])
  const VID = fs.readFileSync('./tmp-store-data/v.mp4'); fs.rmSync('./tmp-store-data/v.mp4')
  const sock = mockSock(); const bot = mockBot(sock, GSID)
  const n = repo.size
  await runAs(GSID, async () => { const ctx = await buildCtx(bot, reply('.setmenu', { videoMessage: { mimetype: 'video/mp4' } })); ctx.download = async () => VID; await dispatch(ctx) })
  assert.ok(fs.existsSync(path.join(guestDir, 'menu_media.mp4')), 'menu video not in guest dir')
  assert.ok(!fs.existsSync(path.join(settings.dir('main'), 'menu_media.mp4')), 'leaked into main')
  assert.equal(repo.size, n + 1, 'asset file not pushed')
  const mine = fs.readFileSync(path.join(guestDir, 'menu_media.mp4'))
  for (const [, b] of repo) assert.ok(!b.includes(mine.subarray(2000, 2040).toString('base64')), 'plaintext video on branch')
  wipe(); settings._reset() // 6h restart
  const saved = await store.loadAll()
  const g = saved.find(s => s.sid === GSID)
  assert.ok(g.assets && g.assets['menu_media.mp4'], 'menu video not in store')
  manager.restoreAssets(GSID, g.assets)
  assert.ok(Buffer.compare(fs.readFileSync(path.join(guestDir, 'menu_media.mp4')), mine) === 0, 'restored bytes differ')
  const s2 = mockSock(); const b2 = mockBot(s2, GSID)
  await runAs(GSID, async () => { await handleMessage(b2, { key: { remoteJid: OWNER, id: 'MV' }, message: { conversation: '.menu' } }) })
  const v = s2.sent.find(s => s.content?.video)
  assert.ok(v && v.content.gifPlayback && Buffer.compare(v.content.video, mine) === 0, '.menu did not send custom video after restart')
  await runAs(GSID, async () => { await handleMessage(b2, { key: { remoteJid: OWNER, id: 'MR' }, message: { conversation: '.setmenu reset' } }) })
  assert.equal(repo.size, n, 'asset file not deleted after reset')
  wipe(); settings._reset()
  const again = (await store.loadAll()).find(s => s.sid === GSID)
  assert.ok(!again.assets, 'reset did not stick')
})

await t('settings toggle -> session file re-saved soon (touch)', async () => {
  const before = sha(repo.get([...repo.keys()].find(k => repo.get(k).length < 10000)))
  store.scheduleSave(GSID, () => ({ number: GUEST_NUMBER, files: { 'creds.json': 'e30=' }, settings: settings.exportFor(GSID) }), 60000)
  await store.saveNow(GSID)
  runAs(GSID, () => settings.set('autoReact', true))
  await new Promise(r => setTimeout(r, 5600))
  const saved = await store.loadAll()
  assert.ok(JSON.parse(saved.find(s => s.sid === GSID).settings).autoReact === true, 'toggle not persisted')
  assert.ok(before)
})

await t('logout/remove deletes session + assets', async () => {
  const sock = mockSock(); const bot = mockBot(sock, GSID)
  await runAs(GSID, async () => { const ctx = await buildCtx(bot, reply('.setsong', { audioMessage: { mimetype: 'audio/mpeg' } })); ctx.download = async () => AUDIO; await dispatch(ctx) })
  const n = repo.size
  await store.remove(GSID)
  assert.equal(repo.size, n - 2)
})

wipe()
await t('GitHub 500 pe session/settings write dobara try (pehle seedha fail ho kar setting gum hoti thi)', async () => {
  const gh = await import('../lib/github.js')
  fail500 = 2
  await gh.putFile('sessions', 'retry-test.enc', 'hello', 'test')
  assert.equal(repo.get('sessions:retry-test.enc')?.toString(), 'hello')
  fail500 = 5
  await assert.rejects(() => gh.putFile('sessions', 'retry-test.enc', 'again', 'test'), /500/)
  fail500 = 0
  repo.delete('sessions:retry-test.enc')
})

console.log(`\n${fail ? '❌' : '✅'} store: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
