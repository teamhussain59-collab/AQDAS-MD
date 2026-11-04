// .ss / .ssmobile / .ssfull — network mocked (fetch + DNS). Run: node test/screenshot.js
process.env.DATA_DIR = './tmp-test-ss'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-ss-session'
const fs = await import('fs')
const dns = (await import('dns')).default
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins } = await import('../lib/plugins.js')
const { handleMessage } = await import('../lib/handler.js')
const ss = await import('../lib/screenshot.js')

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.message) } }
fs.rmSync('./tmp-test-ss', { recursive: true, force: true })
settings._reset?.()
await loadPlugins()

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8000, 7)])
const res = (status, body, type = 'image/png') => ({ ok: status < 400, status, headers: { get: k => (k.toLowerCase() === 'content-type' ? type : null) }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) })
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

function mockSock () {
  const sent = []
  return { sent, user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} }
}
const mockBot = sock => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' })
const pmsg = text => ({ key: { remoteJid: '923000000001@s.whatsapp.net', id: 'P' + Math.random(), fromMe: false }, pushName: 'u', message: { conversation: text } })

console.log('\n[ss] link check')
await t('normalizeUrl: domain -> https, http/https rakhta hai', () => {
  assert.strictEqual(ss.normalizeUrl('google.com'), 'https://google.com/')
  assert.strictEqual(ss.normalizeUrl('http://example.com/a?b=1'), 'http://example.com/a?b=1')
})
await t('normalizeUrl: ftp / javascript / localhost / private IP / khali = saaf error', () => {
  for (const bad of ['', 'ftp://x.com', 'javascript:alert(1)', 'file:///etc/passwd', 'localhost', 'http://127.0.0.1', 'http://192.168.1.5', 'http://[::1]/', 'http://user:pw@x.com', 'not a link']) {
    assert.throws(() => ss.normalizeUrl(bad), ss.BadUrl, 'should refuse ' + bad)
  }
})
await t('isPrivateIp', () => {
  for (const ip of ['10.1.2.3', '172.20.0.1', '192.168.0.1', '127.0.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.ok(ss.isPrivateIp(ip), ip)
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) assert.ok(!ss.isPrivateIp(ip), ip)
})
await t('checkHost: DNS fail = "website nahi mili", private DNS answer refused', async () => {
  await assert.rejects(ss.checkHost('https://nope.example', async () => { throw new Error('ENOTFOUND') }), /nahi mili/)
  await assert.rejects(ss.checkHost('https://evil.example', async () => [{ address: '10.0.0.5', family: 4 }]), /Private/)
  assert.ok(await ss.checkHost('https://ok.example', publicLookup))
})

console.log('\n[ss] providers + fallback')
await t('pehli service (thum.io) image de to wahi', async () => {
  const urls = []
  const r = await ss.screenshot('example.com', { lookup: publicLookup, fetchImpl: async u => { urls.push(u); return res(200, PNG) } })
  assert.strictEqual(r.provider, 'thum.io'); assert.strictEqual(urls.length, 1)
  assert.ok(urls[0].startsWith('https://image.thum.io/get/width/1280/crop/800/'))
})
await t('thum.io fail -> microlink -> mshots fallback', async () => {
  const urls = []
  const r = await ss.screenshot('https://example.com', { lookup: publicLookup, fetchImpl: async u => { urls.push(u); if (u.includes('thum.io')) return res(502, Buffer.from('bad'), 'text/html'); if (u.includes('microlink')) throw new Error('net'); return res(200, PNG) } })
  assert.strictEqual(r.provider, 'mshots'); assert.strictEqual(urls.length, 3)
})
await t('mshots "generating" GIF / choti file = image nahi maana jata', async () => {
  await assert.rejects(ss.screenshot('https://example.com', { lookup: publicLookup, fetchImpl: async u => (u.includes('mshots') ? res(200, Buffer.alloc(9000, 1), 'image/gif') : res(200, Buffer.from('<html>'), 'text/html')) }), /Screenshot nahi ban saka/)
})
await t('mobile: iphoneX / device / vpw options', () => {
  const p = ss.providers('https://example.com/', { mobile: true })
  assert.ok(p[0].url.includes('/iphoneX/')); assert.ok(p[1].url.includes('device=iPhone')); assert.ok(p[2].url.includes('vpw=390'))
  assert.ok(ss.providers('https://example.com/', { full: true })[0].url.includes('/fullpage/'))
})

console.log('\n[ss] commands')
const origFetch = globalThis.fetch, origLookup = dns.promises.lookup
globalThis.fetch = async () => res(200, PNG); dns.promises.lookup = publicLookup
await t('.ss example.com -> image reply', async () => {
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.ss example.com'))
  const img = sock.sent.find(s => s.content?.image)
  assert.ok(img && img.content.image.length === PNG.length && img.content.caption.includes('https://example.com/'))
})
await t('.screenshot / .ssweb aliases + .ssmobile + .ssfull', async () => {
  for (const c of ['.screenshot example.com', '.ssweb example.com', '.ssmobile example.com', '.ssfull example.com']) {
    const sock = mockSock(); await handleMessage(mockBot(sock), pmsg(c))
    assert.ok(sock.sent.find(s => s.content?.image), 'no image for ' + c)
  }
})
await t('.ss bina link / ftp link -> saaf message, image nahi', async () => {
  for (const [c, re] of [['.ss', /Use:/], ['.ss ftp://x.com', /http/], ['.ss localhost', /public/]]) {
    const sock = mockSock(); await handleMessage(mockBot(sock), pmsg(c))
    assert.ok(!sock.sent.find(s => s.content?.image)); assert.ok(sock.sent.some(s => re.test(s.content?.text || '')), c)
  }
})
globalThis.fetch = origFetch; dns.promises.lookup = origLookup

fs.rmSync('./tmp-test-ss', { recursive: true, force: true }); fs.rmSync('./tmp-test-ss-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} screenshot: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
