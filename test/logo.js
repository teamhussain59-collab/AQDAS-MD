// Logo maker: real ffmpeg (libass) — har style asli image banata hai. Run: node test/logo.js
process.env.DATA_DIR = './tmp-test-logo'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-logo-session'
const fs = await import('fs')
const path = await import('path')
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins, commands, list } = await import('../lib/plugins.js')
const { handleMessage } = await import('../lib/handler.js')
const logo = await import('../lib/logo.js')
const { makeLimiter } = await import('../lib/limit.js')
const { run } = await import('../lib/utils.js')

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', String(e.stderr || e.message).slice(0, 400)) } }
fs.rmSync('./tmp-test-logo', { recursive: true, force: true })
settings._reset?.()
await loadPlugins()

function mockSock () {
  const sent = []
  return { sent, user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid' }, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} }
}
const mockBot = sock => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' })
const pmsg = text => ({ key: { remoteJid: '923000000005@s.whatsapp.net', id: 'P' + Math.random(), fromMe: false }, pushName: 'u', message: { conversation: text } })
const jpegSize = async buf => { const f = './tmp-test-logo/x.jpg'; fs.mkdirSync('./tmp-test-logo', { recursive: true }); fs.writeFileSync(f, buf); const { stdout } = await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]); return stdout.trim() }

console.log('\n[logo] styles')
const names = logo.styleNames()
await t(`60-100 styles (${names.length}), har ek ka font + metrics bundled`, () => {
  assert.ok(names.length >= 60 && names.length <= 100, String(names.length))
  for (const n of names) {
    const s = logo.STYLES[n]
    assert.ok(fs.existsSync(path.join(logo.FONT_DIR, s.font + '.ttf')), 'font missing ' + s.font)
    assert.ok(s.fill && s.bg && s.desc, 'incomplete ' + n)
  }
  assert.ok(fs.existsSync(path.join(logo.FONT_DIR, 'OFL.txt')))
})
await t('har style apni command (category logo), kisi aur command / alias se takkar nahi', () => {
  for (const n of names) { const c = commands.get(n); assert.ok(c && c.category === 'logo' && c.name === n, 'not registered: ' + n) }
  assert.ok(commands.get('logo') && commands.get('neon') && commands.get('glitch') && commands.get('3d') && commands.get('blackpink'))
})
await t('layout: lamba text 2-3 lines, chhota 1 line, canvas ke andar', () => {
  const a = logo.layout('Anton', 'AQDAS'); assert.strictEqual(a.lines.length, 1)
  const b = logo.layout('Anton', 'AQDAS HACKER BOT KING OF WHATSAPP'); assert.ok(b.lines.length >= 2)
  for (const L of [a, b]) { assert.ok(L.box.x0 >= 0 && L.box.x1 <= logo.W && L.box.y0 >= 0 && L.box.y1 <= logo.H, JSON.stringify(L.box)) }
})

console.log('\n[logo] real ffmpeg render (sab styles)')
const sizes = {}
await t(`${names.length} styles render (jpeg, ${logo.W}x${logo.H})`, async () => {
  const bad = []
  const lim = makeLimiter(4)
  await Promise.all(names.map(n => lim(async () => {
    try { const b = await logo.makeLogo(n, 'AQDAS Hacker'); if (!(b[0] === 0xff && b[1] === 0xd8) || b.length < 15000) bad.push(n + ' small'); sizes[n] = b.length } catch (e) { bad.push(n + ': ' + String(e.stderr || e.message).slice(0, 200)) }
  })))
  assert.deepStrictEqual(bad, [])
})
await t('image size sahi + styles waqai alag (file size bohat milte nahi)', async () => {
  const b = await logo.makeLogo('neon', 'AQDAS')
  assert.strictEqual(await jpegSize(b), `${logo.W},${logo.H}`)
  const uniq = new Set(Object.values(sizes)); assert.ok(uniq.size >= names.length - 2, 'too many identical renders')
})
await t("ajeeb characters (' % : \\ { }) aur lowercase script style bhi", async () => {
  for (const [s, txt] of [['signature', "Ali's 100% : test {x}"], ['gothic', 'back\\slash'], ['pixel', '12:30 %d']]) {
    const b = await logo.makeLogo(s, txt); assert.ok(b.length > 10000)
  }
})
await t('khali / bohat lamba text = saaf error', async () => {
  await assert.rejects(logo.makeLogo('neon', '   '), /Text do/)
  await assert.rejects(logo.makeLogo('neon', 'x'.repeat(logo.MAX_CHARS + 1)), /lamba/)
  await assert.rejects(logo.makeLogo('nosuchstyle', 'A'), /style/)
})

console.log('\n[logo] commands')
await t('.neon AQDAS HACKER -> image reply', async () => {
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.neon AQDAS HACKER'))
  const img = sock.sent.find(s => s.content?.image); assert.ok(img && img.content.image.length > 20000 && /NEON/.test(img.content.caption))
})
await t('.logo -> sab styles ki list; .logo fire AQDAS -> image; .fire bina text -> usage', async () => {
  let sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.logo'))
  const txt = sock.sent.find(s => s.content?.text)?.content.text || ''
  for (const n of names) assert.ok(txt.includes('.' + n), 'list missing ' + n)
  sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.logo fire AQDAS')); assert.ok(sock.sent.find(s => s.content?.image))
  sock = mockSock(); await handleMessage(mockBot(sock), pmsg('.fire')); assert.ok(sock.sent.some(s => /Use:/.test(s.content?.text || '')))
})
await t('limiter: ek waqt mein max N kaam', async () => {
  const lim = makeLimiter(2); let now = 0, peak = 0
  await Promise.all(Array.from({ length: 7 }, () => lim(async () => { now++; peak = Math.max(peak, now); await new Promise(r => setTimeout(r, 15)); now-- })))
  assert.strictEqual(peak, 2)
})

fs.rmSync('./tmp-test-logo', { recursive: true, force: true }); fs.rmSync('./tmp-test-logo-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} logo: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
