// Custom commands (admin panel) tests — mock socket + mock Firestore. Run: node test/customcmds.js
process.env.DATA_DIR = './tmp-test-cc'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-cc-session'
delete process.env.FIREBASE_SA
const fs = await import('fs')
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins } = await import('../lib/plugins.js')
const { buildCtx, dispatch } = await import('../lib/handler.js')
const cc = await import('../lib/customcmds.js')
const { menuText } = await import('../plugins/main.js')

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.stack || e.message) } }

function mockSock () {
  const sent = []
  return {
    sent,
    user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid', name: 'AQDAS MD' },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } },
    readMessages: async () => {}, sendPresenceUpdate: async () => {}, groupMetadata: async () => null, updateMediaMessage: async m => m
  }
}
const mockBot = (sock) => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' })
const OWNER = '923000000001@s.whatsapp.net', STRANGER = '923000000009@s.whatsapp.net'
const pmsg = (from, text) => ({ key: { remoteJid: from, id: 'P' + Math.random(), fromMe: false }, pushName: 'u', message: { conversation: text } })
const texts = (sock) => sock.sent.filter(s => s.content?.text).map(s => s.content.text)
async function run (from, text) {
  const sock = mockSock(); const bot = mockBot(sock)
  const ctx = await buildCtx(bot, pmsg(from, text))
  const handled = await dispatch(ctx)
  return { sock, handled }
}

fs.rmSync('./tmp-test-cc', { recursive: true, force: true })
settings._reset()
await loadPlugins()

await t('custom command loads and runs (reply ok)', async () => {
  const r = cc.applyData({ cmds: [{ name: 'tabtest', code: "await ctx.reply('ok')" }] })
  assert.equal(r.loaded, 1)
  const { sock, handled } = await run(OWNER, '.tabtest')
  assert.ok(handled)
  assert.deepEqual(texts(sock), ['ok'])
})

await t('args / text / sender / isOwner reach the code', async () => {
  cc.applyData({ cmds: [{ name: 'echox', code: "await ctx.reply(ctx.args.join('|') + ' ' + ctx.text + ' ' + ctx.sender + ' ' + ctx.isOwner)" }] })
  const { sock } = await run(OWNER, '.echox a b')
  assert.deepEqual(texts(sock), ['a|b a b 923000000001 true'])
})

await t('module.exports = async (ctx) => {} format bhi chalta hai', async () => {
  cc.applyData({ cmds: [{ name: 'modfmt', code: "module.exports = async (ctx) => { await ctx.reply('mod ' + ctx.command) }" }] })
  const { sock } = await run(OWNER, '.modfmt')
  assert.deepEqual(texts(sock), ['mod modfmt'])
})

await t('sendImage (base64) + react', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  cc.applyData({ cmds: [{ name: 'mypic', code: `await ctx.react('🔥'); await ctx.sendImage('${png}', 'cap ' + ctx.text)` }] })
  const { sock } = await run(OWNER, '.mypic hi')
  const img = sock.sent.find(s => s.content?.image)
  assert.ok(img && Buffer.isBuffer(img.content.image) && img.content.image.length > 50)
  assert.equal(img.content.caption, 'cap hi')
  assert.ok(sock.sent.find(s => s.content?.react?.text === '🔥'))
})

await t('infinite loop times out safely, bot event loop never blocked', async () => {
  cc.applyData({ cmds: [{ name: 'loop', code: 'while (true) {}' }] })
  let ticks = 0; const iv = setInterval(() => ticks++, 100)
  const t0 = Date.now()
  const { sock } = await run(OWNER, '.loop')
  clearInterval(iv)
  const ms = Date.now() - t0
  assert.ok(ms < 6000, 'took ' + ms)
  assert.ok(ticks >= Math.floor(ms / 100) - 5, `event loop blocked (ticks ${ticks} in ${ms} ms)`)
  const out = texts(sock)
  assert.equal(out.length, 1); assert.ok(out[0].startsWith('❌ Command error'), out[0])
})

await t('async infinite loop is killed by the wall timeout', async () => {
  const sock = mockSock(); const ctx = await buildCtx(mockBot(sock), pmsg(OWNER, '.x'))
  const t0 = Date.now()
  const r = await cc.runCustom(ctx, { name: 'aloop', code: 'for (;;) { await null }' }, { wallMs: 2500 })
  assert.equal(r.ok, false); assert.ok(/timeout/.test(r.error), r.error)
  assert.ok(Date.now() - t0 < 5000)
  assert.ok(texts(sock)[0].startsWith('❌ Command error'))
})

await t('code cannot reach process / require / fs / env / Buffer', async () => {
  cc.applyData({ cmds: [{ name: 'peekx', code: "await ctx.reply([typeof process, typeof require, typeof module.require, typeof globalThis.process, typeof Buffer, typeof fetch, typeof setTimeout].join(','))" }] })
  const { sock } = await run(OWNER, '.peekx')
  // require / fetch / setTimeout ab jaan boojh kar hain (sirf sandbox wale: axios/path/temp-fs, https-only fetch, wall-limited timer)
  assert.deepEqual(texts(sock), ['undefined,function,undefined,undefined,undefined,function,function'])
})

await t('constructor escape tricks fail (no host Function, no eval)', async () => {
  const tricks = [
    "ctx.reply.constructor.constructor('return process')()",
    "this.constructor.constructor('return process')()",
    "(async()=>{}).constructor('return process')()",
    "eval('1+1')",
    "Object.getPrototypeOf(ctx).constructor.constructor('return this')().process.env"
  ]
  for (const code of tricks) {
    cc.applyData({ cmds: [{ name: 'esc', code: `const x = ${code}; await ctx.reply('ESCAPED ' + typeof x)` }] })
    const { sock } = await run(OWNER, '.esc')
    const out = texts(sock)
    assert.ok(out.length === 1 && out[0].startsWith('❌ Command error'), code + ' -> ' + out.join(' / '))
  }
})

await t('sandbox process itself has no env secrets and cannot read files', async () => {
  // agar koi vm se nikal bhi jaye: process ka env khaali aur permission model file read rokta hai.
  const { fork } = await import('child_process')
  const path = await import('path')
  const runner = path.resolve('lib/sandbox-runner.cjs')
  const probe = path.resolve('tmp-test-cc-probe.cjs')
  fs.writeFileSync(probe, "let r={}; try{r.env=Object.keys(process.env).length}catch(e){r.env='err'}; try{require('fs').readFileSync('/etc/hostname');r.read='YES'}catch(e){r.read='blocked'}; try{require('child_process').execSync('id');r.cp='YES'}catch(e){r.cp='blocked'}; process.send(r)")
  const flag = ['--permission', '--experimental-permission'].find(f => process.allowedNodeEnvironmentFlags.has(f))
  const res = await new Promise((resolve, reject) => {
    const c = fork(probe, [], { execArgv: [flag, '--allow-fs-read=' + probe], env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    c.on('message', resolve); c.on('error', reject); setTimeout(() => reject(new Error('probe timeout')), 8000)
  })
  fs.rmSync(probe, { force: true })
  assert.ok(fs.existsSync(runner))
  assert.equal(res.read, 'blocked'); assert.equal(res.cp, 'blocked'); assert.ok(res.env <= 1, 'env ' + res.env)
})

await t('built-in names cannot be overridden (load reject + dispatch uses built-in)', async () => {
  const r = cc.applyData({ cmds: [{ name: 'menu', code: "await ctx.reply('HACKED')" }, { name: 'ping', code: "await ctx.reply('HACKED')" }, { name: 'okcmd', code: "await ctx.reply('fine')" }] })
  assert.equal(r.loaded, 1); assert.equal(r.rejected.length, 2)
  assert.equal(cc.customCommand('menu'), null)
  const { sock } = await run(OWNER, '.ping')
  assert.ok(!texts(sock).includes('HACKED'))
  assert.ok(texts(sock)[0].includes('Ping'))
})

await t('bad names / empty code rejected, disabled commands not loaded', async () => {
  const r = cc.applyData({ cmds: [{ name: 'Bad Name!', code: 'x' }, { name: 'empty', code: '   ' }, { name: 'off', code: "await ctx.reply('x')", enabled: false }] })
  assert.equal(r.loaded, 0)
  assert.equal(cc.getCustom('off'), null)
})

await t('owner-only by default; public flag respects private/public mode', async () => {
  cc.applyData({ cmds: [{ name: 'secret', code: "await ctx.reply('s')" }, { name: 'opencmd', code: "await ctx.reply('o')", public: true }] })
  settings.set('mode', 'public')
  let r = await run(STRANGER, '.secret'); assert.ok(texts(r.sock)[0].includes('sirf owner'))
  r = await run(STRANGER, '.opencmd'); assert.deepEqual(texts(r.sock), ['o'])
  settings.set('mode', 'private')
  r = await run(STRANGER, '.opencmd'); assert.equal(r.handled, false); assert.equal(r.sock.sent.length, 0)
  r = await run(OWNER, '.opencmd'); assert.deepEqual(texts(r.sock), ['o'])
  settings.set('mode', 'public')
})

await t('error shown to owner only, stranger gets nothing', async () => {
  cc.applyData({ cmds: [{ name: 'boom', code: "throw new Error('kaboom')", public: true }] })
  let r = await run(OWNER, '.boom'); assert.ok(texts(r.sock)[0].startsWith('❌ Command error'))
  r = await run(STRANGER, '.boom'); assert.equal(texts(r.sock).length, 0)
})

await t('max 5 messages per command (no spam)', async () => {
  cc.applyData({ cmds: [{ name: 'spam', code: "for (let i = 0; i < 20; i++) { try { await ctx.reply('m' + i) } catch (e) {} }" }] })
  const { sock } = await run(OWNER, '.spam')
  assert.equal(texts(sock).length, 5)
})

await t('get(): only https, private hosts blocked', async () => {
  await assert.rejects(cc.safeGet('http://example.com'), /https/)
  await assert.rejects(cc.safeGet('https://127.0.0.1/x'), /allowed/)
  await assert.rejects(cc.safeGet('https://169.254.169.254/x'), /allowed/)
  await assert.rejects(cc.safeGet('https://localhost/x'), /allowed/)
})

await t('menu shows CUSTOM section', async () => {
  cc.applyData({ cmds: [{ name: 'tech', code: "await ctx.reply('t')" }] })
  const sock = mockSock(); const ctx = await buildCtx(mockBot(sock), pmsg(OWNER, '.menu'))
  const m = menuText(ctx)
  assert.ok(m.includes('CUSTOM') && m.includes('.tech'))
})

// ---- Firestore (mock) ----
const H = 'a'.repeat(64)
const docs = new Map()
let broken = false, getCalls = 0, tick = 0
const setDoc = (id, fields) => docs.set(id, { name: `projects/p/databases/(default)/documents/aqdasmdcmd/${id}`, fields, updateTime: new Date(Date.now() + (++tick) * 1000).toISOString() })
const patches = []
cc._setPatcher(async (p, f) => { patches.push({ p, f }) })
cc._setFetcher(async (p) => {
  getCalls++
  if (broken) throw new Error('firestore 503')
  if (p.startsWith('aqdasmdcmd?')) return { documents: [...docs.values()].map(d => ({ name: d.name, updateTime: d.updateTime })) }
  const id = p.split('?')[0].split('/')[1]
  return docs.get(id) || null
})
const S = (v) => ({ stringValue: v })

await t('Firestore: panel save -> bot loads; delete -> bot unloads (no restart)', async () => {
  cc._resetForTests()
  setDoc(H, { data: S(JSON.stringify({ cmds: [{ name: 'tabtest', code: "await ctx.reply('ok')" }] })), media_v: S('') })
  await cc.check()
  assert.ok(cc.getCustom('tabtest'))
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('') })
  await cc.check()
  assert.equal(cc.getCustom('tabtest'), null)
  setDoc(H, { data: S(JSON.stringify({ cmds: [{ name: 'again', code: "await ctx.reply('ok')" }] })), media_v: S('') })
  await cc.check(); assert.ok(cc.getCustom('again'))
  docs.delete(H); await cc.check(); assert.equal(cc.getCustom('again'), null)
  assert.ok(patches.some(x => x.p === `aqdasmdcmd/${H}_status` && x.f.loaded.stringValue === '.again'), 'bot status written for panel')
})

await t('Firestore down: check never throws, loaded commands keep working', async () => {
  cc._resetForTests()
  setDoc(H, { data: S(JSON.stringify({ cmds: [{ name: 'stay', code: "await ctx.reply('still')" }] })), media_v: S('') })
  await cc.check(); assert.ok(cc.getCustom('stay'))
  broken = true
  await cc.check(); await cc.check()
  broken = false
  assert.ok(cc.getCustom('stay'))
  const { sock } = await run(OWNER, '.stay'); assert.deepEqual(texts(sock), ['still'])
})

await t('Firestore: garbage data does not crash', async () => {
  setDoc(H, { data: S('{not json'), media_v: S('') })
  await cc.check()
  assert.equal(cc.customList().length, 0)
})

await t('poll is cheap: unchanged doc = 1 small read', async () => {
  cc._resetForTests()
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('') })
  await cc.check()
  getCalls = 0; await cc.check(); assert.equal(getCalls, 1)
})

await t('panel menu media: chunks joined, applied only to chosen number, once', async () => {
  cc._resetForTests()
  const applied = []
  cc._setMediaHook(async (x) => applied.push({ sid: x.sid, kind: x.kind, len: x.buf?.length }))
  cc._setSidsHook(async () => [{ sid: 'main', number: '' }, { sid: 'n1', number: '923194997157' }, { sid: 'n2', number: '923000005182' }])
  const raw = Buffer.alloc(3000, 7).toString('base64')
  setDoc(H + '_media', { mime: S('image/jpeg'), chunks: { integerValue: '2' }, v: S('v1'), target: S('7157') })
  setDoc(H + '_m0', { b64: S(raw.slice(0, 2000)), v: S('v1') })
  setDoc(H + '_m1', { b64: S(raw.slice(2000)), v: S('v1') })
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('v1') })
  await cc.check(); await cc.check()
  assert.deepEqual(applied, [{ sid: 'n1', kind: 'image', len: 3000 }])
  // "sab numbers" + reset
  setDoc(H + '_media', { mime: S(''), chunks: { integerValue: '0' }, v: S('v2'), target: S('') })
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('v2') })
  await cc.check()
  assert.deepEqual(applied.slice(1).map(a => a.sid + ':' + a.kind), ['main:reset', 'n1:reset', 'n2:reset'])
  cc._setMediaHook(null); cc._setSidsHook(null)
})

// ===== Panel runner: delay, web, require, fs, bot-style m / sock =====
const SNIPPET = "// Command: .sendchannel <channel_jid> <text>\nif (text.startsWith('.sendchannel ')) {\n    const args = text.split(' ');\n    const channelJid = args[1]; // Example: 120363XXXXXX@newsletter\n    const messageText = args.slice(2).join(' ');\n\n    if (!channelJid || !messageText) {\n        return m.reply('\u274c Tareeqa: .sendchannel 120363xxx@newsletter Salam doston!');\n    }\n\n    try {\n        await sock.sendMessage(channelJid, { text: messageText });\n        m.reply('\u2705 Message channel mein bhej diya gaya!');\n    } catch (e) {\n        m.reply('\u274c Error: Bot channel ka admin hai? JID sahi hai?');\n    }\n}"
const NL = '120363000000000001@newsletter'
const sentTo = (sock, jid) => sock.sent.filter(s => s.jid === jid && s.content?.text).map(s => s.content.text)
cc._setResolver(async (host) => host === 'evil.example' ? [{ address: '10.1.2.3', family: 4 }] : [{ address: '93.184.216.34', family: 4 }])
const webCalls = []
cc._setTransport(async (u, opts) => { webCalls.push(opts.method + ' ' + u.href); return { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ content: 'Sabr karo', path: u.pathname })) } })

await t('runner: sleep / setTimeout / delay chalte hain (15 sec limit ke andar)', async () => {
  assert.equal(cc.WALL_MS, 15000)
  cc.applyData({ cmds: [{ name: 'slowx', code: "const t0 = Date.now(); await sleep(1200); await delay(100); setTimeout(() => m.reply('late'), 300); await new Promise(r => setTimeout(r, 50)); await ctx.reply('slept ' + (Date.now() - t0 >= 1300))" }] })
  const { sock } = await run(OWNER, '.slowx')
  assert.deepEqual(texts(sock), ['slept true', 'late'])
})

await t('runner: axios.get / axios.post / fetch https (parent karta hai, mock)', async () => {
  webCalls.length = 0
  cc.applyData({ cmds: [{ name: 'quoteapi', code: "const axios = require('axios'); const r = await axios.get('https://api.quotable.io/random'); const p = await axios.post('https://api.example.com/x', { a: 1 }); const f = await (await fetch('https://api.example.com/f')).json(); await m.reply('💬 ' + r.data.content + ' | ' + p.status + ' | ' + f.path)" }] })
  const { sock } = await run(OWNER, '.quoteapi')
  assert.deepEqual(texts(sock), ['💬 Sabr karo | 200 | /f'])
  assert.deepEqual(webCalls, ['GET https://api.quotable.io/random', 'POST https://api.example.com/x', 'GET https://api.example.com/f'])
})

await t('runner: http, localhost, private IP (seedha ya DNS se) blocked', async () => {
  webCalls.length = 0
  cc.applyData({ cmds: [{ name: 'web', code: "const out = []; for (const u of ['http://example.com/', 'https://127.0.0.1/', 'https://10.0.0.5/x', 'https://localhost/', 'https://evil.example/', 'https://[::1]/', 'https://169.254.169.254/latest']) { try { await axios.get(u); out.push('OK') } catch (e) { out.push('X') } } await m.reply(out.join(''))" }] })
  const { sock } = await run(OWNER, '.web')
  assert.deepEqual(texts(sock), ['XXXXXXX'])
  assert.deepEqual(webCalls, [], 'koi request bahar nahi gayi')
})

await t('runner: require sirf axios / path / temp fs; child_process, process, os, net nahi', async () => {
  cc.applyData({ cmds: [{ name: 'req', code: "const out = [typeof require('axios').get, require('path').join('a', '..', 'b.txt')]; for (const n of ['child_process', 'process', 'os', 'net', 'http', 'vm', 'worker_threads', 'moment']) { try { require(n); out.push(n + ':OK') } catch (e) { out.push(n + ':X') } } out.push(typeof process); await m.reply(out.join(' '))" }] })
  const { sock } = await run(OWNER, '.req')
  assert.deepEqual(texts(sock), ['function b.txt child_process:X process:X os:X net:X http:X vm:X worker_threads:X moment:X undefined'])
})

await t('runner: fs sirf apna temp folder — bahar ka path / escape blocked', async () => {
  cc.applyData({ cmds: [{ name: 'files', code: "const fs = require('fs'); fs.writeFileSync('note.txt', 'salam'); const out = [fs.readFileSync('note.txt', 'utf8'), String(fs.existsSync('note.txt'))]; for (const p of ['../x.txt', '/etc/passwd', 'a/b.txt', '../../config.js', '/home/runner/.env']) { try { fs.readFileSync(p, 'utf8'); out.push('READ') } catch (e) { out.push('X') } try { fs.writeFileSync(p, 'x'); out.push('WROTE') } catch (e) { out.push('X') } } fs.unlinkSync('note.txt'); out.push(String(fs.existsSync('note.txt'))); await m.reply(out.join(' '))" }] })
  const { sock } = await run(OWNER, '.files')
  assert.deepEqual(texts(sock), ['salam true X X X X X X X X X X false'])
})

await t('runner: pasted .sendchannel snippet — channel pe jata hai, bot apna number theek, random jid nahi', async () => {
  cc._resetSockRate()
  cc.applyData({ cmds: [{ name: 'sendchannel', code: SNIPPET }] })
  const a = await run(OWNER, `.sendchannel ${NL} Salam doston aaj live hai`)
  assert.deepEqual(sentTo(a.sock, NL), ['Salam doston aaj live hai'])
  assert.ok(texts(a.sock).includes('✅ Message channel mein bhej diya gaya!'), texts(a.sock).join(' / '))
  const b = await run(OWNER, '.sendchannel 923009999999@s.whatsapp.net hello')
  assert.deepEqual(sentTo(b.sock, '923009999999@s.whatsapp.net'), [], 'random jid pe kuch nahi gaya')
  assert.ok(texts(b.sock).includes('❌ Error: Bot channel ka admin hai? JID sahi hai?'))
  const c = await run(OWNER, `.sendchannel ${NL}`)
  assert.deepEqual(texts(c.sock), ['❌ Tareeqa: .sendchannel 120363xxx@newsletter Salam doston!'])
  cc.applyData({ cmds: [{ name: 'me', code: "await sock.sendMessage('923111111111@s.whatsapp.net', { text: 'apne number pe' }); await sock.sendMessage(m.chat, { text: 'isi chat mein' }); try { await sock.sendMessage('923000000777@s.whatsapp.net', { text: 'x' }) } catch (e) { await m.reply(e.message) }" }] })
  const d = await run(OWNER, '.me')
  assert.deepEqual(sentTo(d.sock, '923111111111@s.whatsapp.net'), ['apne number pe'])
  assert.ok(texts(d.sock).includes('isi chat mein'))
  assert.ok(texts(d.sock).includes('❌ Ye jid allowed nahi'))
})

await t('runner: ek run mein 6th sock.sendMessage blocked', async () => {
  cc._resetSockRate()
  cc.applyData({ cmds: [{ name: 'spam', code: `let ok = 0, err = ''; for (let i = 1; i <= 6; i++) { try { await sock.sendMessage('${NL}', { text: 'post ' + i }); ok++ } catch (e) { err = e.message } } await m.reply(ok + ' | ' + err)` }] })
  const { sock } = await run(OWNER, '.spam')
  assert.equal(sentTo(sock, NL).length, 5)
  assert.ok(/^5 \| ❌ ek command max 5 sendMessage/.test(texts(sock).find(x => x.startsWith('5 |')) || ''), texts(sock).join(' / '))
})

await t('runner: prefix "!" ho tab bhi text.startsWith(".sendchannel ") sach', async () => {
  cc._resetSockRate()
  cc.applyData({ cmds: [{ name: 'sendchannel', code: SNIPPET }] })
  settings.load().prefix = '!'
  try {
    const a = await run(OWNER, `!sendchannel ${NL} Prefix test`)
    assert.deepEqual(sentTo(a.sock, NL), ['Prefix test'], JSON.stringify({ handled: a.handled, sent: a.sock.sent.map(s => [s.jid, s.content?.text]) }))
  } finally { settings.load().prefix = '.' }
})

await t('panel menu song: chunks joined once, remove, half-written upload waits, bad type rejected', async () => {
  cc._resetForTests()
  const got = []
  const hook = async (x) => { got.push(x.remove ? 'remove' : `${x.v}:${x.mime}:${x.buf.length}:${x.name}`) }
  hook.localV = ''
  cc._setSongHook(hook)
  const raw = Buffer.alloc(5000, 3).toString('base64')
  setDoc(H + '_song', { mime: S('audio/mpeg'), name: S('naya.mp3'), size: { integerValue: '5000' }, chunks: { integerValue: '2' }, v: S('s1') })
  setDoc(H + '_s0', { b64: S(raw.slice(0, 4000)), v: S('s1') })
  setDoc(H + '_s1', { b64: S(raw.slice(4000)), v: S('s1') })
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('') })
  await cc.check(); await cc.check(); await cc.check()
  assert.deepEqual(got, ['s1:audio/mpeg:5000:naya.mp3'])
  assert.equal(patches.at(-1).f.song.stringValue, 's1', 'panel ko bataya ke song laga')
  // aadha upload (tukra purane version ka): abhi nahi, agli check pe jab poora ho
  setDoc(H + '_song', { mime: S('audio/ogg'), name: S('b.ogg'), size: { integerValue: '5000' }, chunks: { integerValue: '1' }, v: S('s2') })
  setDoc(H + '_s0', { b64: S(raw), v: S('s1') })
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('') })
  await cc.check()
  assert.equal(got.length, 1)
  setDoc(H + '_s0', { b64: S(raw), v: S('s2') })
  await cc.check()
  assert.deepEqual(got.slice(1), ['s2:audio/ogg:5000:b.ogg'])
  // Remove button
  setDoc(H + '_song', { mime: S(''), name: S(''), size: { integerValue: '0' }, chunks: { integerValue: '0' }, v: S('s3') })
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('') })
  await cc.check(); await cc.check()
  assert.deepEqual(got.slice(2), ['remove'])
  assert.equal(patches.at(-1).f.song.stringValue, '')
  // ghalat type
  setDoc(H + '_song', { mime: S('video/mp4'), name: S('x.mp4'), size: { integerValue: '5000' }, chunks: { integerValue: '1' }, v: S('s4') })
  setDoc(H + '_s0', { b64: S(raw), v: S('s4') })
  setDoc(H, { data: S(JSON.stringify({ cmds: [] })), media_v: S('') })
  await cc.check()
  assert.equal(got.length, 3)
  cc._setSongHook(null)
})

await t('panel song file: sab numbers pe .menu ke sath; .setsong wala number apna rakhta hai', async () => {
  const assets = await import('../lib/assets.js')
  const { runAs } = await import('../lib/ctx.js')
  const pathMod = (await import('path')).default
  assets.removePanelSong()
  assert.equal(runAs('n7157', () => assets.songPath()), assets.ORIGINAL_SONG)
  assets.savePanelSong(Buffer.from('ID3panel'), { v: 'p1', mime: 'audio/mpeg', name: 'p.mp3' })
  // number jis ne kuch set nahi kiya -> panel song
  assert.equal(runAs('n5182', () => assets.songPath()), assets.panelSongFile())
  assert.equal(runAs('main', () => assets.songPath()), assets.panelSongFile())
  // number jis ne .setsong lagaya -> apna
  runAs('n7157', () => { fs.mkdirSync((pathMod).dirname(assets.customSong()), { recursive: true }); fs.writeFileSync(assets.customSong(), 'ID3own') })
  assert.equal(runAs('n7157', () => assets.songPath()), runAs('n7157', () => assets.customSong()))
  // .menu bhejta hai: 5182 pe panel song, 7157 pe apna
  for (const [sid, want] of [['n5182', 'ID3panel'], ['n7157', 'ID3own']]) {
    const sock = mockSock(); const bot = mockBot(sock)
    await runAs(sid, async () => {
      settings.load().menuSong = true
      const ctx = await buildCtx(bot, pmsg(OWNER, '.menu'))
      await dispatch(ctx)
    })
    const au = sock.sent.find(s => s.content?.audio)
    assert.ok(au, sid + ': song nahi gaya')
    assert.equal(Buffer.from(au.content.audio).toString(), want)
    assert.equal(au.content.mimetype, 'audio/mpeg')
  }
  assets.removePanelSong()
  assert.equal(runAs('n5182', () => assets.songPath()), assets.ORIGINAL_SONG)
})

fs.rmSync('./tmp-test-cc', { recursive: true, force: true })
fs.rmSync('./tmp-test-cc-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} customcmds: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
