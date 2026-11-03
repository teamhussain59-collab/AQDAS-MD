// .pair public + anti-spam tests (mock socket, no WhatsApp). Run: node test/pair.js
process.env.DATA_DIR = './tmp-test-pair'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-pair-session'
process.env.RCH_API_URL = 'https://rch.invalid/api/Fun/Rch' // test kabhi asli quota na khaye
const fs = await import('fs')
const assert = (await import('assert')).default
fs.rmSync('./tmp-test-pair', { recursive: true, force: true })
const settings = await import('../lib/settings.js')
const { loadPlugins, commands } = await import('../lib/plugins.js')
const { handleMessage } = await import('../lib/handler.js')
const { menuText } = await import('../plugins/main.js')
const lim = await import('../lib/pairlimit.js')
const { bot: mainBot } = await import('../lib/bot.js')

let pass = 0, fail = 0
async function t (name, fn) { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.message) } }

function mockSock () {
  const sent = []
  return {
    sent,
    user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid', name: 'AQDAS MD' },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } },
    readMessages: async () => {}, sendPresenceUpdate: async () => {},
    groupMetadata: async () => ({ id: GJ, subject: 'G', participants: [{ id: '200000000003@lid', phoneNumber: '923000000003@s.whatsapp.net', admin: null }] })
  }
}
const GJ = '120363000000000000@g.us'
const mockBot = sock => ({ sock, groupCache: new Map(), remember () {}, groupMeta: async j => sock.groupMetadata(j), status: 'open' })
const pmsg = (from, text) => ({ key: { remoteJid: from, id: 'P' + Math.random(), fromMe: false }, pushName: 'u', message: { conversation: text } })
const gmsg = (participant, text) => ({ key: { remoteJid: GJ, id: 'G' + Math.random(), participant, fromMe: false }, pushName: 'u', message: { conversation: text } })
const send = async (m) => { const sock = mockSock(); await handleMessage(mockBot(sock), m); return sock.sent.filter(s => s.content?.text).map(s => s.content.text).join('\n') }

settings._reset()
await loadPlugins()

console.log('\n[pair] limiter (pure, injected clock)')
const T0 = 1_000_000_000
await t('first request ok, same requester blocked for 10 min (other target)', () => {
  lim._reset()
  const a = { requesters: ['923000000005'], target: '923001111111', now: T0 }
  assert.ok(lim.check(a).ok); lim.note(a)
  const b = lim.check({ requesters: ['923000000005'], target: '923002222222', now: T0 + 9 * 60000 })
  assert.equal(b.reason, 'user'); assert.ok(b.msg.includes('10 min'))
  assert.ok(lim.check({ requesters: ['923000000005'], target: '923002222222', now: T0 + 10 * 60000 + 1 }).ok)
})
await t('same target blocked for 2 min for anyone (owner too), free after', () => {
  lim._reset()
  lim.note({ requesters: ['a1'], target: '923001111111', now: T0 })
  assert.equal(lim.check({ requesters: ['b2'], target: '923001111111', now: T0 + 119000 }).reason, 'target')
  assert.equal(lim.check({ requesters: ['own'], target: '923001111111', exempt: true, now: T0 + 60000 }).reason, 'target')
  assert.ok(lim.check({ requesters: ['b2'], target: '923001111111', now: T0 + 120001 }).ok)
})
await t('any of sender ids (phone / lid) counts as same requester', () => {
  lim._reset()
  lim.note({ requesters: ['923000000005', '200000000005'], target: '923001111111', now: T0 })
  assert.equal(lim.check({ requesters: ['200000000005'], target: '923003333333', now: T0 + 1000 }).reason, 'user')
})
await t('global cap 20 / hour, frees after the oldest leaves the hour', () => {
  lim._reset()
  for (let i = 0; i < 20; i++) lim.note({ requesters: ['u' + i], target: '9230010000' + String(i).padStart(2, '0'), now: T0 + i * 1000 })
  const c = lim.check({ requesters: ['new'], target: '923009999999', now: T0 + 30000 })
  assert.equal(c.reason, 'global'); assert.ok(c.msg.includes('bohat log'))
  assert.ok(lim.check({ requesters: ['new'], target: '923009999999', now: T0 + 3600000 + 1 }).ok)
})
await t('owner exempt from user + global limits', () => {
  lim._reset()
  for (let i = 0; i < 20; i++) lim.note({ requesters: ['u' + i], target: '9230010000' + String(i).padStart(2, '0'), now: T0 })
  lim.note({ requesters: ['923000000001'], target: '923004444444', exempt: true, now: T0 })
  assert.ok(lim.check({ requesters: ['923000000001'], target: '923005555555', exempt: true, now: T0 + 1000 }).ok)
})

console.log('\n[pair] command via dispatch (public, groups, private mode)')
await t('.pair is public (not owner) and in PUBLIC menu section, not OWNER', () => {
  const c = commands.get('pair'); assert.ok(c && !c.owner && !c.superOwner && c.public && c.category === 'public')
  const m = menuText({ settings })
  const pub = m.indexOf('PUBLIC (SAB KE LIYE)'); const own = m.indexOf('*OWNER*')
  assert.ok(pub > 0 && own > pub, 'sections'); const p = m.indexOf('.pair')
  assert.ok(p > pub && p < own, '.pair not under PUBLIC')
})
await t('stranger without number gets usage (no owner refusal)', async () => {
  const out = await send(pmsg('923000000007@s.whatsapp.net', '.pair'))
  assert.ok(out.includes('Use:') && !out.includes('owner'), out)
})
await t('already linked number (bot itself) refused, no limit spent', async () => {
  lim._reset(); mainBot.pairNumber = '923111111111'
  const out = await send(pmsg('923000000007@s.whatsapp.net', '.pair 03111111111'))
  assert.ok(out.includes('pehle se bot se juda'), out)
  assert.ok(lim.check({ requesters: ['923000000007'], target: '923222222222' }).ok)
})
await t('stranger on cooldown is told to wait (DM)', async () => {
  lim._reset(); lim.note({ requesters: ['923000000007'], target: '923001111111' })
  const out = await send(pmsg('923000000007@s.whatsapp.net', '.pair 3001234567'))
  assert.ok(out.includes('10 min mein 1 dafa'), out)
})
await t('group member, bot in PRIVATE mode: .pair still answers (target cooldown msg)', async () => {
  lim._reset(); settings.set('mode', 'private')
  lim.note({ requesters: ['someone'], target: '923001234567' })
  const out = await send(gmsg('200000000003@lid', '.pair +92 300 1234567'))
  assert.ok(out.includes('abhi abhi bheja gaya'), out)
  const other = await send(gmsg('200000000003@lid', '.menu')) // private mode still blocks normal commands
  assert.equal(other, '')
  settings.set('mode', 'public')
})
await t('global cap reaches strangers via command', async () => {
  lim._reset()
  for (let i = 0; i < 20; i++) lim.note({ requesters: ['u' + i], target: '9230010000' + String(i).padStart(2, '0') })
  const out = await send(pmsg('923000000008@s.whatsapp.net', '.pair 923007777777'))
  assert.ok(out.includes('bohat log'), out)
})

console.log('\n[rch] channel reaction API (mock fetch, no real call)')
const rch = await import('../lib/rch.js')
const fakeRes = (status, body) => ({ ok: status < 300, status, json: async () => body })
const OKBODY = { statusCode: 200, success: true, source: 'X', data: { ok: true, message: 'masuk antrean', task_id: 'vipapi-SECRET1', vip_key: 'VIP-SECRET2', points_remaining: 999, usage_today: 17, limit: 50 } }
await t('link + emoji parsing (max 5, joined emojis split)', () => {
  assert.equal(rch.parseLink('https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/1917'), 'https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/1917')
  assert.equal(rch.parseLink('https://evil.com/channel/0029Vb785rSBlHpWSitPY61i/1917'), null)
  assert.equal(rch.parseLink('https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i'), null)
  assert.deepEqual(rch.parseEmojis(['🔥❤️,😂', 'abc', '👍🏽']), ['🔥', '❤️', '😂', '👍🏽'])
})
await t('react(): builds encoded URL, returns only ok/usage (no secrets)', async () => {
  rch._reset(); let called = ''
  const r = await rch.react('https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/1917', ['🤫', '🤗'], { fetchImpl: async u => { called = u; return fakeRes(200, OKBODY) } })
  assert.ok(called.startsWith('https://rch.invalid/api/Fun/Rch?action=react&url=https%3A%2F%2Fwhatsapp.com%2Fchannel%2F0029Vb785rSBlHpWSitPY61i%2F1917&emoji=%F0%9F%A4%AB%2C%F0%9F%A4%97'), called)
  assert.deepEqual(r, { ok: true, used: 17, limit: 50 })
})
await t('react(): failure message shown briefly, keys scrubbed; timeout friendly', async () => {
  rch._reset()
  const r = await rch.react('https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/1', ['🔥'], { fetchImpl: async () => fakeRes(400, { success: false, message: 'Invalid key VIP-ABC123' }) })
  assert.equal(r.ok, false); assert.ok(r.message.includes('Invalid key') && !r.message.includes('ABC123'), r.message)
  const t2 = await rch.react('https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/1', ['🔥'], { fetchImpl: async () => { throw new Error('timeout') } })
  assert.ok(!t2.ok && t2.message.includes('30 sec'))
})
await t('no per-user limit or quota pre-block: only 5 s same-chat flood guard', async () => {
  rch._reset(); const now = Date.now()
  assert.ok(rch.check({ chat: 'A', now }).ok)
  assert.equal(rch.check({ chat: 'A', now: now + 4000 }).reason, 'flood')
  assert.ok(rch.check({ chat: 'B', now: now + 4000 }).ok)
  assert.ok(rch.check({ chat: 'A', now: now + 5001 }).ok)
  const r = await rch.react('https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/1', ['🔥'], { fetchImpl: async () => fakeRes(200, { success: true, data: { ok: false, message: 'Limit harian habis', usage_today: 50, limit: 50 } }) })
  assert.ok(!r.ok && r.quota && r.message.includes('Limit harian'))
  assert.ok(rch.check({ chat: 'C', now: now + 6000 }).ok, 'API limit must not pre-block next call')
})
await t('.rch is public, in PUBLIC menu section; bad input gets usage; flood guard via dispatch', async () => {
  const c = commands.get('rch'); assert.ok(c && c.public && !c.owner && c.category === 'public' && commands.get('chreactapi') && commands.get('rreact'))
  const m = menuText({ settings }); const pub = m.indexOf('PUBLIC (SAB KE LIYE)'); const own = m.indexOf('*OWNER*'); const p = m.indexOf('.rch')
  assert.ok(p > pub && p < own, '.rch not under PUBLIC')
  rch._reset()
  assert.ok((await send(pmsg('923000000007@s.whatsapp.net', '.rch'))).includes('Use:'))
  assert.ok((await send(pmsg('923000000007@s.whatsapp.net', '.rch https://x.com/a 🔥'))).includes('Link sahi nahi'))
  assert.ok((await send(pmsg('923000000007@s.whatsapp.net', '.rch https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/5'))).includes('Emoji bhi'))
  assert.ok((await send(pmsg('923000000007@s.whatsapp.net', '.rch https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/5 😀😁😂🤣😃😄'))).includes('Zyada se zyada 5'))
  rch.check({ chat: '923000000007@s.whatsapp.net' }) // just used in this chat
  assert.ok((await send(pmsg('923000000007@s.whatsapp.net', '.rch https://whatsapp.com/channel/0029Vb785rSBlHpWSitPY61i/5 🔥'))).includes('5 sec baad'))
})

fs.rmSync('./tmp-test-pair', { recursive: true, force: true }); fs.rmSync('./tmp-test-pair-session', { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
