// Voice changer — real ffmpeg: har effect chalta hai, pitch/speed sahi badalti hai. Run: node test/voice.js
process.env.DATA_DIR = './tmp-test-voice'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-voice-session'
const fs = await import('fs')
const crypto = await import('crypto')
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins, commands } = await import('../lib/plugins.js')
const { buildCtx, dispatch, handleMessage } = await import('../lib/handler.js')
const { VOICES, changeVoice } = await import('../lib/voice.js')
const { run, tmpFile } = await import('../lib/utils.js')
const config = (await import('../config.js')).default

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', String(e.stderr || e.message).slice(0, 400)) } }
fs.rmSync('./tmp-test-voice', { recursive: true, force: true })
settings._reset?.()
await loadPlugins()

// 3 sec "awaz": 200 Hz + harmonics (pitch napne ke liye), ogg/opus jaise WhatsApp voice note
const inp = tmpFile('ogg')
await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*200*t)+0.2*sin(2*PI*400*t)+0.1*sin(2*PI*600*t)':s=16000:d=3", '-c:a', 'libopus', '-b:a', '32k', inp])
const VOICE = fs.readFileSync(inp)
async function pcm (buf) { const f = tmpFile('ogg'); fs.writeFileSync(f, buf); const o = tmpFile('raw'); await run(config.ffmpeg, ['-y', '-v', 'error', '-i', f, '-ac', '1', '-ar', '16000', '-f', 'f32le', o]); const b = fs.readFileSync(o); return new Float32Array(b.buffer, b.byteOffset, b.length / 4) }
function f0 (x) { // middle 0.1 sec ka autocorrelation pitch
  const N = 1600, s = Math.floor(x.length / 2) - N / 2, fr = x.slice(s, s + N); let best = 0, bk = 0
  for (let k = 16000 / 900 | 0; k < 16000 / 60; k++) { let a = 0; for (let i = 0; i + k < N; i++) a += fr[i] * fr[i + k]; if (a > best) { best = a; bk = k } }
  return 16000 / bk
}
const dur = x => x.length / 16000

console.log('\n[voice] effects (real ffmpeg)')
const outs = {}
await t(`${Object.keys(VOICES).length} effects -> ogg/opus voice note`, async () => {
  const bad = []
  for (const n of Object.keys(VOICES)) { try { const o = await changeVoice(VOICE, n); if (o.slice(0, 4).toString() !== 'OggS') bad.push(n + ' not ogg'); outs[n] = o } catch (e) { bad.push(n + ': ' + String(e.stderr || e.message).slice(0, 120)) } }
  assert.deepStrictEqual(bad, [])
  assert.ok(Object.keys(VOICES).length >= 16)
})
await t('har effect ka output alag (koi do bilkul same nahi)', () => {
  const h = Object.entries(outs).map(([n, b]) => crypto.createHash('md5').update(b).digest('hex'))
  assert.strictEqual(new Set(h).size, h.length)
})
await t('pitch: deep/demon neeche, chipmunk/girl/nightcore ooper; fast/slow ki pitch wahi', async () => {
  const base = f0(await pcm(VOICE))
  const r = {}; for (const n of ['deep', 'demon', 'chipmunk', 'girl', 'nightcore', 'fast', 'slow']) r[n] = f0(await pcm(outs[n])) / base
  assert.ok(r.deep < 0.85 && r.demon < 0.7, JSON.stringify(r)); assert.ok(r.chipmunk > 1.45 && r.girl > 1.15 && r.nightcore > 1.15, JSON.stringify(r))
  assert.ok(Math.abs(r.fast - 1) < 0.08 && Math.abs(r.slow - 1) < 0.08, JSON.stringify(r))
})
await t('speed: fast/tupai/nightcore chhote, slow/slowed lambe', async () => {
  const d0 = dur(await pcm(VOICE)); const d = {}; for (const n of ['fast', 'tupai', 'nightcore', 'slow', 'slowed', 'deep']) d[n] = dur(await pcm(outs[n])) / d0
  assert.ok(d.fast < 0.75 && d.tupai < 0.8 && d.nightcore < 0.9, JSON.stringify(d)); assert.ok(d.slow > 1.3 && d.slowed > 1.1, JSON.stringify(d)); assert.ok(Math.abs(d.deep - 1) < 0.1)
})
await t('earrape bhi limiter se capped (peak <= ~0.95), khali audio = error', async () => {
  const x = await pcm(outs.earrape); let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); assert.ok(p <= 0.98, 'peak ' + p)
  await assert.rejects(changeVoice(Buffer.alloc(10), 'bass'), /Audio/); await assert.rejects(changeVoice(VOICE, 'nope'), /style/)
})

console.log('\n[voice] commands')
function mockSock () { const sent = []; return { sent, user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} } }
const mockBot = sock => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' })
const reply = (text, quotedMessage) => ({ key: { remoteJid: '923000000005@s.whatsapp.net', id: 'R' + Math.random(), fromMe: false }, message: { extendedTextMessage: { text, contextInfo: { stanzaId: 'Q', participant: '923000000005@s.whatsapp.net', quotedMessage } } } })
await t('voice note pe reply .chipmunk / .squirrel / .robot -> ptt voice note', async () => {
  for (const c of ['.chipmunk', '.squirrel', '.robot', '.bass']) {
    const sock = mockSock(); const ctx = await buildCtx(mockBot(sock), reply(c, { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } })); ctx.download = async () => VOICE
    await dispatch(ctx)
    const a = sock.sent.find(s => s.content?.audio); assert.ok(a && a.content.ptt === true && /opus/.test(a.content.mimetype), c)
  }
})
await t('.reverse: voice pe = ulti awaz, text pe = ulta text; .bass bina reply = usage; .voicefx list', async () => {
  let sock = mockSock(); let ctx = await buildCtx(mockBot(sock), reply('.reverse', { audioMessage: { mimetype: 'audio/ogg' } })); ctx.download = async () => VOICE; await dispatch(ctx)
  assert.ok(sock.sent.find(s => s.content?.audio))
  sock = mockSock(); await handleMessage(mockBot(sock), { key: { remoteJid: '923000000005@s.whatsapp.net', id: 'T1' }, message: { conversation: '.reverse AQDAS MD' } })
  assert.ok(sock.sent.some(s => (s.content?.text || '').includes('DM SADQA')))
  sock = mockSock(); await handleMessage(mockBot(sock), { key: { remoteJid: '923000000005@s.whatsapp.net', id: 'T2' }, message: { conversation: '.bass' } })
  assert.ok(sock.sent.some(s => /reply/.test(s.content?.text || '')))
  sock = mockSock(); await handleMessage(mockBot(sock), { key: { remoteJid: '923000000005@s.whatsapp.net', id: 'T3' }, message: { conversation: '.voicefx' } })
  const txt = sock.sent.find(s => s.content?.text)?.content.text || ''; for (const n of Object.keys(VOICES)) assert.ok(txt.includes('.' + n), n)
  for (const n of Object.keys(VOICES)) assert.strictEqual(commands.get(n)?.category, 'voice', n)
})

fs.rmSync('./tmp-test-voice', { recursive: true, force: true }); fs.rmSync('./tmp-test-voice-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} voice: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
