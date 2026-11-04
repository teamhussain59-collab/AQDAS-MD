// Mock test: auto status view + react (koi asli WhatsApp connection nahi — sock mock hai)
// Chalao: node test/status.js
import assert from 'assert'
import fs from 'fs'
import { EventEmitter } from 'events'
process.env.DATA_DIR = './tmp-status-data'
fs.rmSync('./tmp-status-data', { recursive: true, force: true })
const settings = await import('../lib/settings.js')
const handler = await import('../lib/handler.js')
const { runAs } = await import('../lib/ctx.js')

let pass = 0, fail = 0
async function t (name, fn) {
  try { await fn(); pass++; console.log('  ✅', name) } catch (e) { fail++; console.log('  ❌', name, '\n    ', e.message) }
}

function mockSock ({ readFail = false, reactFail = false, receipts = 'all' } = {}) {
  const ev = []
  return {
    ev,
    user: { id: '923001112222:7@s.whatsapp.net', lid: '88887777:7@lid' },
    readMessages: async keys => { ev.push({ at: Date.now(), read: keys }); if (readFail) throw new Error('read boom') },
    fetchPrivacySettings: async () => ({ readreceipts: receipts }),
    sendMessage: async (jid, content, opts) => { ev.push({ at: Date.now(), jid, content, opts }); if (reactFail) throw new Error('react boom') }
  }
}
function mockBot (sock) { const b = new EventEmitter(); b.sock = sock; b.logs = []; b.on('statuslog', l => b.logs.push(l)); return b }
const status = (id, extra = {}) => ({ key: { remoteJid: 'status@broadcast', id, participant: '5550001@lid', participantAlt: '923339998877@s.whatsapp.net', fromMe: false }, message: { imageMessage: { caption: 'hi' } }, messageTimestamp: Math.floor(Date.now() / 1000), ...extra })
const on = (sid, emojis = ['😊']) => { const s = settings.load(sid); s.autoStatusView = true; s.autoStatusReact = true; s.statusEmojis = emojis }

console.log('\n[status] auto view + react (mock)')
handler._setStatusDelay(() => 30)

await t('foran seen (participant ke sath), phir delay ke baad react with statusJidList', async () => {
  handler._resetStatus(); on('nA', ['🔥'])
  const sock = mockSock(); const bot = mockBot(sock)
  const t0 = Date.now()
  await runAs('nA', () => handler.handleMessage(bot, status('A1')))
  await new Promise(r => setTimeout(r, 80))
  const read = sock.ev.find(e => e.read); const react = sock.ev.find(e => e.content?.react)
  assert.ok(read && read.at - t0 < 20, 'read foran hona chahiye')
  assert.equal(read.read[0].participant, '5550001@lid')
  assert.ok(react && react.at - read.at >= 25, 'react delay ke baad')
  assert.equal(react.jid, 'status@broadcast')
  assert.equal(react.content.react.text, '🔥')
  assert.equal(react.content.react.key.id, 'A1')
  assert.deepEqual(react.opts.statusJidList, ['5550001@lid', '88887777@lid'])
  assert.ok(bot.logs[0].includes('seen ✅') && bot.logs[0].includes('react 🔥 ✅') && bot.logs[0].includes('8877'))
})

await t('phone-jid status: apna phone jid statusJidList mein', async () => {
  handler._resetStatus(); on('nA')
  const sock = mockSock(); const bot = mockBot(sock)
  await runAs('nA', () => handler.handleStatus(bot, status('P1', { key: { remoteJid: 'status@broadcast', id: 'P1', participant: '923331112222@s.whatsapp.net', fromMe: false } })))
  assert.deepEqual(sock.ev.find(e => e.content).opts.statusJidList, ['923331112222@s.whatsapp.net', '923001112222@s.whatsapp.net'])
})

await t('har number ki apni setting: OFF wale number pe kuch nahi', async () => {
  handler._resetStatus(); on('nA'); settings.load('nB').autoStatusView = false; settings.load('nB').autoStatusReact = false
  const sA = mockSock(); const sB = mockSock()
  await runAs('nB', () => handler.handleStatus(mockBot(sB), status('X1')))
  await runAs('nA', () => handler.handleStatus(mockBot(sA), status('X1')))
  assert.equal(sB.ev.length, 0); assert.equal(sA.ev.length, 2)
})

await t('dono numbers (…7157, …5182) alag alag kaam karte hain, cap bhi alag', async () => {
  handler._resetStatus(); handler._setStatusDelay(() => 0); on('n7157'); on('n5182')
  const a = mockSock(); const b = mockSock()
  for (let i = 0; i < 125; i++) {
    await runAs('n7157', () => handler.handleStatus(mockBot(a), status('C' + i)))
    await runAs('n5182', () => handler.handleStatus(mockBot(b), status('C' + i)))
  }
  for (const s of [a, b]) { assert.equal(s.ev.filter(e => e.read).length, 125); assert.equal(s.ev.filter(e => e.content?.react).length, 120) }
  handler._setStatusDelay(() => 30)
})

await t('sirf view ON: seen hota hai, react nahi', async () => {
  handler._resetStatus(); const s = settings.load('nV'); s.autoStatusView = true; s.autoStatusReact = false
  const sock = mockSock(); const bot = mockBot(sock)
  await runAs('nV', () => handler.handleStatus(bot, status('V1')))
  assert.equal(sock.ev.length, 1); assert.ok(sock.ev[0].read)
})

await t('duplicate (decrypt retry / offline copy) dobara react nahi', async () => {
  handler._resetStatus(); on('nA')
  const sock = mockSock(); const bot = mockBot(sock)
  await runAs('nA', () => handler.handleStatus(bot, { ...status('D1'), message: undefined, messageStubType: 2 }))
  await runAs('nA', () => handler.handleStatus(bot, status('D1')))
  assert.equal(sock.ev.filter(e => e.read).length, 1); assert.equal(sock.ev.filter(e => e.content).length, 1)
})

await t('status delete / reaction / apna status skip', async () => {
  handler._resetStatus(); on('nA')
  const sock = mockSock(); const bot = mockBot(sock)
  await runAs('nA', () => handler.handleStatus(bot, status('R1', { message: { protocolMessage: { type: 0 } } })))
  await runAs('nA', () => handler.handleStatus(bot, status('R2', { message: { senderKeyDistributionMessage: {} } })))
  await runAs('nA', () => handler.handleStatus(bot, status('R3', { key: { remoteJid: 'status@broadcast', id: 'R3', participant: '1@lid', fromMe: true } })))
  assert.equal(sock.ev.length, 0)
})

await t('fail bhi log hota hai (guest_log ke liye)', async () => {
  handler._resetStatus(); on('nA')
  const sock = mockSock({ readFail: true, reactFail: true }); const bot = mockBot(sock)
  await runAs('nA', () => handler.handleStatus(bot, status('F1')))
  assert.ok(bot.logs[0].includes('seen ❌ read boom') && bot.logs[0].includes('❌ react boom'), bot.logs[0])
})

await t('read receipts OFF ho to log mein saaf likha', async () => {
  handler._resetStatus(); on('nA')
  const sock = mockSock({ receipts: 'none' }); const bot = mockBot(sock)
  await runAs('nA', () => handler.handleStatus(bot, status('Q1')))
  assert.ok(bot.logs[0].includes('read receipts OFF'))
})

await t('upsert filter: append wala taaza status liya, purana / normal append chhoda', async () => {
  assert.ok(handler.wantUpsert(status('U1'), 'append'))
  assert.ok(!handler.wantUpsert(status('U2', { messageTimestamp: Math.floor(Date.now() / 1000) - 25 * 3600 }), 'append'))
  assert.ok(!handler.wantUpsert({ key: { remoteJid: '92300@s.whatsapp.net', id: 'x' } }, 'append'))
  assert.ok(handler.wantUpsert({ key: { remoteJid: '92300@s.whatsapp.net', id: 'x' } }, 'notify'))
})

fs.rmSync('./tmp-status-data', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} status: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
