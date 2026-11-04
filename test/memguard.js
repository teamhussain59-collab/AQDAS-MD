// Unlimited pairing: slot cap hata, memory guard (RAM / heap) nayi pairing politely mana karta hai
// Run: node test/memguard.js
process.env.DATA_DIR = './tmp-test-mem'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-mem-session'
process.env.MAX_SESSIONS = '2' // purana env: ab koi asar nahi
const fs = await import('fs')
const assert = (await import('assert')).default
const mg = await import('../lib/memguard.js')
const manager = await import('../lib/sessions.js')
const { loadPlugins } = await import('../lib/plugins.js')
const { handleMessage } = await import('../lib/handler.js')

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.message) } }
const GB = 1024 ** 3
const heap = pct => () => ({ used_heap_size: 4 * GB * pct / 100, heap_size_limit: 4 * GB })

console.log('\n[mem] guard')
await t('/proc/meminfo se MemAvailable padhta hai', async () => {
  assert.strictEqual(mg.availableMB(() => 'MemTotal: 16380000 kB\nMemFree: 900000 kB\nMemAvailable: 12288000 kB\n'), 12000)
  assert.ok(mg.availableMB(() => { throw new Error('no /proc') }) > 0) // fallback os.freemem
})
await t('RAM kaafi -> ok; 700 MB se kam -> polite mana; heap 85%+ -> mana', async () => {
  mg._setProbe({ availableMB: () => 9000, heap: heap(30) }); assert.strictEqual(mg.check().ok, true)
  mg._setProbe({ availableMB: () => 650, heap: heap(30) }); let c = mg.check(); assert.strictEqual(c.ok, false); assert.ok(/memory abhi full.*650 MB.*try karo/i.test(c.reason), c.reason)
  mg._setProbe({ availableMB: () => 9000, heap: heap(90) }); c = mg.check(); assert.strictEqual(c.ok, false); assert.ok(/90%/.test(c.reason))
})
await t('koi slot ginti nahi: MAX_SESSIONS="unlimited", accepting() sirf memory pe', async () => {
  assert.strictEqual(manager.MAX_SESSIONS, 'unlimited')
  mg._setProbe({ availableMB: () => 9000, heap: heap(30) }); assert.strictEqual(manager.accepting(), true); assert.strictEqual(manager.busyReason(), null)
  mg._setProbe({ availableMB: () => 500, heap: heap(30) }); assert.strictEqual(manager.accepting(), false); assert.ok(/memory/.test(manager.busyReason()))
})
await t('pairGuest low memory pe 503 + wajah (WhatsApp socket khole bagair)', async () => {
  mg._setProbe({ availableMB: () => 500, heap: heap(30) })
  await assert.rejects(() => manager.pairGuest('923001112233'), e => e.code === 503 && /memory/.test(e.message))
  assert.strictEqual(manager.slotsUsed(), 0)
})
await t('.pair command low memory pe polite jawab, anti-spam limit wesi hi', async () => {
  await loadPlugins()
  const sent = []
  const sock = { user: { id: '923111111111:5@s.whatsapp.net' }, sendMessage: async (jid, c) => { sent.push(c); return { key: { id: 'k' } } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} }
  await handleMessage({ sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' }, { key: { remoteJid: '923004445566@s.whatsapp.net', id: 'P1', fromMe: false }, pushName: 'x', message: { conversation: '.pair 923004445566' } })
  const txt = sent.map(c => c.text).join(' | ')
  assert.ok(/😔 .*memory/.test(txt), txt)
  assert.ok(!/slots full|\/10/i.test(txt))
  const pl = fs.readFileSync(new URL('../lib/pairlimit.js', import.meta.url), 'utf8'); assert.ok(/export function check/.test(pl) && /export function note/.test(pl))
})
await t('stats(): RAM, heap, per-number MB aur "kitne aur" ka andaza', async () => {
  mg._setProbe({ availableMB: () => 12000, heap: heap(20) })
  mg.markBaseline()
  const s0 = mg.stats(0); assert.strictEqual(s0.per_session_mb, null); assert.strictEqual(s0.free_mb, 12000)
  assert.strictEqual(s0.room_for, Math.min(Math.floor((12000 - 700) / 60), Math.floor((4096 * 0.85 - 4096 * 0.2) / 36)))
  for (const k of ['total_mb', 'rss_mb', 'heap_mb', 'heap_limit_mb']) assert.ok(s0[k] >= 0, k)
})
await t('kahin "10 slots" / MAX_SESSIONS cap baqi nahi (lib, plugins, web, main)', async () => {
  for (const f of ['lib/sessions.js', 'lib/web.js', 'plugins/extra.js', 'main.js']) {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
    assert.ok(!/10 slots|guests\.size\s*[<>]=?\s*MAX_SESSIONS|Slots full/.test(s), f)
  }
})

fs.rmSync('./tmp-test-mem', { recursive: true, force: true }); fs.rmSync('./tmp-test-mem-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} memguard: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
