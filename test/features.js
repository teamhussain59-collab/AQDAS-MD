// node test/features.js — channel react group, safe mode, animations, auto AI, anti-delete, status pacing (mock sockets)
import assert from 'assert'
import fs from 'fs'
process.env.DATA_DIR = './tmp-feat-data'
fs.rmSync('./tmp-feat-data', { recursive: true, force: true })
let pass = 0, fail = 0
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '-', e.message) } }
const settings = await import('../lib/settings.js')
const ch = await import('../lib/chgroup.js')
const sleeps = []
ch._setSleep(async ms => { sleeps.push(ms) })

const mkBot = (sid, status = 'open') => {
  const reacts = []
  return { sid, reacts, bot: { status, sock: { newsletterMetadata: async () => ({ id: '123@newsletter', name: 'AQDAS' }), newsletterReactMessage: async (jid, post, e) => { reacts.push([jid, post, e]) } } } }
}

await t('fan-out: sirf opt-in + command wala number, ek post pe ek dafa', async () => {
  settings.load('a').chGroup = true; settings.load('b').chGroup = false; settings.load('c').chGroup = true; settings.load('d').chGroup = true
  const a = mkBot('a'), b = mkBot('b'), c = mkBot('c'), d = mkBot('d', 'closed'), me = mkBot('me')
  sleeps.length = 0
  const r = await ch.fanOut({ bots: [a, b, c, d], invite: 'INV', post: '77', emojis: ['❤️', '🔥'], first: me, gap: [3000, 10000] })
  assert.equal(me.reacts.length, 1); assert.equal(a.reacts.length, 1); assert.equal(c.reacts.length, 1)
  assert.equal(b.reacts.length, 0, 'non opt-in reacted!')
  assert.equal(d.reacts.length, 0)
  assert.deepEqual([r.ok, r.skip], [3, 1])
  assert.ok(sleeps.length >= 2 && sleeps.every(s => s >= 3000 && s <= 10000), 'gaps ' + sleeps)
  const emojisUsed = new Set([me, a, c].map(x => x.reacts[0][2])); assert.ok(emojisUsed.size === 2, 'round robin')
  const r2 = await ch.fanOut({ bots: [a, c], invite: 'INV', post: '77', emojis: ['❤️'], first: me })
  assert.equal(r2.ok, 0); assert.equal(a.reacts.length, 1); assert.equal(me.reacts.length, 1)
})
await t('auto mode gap 3-15s, random emoji from list', async () => {
  settings.load('x').chGroup = true; settings.load('y').chGroup = true
  const x = mkBot('x'), y = mkBot('y'); sleeps.length = 0
  const r = await ch.fanOut({ bots: [x, y], invite: 'INV', post: '78', emojis: ['🥰', '🐣'], gap: [3000, 15000], random: true })
  assert.equal(r.ok, 2); assert.ok(['🥰', '🐣'].includes(x.reacts[0][2])); assert.ok(sleeps.every(s => s >= 3000 && s <= 15000))
})
await t('postIds parse + splitEmojis', async () => {
  const node = { tag: 'iq', content: [{ tag: 'message_updates', content: [{ tag: 'messages', content: [{ tag: 'message', attrs: { server_id: '101' } }, { tag: 'message', attrs: { server_id: '99' } }] }] }] }
  assert.deepEqual(ch.postIds(node), [99, 101])
  assert.deepEqual(ch.splitEmojis('❤️🔥 😂,👍🏽'), ['❤️', '🔥', '😂', '👍🏽'])
})

const { wrapSend } = await import('../lib/safemode.js')
await t('safe mode: 20/min had, reactions / edits bina rok', async () => {
  let clock = 0; const waits = []; const out = []
  const sock = { sendMessage: async (j, c) => { out.push([clock, c]); return { key: { id: String(out.length) } } } }
  wrapSend(sock, 'sm', { now: () => clock, sleep: async ms => { waits.push(ms); clock += ms }, typing: () => 500 })
  for (let i = 0; i < 25; i++) await sock.sendMessage('1@s.whatsapp.net', { text: 'hi ' + i })
  await sock.sendMessage('1@s.whatsapp.net', { react: { text: '❤️', key: {} } })
  assert.equal(out.length, 26)
  const first21 = out[20][0]; assert.ok(first21 >= 60000, '21st message waited a minute: ' + first21)
  assert.ok(waits.filter(w => w === 500).length === 25, 'typing pause per text')
  settings.load('sm2').safeMode = false
  const s2 = { sendMessage: async () => 'x' }; wrapSend(s2, 'sm2', { sleep: async () => { throw new Error('should not wait') } })
  assert.equal(await s2.sendMessage('j', { text: 'a' }), 'x')
})

const anim = await import('../plugins/anim.js')
anim._setWait(async () => {})
await t('.battery: 0..100% edits + framed final + magic + Durood', async () => {
  const msgs = []
  const ctx = { jid: 'c@s.whatsapp.net', reply: async (t) => { msgs.push({ text: t }); return { key: { id: 'k' + msgs.length } } }, sock: { sendMessage: async (j, c) => { msgs.push(c) } } }
  await anim.default.find(c => c.name === 'battery').run(ctx)
  const edits = msgs.filter(m => m.edit)
  assert.ok(msgs[0].text.includes('0%')); assert.ok(edits.some(m => m.text.includes('100% ⚡')))
  assert.ok(edits.some(m => m.text.includes('آپ کی خدمت میں حاضر ہے 🤍')))
  assert.ok(msgs.at(-1).text.includes('صَلِّ') && msgs.at(-1).text.includes('AQDAS MD'))
  assert.ok(msgs.filter(m => !m.edit).length === 2, 'two messages, rest edits')
})
await t('.hack: prank steps, khatam pe "Prank tha!", koi asli number nahi', async () => {
  const msgs = []
  const ctx = { jid: 'g@g.us', text: '', mentioned: ['923001112223@s.whatsapp.net'], quoted: null, reply: async (t) => { msgs.push({ text: t }); return { key: { id: 'h' } } }, sock: { sendMessage: async (j, c) => { msgs.push(c) } } }
  await anim.default.find(c => c.name === 'hack').run(ctx)
  const all = msgs.map(m => m.text).join('\n')
  assert.ok(msgs.at(-1).text.includes('Prank tha!')); assert.ok(all.includes('12%') && all.includes('100%'))
  assert.ok(!all.includes('923001112223'), 'real number leaked')
})

const handler = await import('../lib/handler.js')
const { runAs } = await import('../lib/ctx.js')
await t('auto AI: DM pe jawab, apne / bot / command / cooldown skip', async () => {
  const config = (await import('../config.js')).default
  config.openrouterKey = 'test'
  const calls = []
  globalThis.fetch = async (url, o) => { calls.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: 'Wa alaikum salam!' } }] }) } }
  settings.load('ai1').autoAI = true
  const replies = []
  const mk = (id, body, extra = {}) => ({ msg: { key: { id, fromMe: false, remoteJid: '92300@s.whatsapp.net' } }, body, isCmd: false, isGroup: false, prefix: '.', jid: '92300@s.whatsapp.net', mentioned: [], quoted: null, sock: { sendPresenceUpdate: async () => {}, user: { id: '1@s.whatsapp.net' } }, reply: async t => replies.push(t), ...extra })
  await runAs('ai1', () => handler.autoAI(mk('ABCDEF123', 'salam')))
  assert.equal(replies[0], 'Wa alaikum salam!'); assert.ok(calls[0].messages[0].content.includes('AQDAS AI'))
  await runAs('ai1', () => handler.autoAI(mk('ABCDEF124', 'aur?')))
  assert.equal(replies.length, 1, 'cooldown')
  await runAs('ai1', () => handler.autoAI(mk('3EB0ABCDEF', 'bot msg', { jid: 'x2@s.whatsapp.net' })))
  await runAs('ai1', () => handler.autoAI(mk('ZZ1', '.menu', { jid: 'x3@s.whatsapp.net' })))
  await runAs('ai1', () => handler.autoAI(mk('ZZ2', 'hi', { jid: 'g@g.us', isGroup: true })))
  assert.equal(replies.length, 1, 'skips')
  await runAs('ai2', () => handler.autoAI(mk('ZZ3', 'hi', { jid: 'x4@s.whatsapp.net' })))
  assert.equal(replies.length, 1, 'off by default')
})

const ad = await import('../lib/antidelete.js')
await t('anti-delete: copy sirf apni chat mein', async () => {
  const sent = []
  const bot = { id: 'ad1', sock: { user: { id: '9230011@s.whatsapp.net' }, sendMessage: async (j, c) => sent.push([j, c]) } }
  const orig = { key: { id: 'M1', remoteJid: 'grp@g.us', participant: '92355@s.whatsapp.net', fromMe: false }, pushName: 'Ali', message: { conversation: 'secret' } }
  ad.remember('ad1', orig)
  const revoke = { key: { id: 'R1', remoteJid: 'grp@g.us' }, message: { protocolMessage: { type: 0, key: { id: 'M1' } } } }
  assert.ok(ad.isRevoke(revoke))
  assert.ok(await ad.onRevoke(bot, revoke, { groupName: 'Family' }))
  assert.ok(sent.every(([j]) => j === '9230011@s.whatsapp.net'), 'only own chat')
  assert.ok(sent[0][1].text.includes('Ali') && sent[0][1].text.includes('Family'))
  assert.equal(sent[1][1].forward, orig)
})

await t('status: view + react paced, 120/ghanta cap', async () => {
  handler._setStatusDelay(() => 0); handler._resetStatus()
  settings.load('st1').autoStatusView = true; settings.load('st1').autoStatusReact = true; settings.load('st1').statusEmojis = ['😊', '😇']
  const reads = [], reacts = []
  const sock = { user: { id: '1@s.whatsapp.net' }, readMessages: async k => reads.push(k), sendMessage: async (j, c) => reacts.push(c.react.text) }
  const bot = { sock }
  for (let i = 0; i < 125; i++) await runAs('st1', () => handler.handleStatus(bot, { key: { id: 's' + i, remoteJid: 'status@broadcast', participant: '9233' + i + '@s.whatsapp.net', fromMe: false }, message: { conversation: 'x' } }))
  assert.equal(reads.length, 125); assert.equal(reacts.length, 120); assert.ok(reacts.every(e => ['😊', '😇'].includes(e)))
})

fs.rmSync('./tmp-feat-data', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} features: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
