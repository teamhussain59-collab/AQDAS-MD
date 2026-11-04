// AI tests: key fallback (secret nahi -> Firestore settings/openrouter), model fallback, auto AI. Run: node test/ai.js
process.env.DATA_DIR = './tmp-test-ai'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-ai-session'
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_KEY; delete process.env.FIREBASE_SA
const fs = await import('fs')
const assert = (await import('assert')).default
const config = (await import('../config.js')).default
const settings = await import('../lib/settings.js')
const ai = await import('../lib/ai.js')
const cc = await import('../lib/customcmds.js')
const handler = await import('../lib/handler.js')
const { runAs } = await import('../lib/ctx.js')
const { loadPlugins } = await import('../lib/plugins.js')
await loadPlugins()

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.stack || e.message) } }
fs.rmSync('./tmp-test-ai', { recursive: true, force: true })
settings._reset()

const ok = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) })
const err = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) })

await t('secret nahi: Firestore settings/openrouter wali key use hoti hai (log/reply mein key nahi)', async () => {
  config.openrouterKey = ''
  cc._resetForTests()
  let reads = 0
  cc._setFetcher(async (p) => { if (p === 'settings/openrouter') { reads++; return { fields: { key: { stringValue: 'sk-or-v1-fromfirestore' } } } } return null })
  let auth
  const a = await ai.askAI('k1', 'salam', { fetchImpl: async (u, o) => { auth = o.headers.Authorization; return ok('Wa alaikum salam') } })
  assert.equal(a, 'Wa alaikum salam')
  assert.equal(auth, 'Bearer sk-or-v1-fromfirestore')
  await ai.askAI('k1', 'aur', { fetchImpl: async () => ok('x') })
  assert.equal(reads, 1, '10 min cache')
})

await t('secret ho to wahi (Firestore parha bhi nahi jata)', async () => {
  config.openrouterKey = 'sk-or-v1-secret'
  cc._resetForTests()
  let reads = 0
  cc._setFetcher(async () => { reads++; return null })
  let auth
  await ai.askAI('k2', 'q', { fetchImpl: async (u, o) => { auth = o.headers.Authorization; return ok('a') } })
  assert.equal(auth, 'Bearer sk-or-v1-secret'); assert.equal(reads, 0)
  config.openrouterKey = ''
})

await t('kahin bhi key nahi: saaf error', async () => {
  cc._resetForTests()
  cc._setFetcher(async () => null)
  await assert.rejects(() => ai.askAI('k3', 'q', { fetchImpl: async () => ok('a') }), /OPENROUTER_API_KEY/)
})

await t('model busy / credit khatam (429/402): ek dafa free model, 401 pe nahi', async () => {
  const models = []
  const f = async (u, o) => { const m = JSON.parse(o.body).model; models.push(m); return m === ai.AI_FALLBACK_MODEL ? ok('free jawab') : err(429, 'busy') }
  assert.equal(await ai.askAI('k4', 'q', { fetchImpl: f, key: 'k', model: 'openai/gpt-4o-mini' }), 'free jawab')
  assert.deepEqual(models, ['openai/gpt-4o-mini', ai.AI_FALLBACK_MODEL])
  models.length = 0
  await assert.rejects(() => ai.askAI('k5', 'q', { fetchImpl: async (u, o) => { models.push(1); return err(401, 'No auth credentials found') }, key: 'bad' }), /No auth/)
  assert.equal(models.length, 1)
})

await t('auto AI: secret nahi par Firestore key -> DM ka jawab; apne bheje (fromMe) ka nahi', async () => {
  config.openrouterKey = ''
  cc._resetForTests()
  cc._setFetcher(async (p) => p === 'settings/openrouter' ? { fields: { key: { stringValue: 'sk-or-v1-fs' } } } : null)
  globalThis.fetch = async () => ok('Wa alaikum salam!')
  settings.load('aiA').autoAI = true
  const replies = []
  const mk = (id, body, fromMe = false) => ({ msg: { key: { id, fromMe, remoteJid: '92300@s.whatsapp.net' } }, body, isCmd: false, isGroup: false, prefix: '.', jid: '92300@s.whatsapp.net', mentioned: [], quoted: null, sock: { sendPresenceUpdate: async () => {}, user: { id: '1@s.whatsapp.net' } }, reply: async t => replies.push(t), owner: false })
  await runAs('aiA', () => handler.autoAI(mk('AB1', 'salam')))
  assert.deepEqual(replies, ['Wa alaikum salam!'])
  await runAs('aiA', () => handler.autoAI({ ...mk('AB2', 'mera apna message', true), jid: 'other@s.whatsapp.net' }))
  assert.equal(replies.length, 1, 'fromMe skip')
})

await t('.autoai batata hai: apne number se bheje message ka jawab nahi aata', async () => {
  const sent = []
  const sock = { user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid' }, sendMessage: async (j, c) => { sent.push(c); return { key: { id: 'X' } } }, sendPresenceUpdate: async () => {}, readMessages: async () => {} }
  const bot = { sock, groupCache: new Map(), remember () {}, groupMeta: async () => null, status: 'open' }
  const msg = { key: { remoteJid: '923000000001@s.whatsapp.net', id: 'P1', fromMe: false }, pushName: 'u', message: { conversation: '.autoai on' } }
  await runAs('aiB', async () => { const ctx = await handler.buildCtx(bot, msg); await handler.dispatch(ctx) })
  const txt = sent.map(c => c.text || '').join('\n')
  assert.match(txt, /Auto AI ON/); assert.match(txt, /khud\* bheje/); assert.doesNotMatch(txt, /sk-or/)
  assert.equal(runAs('aiB', () => settings.get('autoAI')), true)
})

fs.rmSync('./tmp-test-ai', { recursive: true, force: true })
fs.rmSync('./tmp-test-ai-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} ai: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
