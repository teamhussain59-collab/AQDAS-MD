// AQDAS MD tests (mock socket, real ffmpeg). Run: npm test
process.env.DATA_DIR = './tmp-test-data'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-session'
process.env.ADMIN_PASSWORD = 'unit-test-pass'
const fs = await import('fs')
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins, commands, list } = await import('../lib/plugins.js')
const { buildCtx, dispatch, handleMessage, handleGroupUpdate, antilink } = await import('../lib/handler.js')
const { decideReact, _resetReact } = await import('../lib/autoreact.js')
const { toSticker, stickerToImage, addExif } = await import('../lib/media.js')
const { trimTo30, songPath, customSong, ORIGINAL_SONG } = await import('../lib/assets.js')
const { chunks } = await import('../lib/tts.js')
const { askAI } = await import('../lib/ai.js')
const { hasLink, isAdminIn, senderIds } = await import('../lib/utils.js')
const { menuText } = await import('../plugins/main.js')
const webp = (await import('node-webpmux')).default
const { run } = await import('../lib/utils.js')

let pass = 0, fail = 0
async function t (name, fn) {
  try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.message) }
}

// ---- mock WhatsApp socket ----
const BOT = '923111111111@s.whatsapp.net', BOT_LID = '111111111111@lid'
function mockSock (meta = null) {
  const sent = []
  return {
    sent,
    user: { id: '923111111111:5@s.whatsapp.net', lid: '111111111111:5@lid', name: 'AQDAS MD' },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return { key: { id: 'X' + sent.length, remoteJid: jid }, message: {} } },
    readMessages: async (keys) => { sent.push({ read: keys }) },
    sendPresenceUpdate: async (p, j) => { sent.push({ presence: p, jid: j }) },
    groupMetadata: async () => meta,
    groupParticipantsUpdate: async (jid, ids, action) => { sent.push({ gpu: action, ids }); return ids.map(j => ({ status: '200', jid: j })) },
    groupSettingUpdate: async (jid, s) => { sent.push({ gset: s }) },
    groupInviteCode: async () => 'ABCDEF123',
    profilePictureUrl: async () => { throw new Error('no pp') },
    updateProfilePicture: async (jid, buf) => { sent.push({ pp: jid, size: buf.length }) },
    updateMediaMessage: async m => m
  }
}
function mockBot (sock) {
  return { sock, groupCache: new Map(), remember () {}, groupMeta: async j => sock.groupMetadata(j), sessionString: () => 'AQDAS-MD~abc', status: 'open' }
}
const GJ = '120363000000000000@g.us'
const META = {
  id: GJ, subject: 'Test Group', participants: [
    { id: '200000000001@lid', phoneNumber: '923000000002@s.whatsapp.net', admin: 'admin' }, // admin (LID group)
    { id: '200000000003@lid', phoneNumber: '923000000003@s.whatsapp.net', admin: null }, // normal member
    { id: BOT_LID, phoneNumber: BOT, admin: 'admin' } // bot is admin
  ]
}
const gmsg = (participant, text, extra = {}) => ({ key: { remoteJid: GJ, id: 'M' + Math.random(), participant, fromMe: false, ...extra }, pushName: 'u', message: { conversation: text } })
const pmsg = (from, text) => ({ key: { remoteJid: from, id: 'P' + Math.random(), fromMe: false }, pushName: 'u', message: { conversation: text } })

fs.rmSync('./tmp-test-data', { recursive: true, force: true })
settings._reset()
await loadPlugins()

console.log('\n[1] Plugins + menu')
await t('plugins load (>= 50 commands)', () => assert.ok(list.length >= 50, `only ${list.length}`))
await t('menu text has every category + prefix + owner', async () => {
  const ctx = { settings }
  const m = menuText(ctx)
  for (const s of ['AQDAS MD', 'AQDAS HACKER', '.menu', '.sticker', '.ai', '.play', '.tagall', '.antilink', '.autoreact', '.setsong', '.setdp']) assert.ok(m.includes(s), 'missing ' + s)
})
await t('.menu sends motion video (gifPlayback, menu caption) + audio(song)', async () => {
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  const v = sock.sent.find(s => s.content?.video); const aud = sock.sent.find(s => s.content?.audio)
  assert.ok(v && v.content.gifPlayback === true && v.content.mimetype === 'video/mp4', 'no menu video')
  assert.ok(v.content.caption.includes('AQDAS MD') && v.content.caption.includes('.enhance') && v.content.caption.includes('.setmenu'), 'caption missing')
  assert.ok(v.content.video.length > 500000 && v.content.video.length < 2 * 1024 * 1024, 'clip size ' + v.content.video.length)
  assert.ok(!sock.sent.find(s => s.content?.image), 'DP sent as well')
  assert.ok(aud && aud.content.mimetype === 'audio/mpeg' && aud.content.audio.length > 100000, 'no song')
})
await t('.menu falls back to DP image when the video send fails', async () => {
  const sock = mockSock(); const bot = mockBot(sock); const orig = sock.sendMessage
  sock.sendMessage = async (jid, content, opts) => { if (content.video) throw new Error('media upload failed'); return orig(jid, content, opts) }
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  const img = sock.sent.find(s => s.content?.image)
  assert.ok(img && img.content.caption.includes('AQDAS MD'), 'no fallback image')
  assert.ok(sock.sent.find(s => s.content?.audio), 'song missing after fallback')
})
await t('unknown command is ignored silently', async () => {
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('923000000009@s.whatsapp.net', '.nonexistent'))
  assert.equal(sock.sent.filter(s => s.content?.text).length, 0)
})

console.log('\n[2] Auto-react decision logic')
await t('reacts to normal incoming message with emoji from list', () => {
  _resetReact(); const e = decideReact(pmsg('923000000009@s.whatsapp.net', 'hi'), { autoReact: true, reactEmojis: ['🔥'], reactScope: 'all' })
  assert.equal(e, '🔥')
})
await t('no react when OFF / fromMe / status / reaction msg', () => {
  _resetReact()
  const s = { autoReact: true, reactEmojis: ['🔥'], reactScope: 'all' }
  assert.equal(decideReact(pmsg('a@s.whatsapp.net', 'x'), { ...s, autoReact: false }), null)
  assert.equal(decideReact({ key: { remoteJid: 'b@s.whatsapp.net', fromMe: true }, message: { conversation: 'x' } }, s), null)
  assert.equal(decideReact({ key: { remoteJid: 'status@broadcast' }, message: { conversation: 'x' } }, s), null)
  assert.equal(decideReact({ key: { remoteJid: 'c@s.whatsapp.net' }, message: { reactionMessage: {} } }, s), null)
})
await t('scope private skips groups, scope group skips inbox', () => {
  _resetReact()
  assert.equal(decideReact(gmsg('x@lid', 'hi'), { autoReact: true, reactEmojis: ['🔥'], reactScope: 'private' }), null)
  assert.equal(decideReact(pmsg('d@s.whatsapp.net', 'hi'), { autoReact: true, reactEmojis: ['🔥'], reactScope: 'group' }), null)
})
await t('cooldown: 2nd message in same chat within 3s not reacted', () => {
  _resetReact(); const s = { autoReact: true, reactEmojis: ['🔥'], reactScope: 'all' }
  assert.equal(decideReact(pmsg('e@s.whatsapp.net', '1'), s, 1000), '🔥')
  assert.equal(decideReact(pmsg('e@s.whatsapp.net', '2'), s, 2000), null)
  assert.equal(decideReact(pmsg('e@s.whatsapp.net', '3'), s, 5000), '🔥')
})
await t('handleMessage actually sends the react', async () => {
  _resetReact(); settings.set('autoReact', true); settings.set('reactEmojis', ['😎'])
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('923000000008@s.whatsapp.net', 'salam'))
  assert.ok(sock.sent.find(s => s.content?.react?.text === '😎'))
})

console.log('\n[3] Toggles + owner checks')
await t('non-owner cannot toggle', async () => {
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('923000000009@s.whatsapp.net', '.autoreact off'))
  assert.ok(sock.sent.some(s => /sirf owner/.test(s.content?.text || '')))
  assert.equal(settings.get('autoReact'), true)
})
await t('owner (OWNER_NUMBER) toggles autoreact off/on', async () => {
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.autoreact off'))
  assert.equal(settings.get('autoReact'), false)
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.autoreact on'))
  assert.equal(settings.get('autoReact'), true)
})
await t('owner via LID chat (remoteJidAlt has phone) recognised', async () => {
  const sock = mockSock()
  const m = { key: { remoteJid: '999@lid', remoteJidAlt: '923000000001@s.whatsapp.net', id: 'L1', fromMe: false }, message: { conversation: '.statusreact on' } }
  await handleMessage(mockBot(sock), m)
  assert.equal(settings.get('autoStatusReact'), true)
})
await t('fromMe (bot number itself) is owner; settings persisted to file', async () => {
  const sock = mockSock()
  await handleMessage(mockBot(sock), { key: { remoteJid: BOT, id: 'F1', fromMe: true }, message: { conversation: '.autoread on' } })
  assert.equal(JSON.parse(fs.readFileSync('./tmp-test-data/settings.json', 'utf8')).autoRead, true)
  settings.set('autoRead', false)
})
await t('setprefix changes prefix, old prefix stops working', async () => {
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.setprefix !'))
  assert.equal(settings.get('prefix'), '!')
  sock.sent.length = 0
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.ping'))
  assert.equal(sock.sent.filter(s => s.content?.text).length, 0)
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '!ping'))
  assert.ok(sock.sent.some(s => /Pong/.test(s.content?.text || '')))
  settings.set('prefix', '.')
})
await t('private mode: strangers ignored, owner works', async () => {
  settings.set('mode', 'private')
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.joke'))
  assert.equal(sock.sent.filter(s => s.content?.text).length, 0)
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.joke'))
  assert.ok(sock.sent.some(s => /😂/.test(s.content?.text || '')))
  settings.set('mode', 'public')
})
// ---- private mode (Hussain bug 2026-11-04: private mein bhi dusre bande ko .menu ka jawab) ----
const { runAs } = await import('../lib/ctx.js')
const anyOut = sock => sock.sent.filter(s => s.content && !s.content.react && s.jid !== 'status@broadcast')
const lidDm = (lid, pn, text) => ({ key: { remoteJid: lid, remoteJidAlt: pn, id: 'L' + Math.random(), fromMe: false }, pushName: 'x', message: { conversation: text } })
await t('private (main): stranger .menu gets NOTHING (PN dm, LID dm, group, list reply, button reply)', async () => {
  settings.set('mode', 'private')
  const sock = mockSock(META); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  await handleMessage(bot, lidDm('299999999999@lid', '923000000009@s.whatsapp.net', '.menu'))
  await handleMessage(bot, lidDm('299999999998@lid', undefined, '.menu'))
  await handleMessage(bot, gmsg('200000000003@lid', '.menu', { participantAlt: '923000000003@s.whatsapp.net' }))
  await handleMessage(bot, { key: { remoteJid: '923000000009@s.whatsapp.net', id: 'Q1', fromMe: false }, message: { listResponseMessage: { singleSelectReply: { selectedRowId: '.menu' } } } })
  await handleMessage(bot, { key: { remoteJid: '923000000009@s.whatsapp.net', id: 'Q2', fromMe: false }, message: { buttonsResponseMessage: { selectedButtonId: '.menu' } } })
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.help'))
  assert.equal(anyOut(sock).length, 0, JSON.stringify(anyOut(sock).map(x => Object.keys(x.content))))
  settings.set('mode', 'public')
})
await t('private (main): owner number, owner via LID+Alt, and own number (fromMe) still get menu', async () => {
  settings.set('mode', 'private')
  for (const m of [pmsg('923000000001@s.whatsapp.net', '.menu'), lidDm('288888888888@lid', '923000000001@s.whatsapp.net', '.menu'),
    { key: { remoteJid: '923000000009@s.whatsapp.net', id: 'F1', fromMe: true }, message: { conversation: '.menu' } }]) {
    const sock = mockSock(); const bot = mockBot(sock)
    await handleMessage(bot, m)
    assert.ok(sock.sent.some(s => (s.content?.video || s.content?.image)), 'owner got no menu: ' + JSON.stringify(m.key))
  }
  settings.set('mode', 'public')
})
await t('private: public:true commands (.pair) still answer strangers; owner-only cmd silent to strangers', async () => {
  settings.set('mode', 'private')
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.pair'))
  assert.ok(anyOut(sock).length >= 1, '.pair should answer')
  const sock2 = mockSock(); const bot2 = mockBot(sock2)
  await handleMessage(bot2, pmsg('923000000009@s.whatsapp.net', '.mode public'))
  assert.equal(anyOut(sock2).length, 0)
  assert.equal(settings.get('mode'), 'private')
  settings.set('mode', 'public')
})
await t('private on EXTRA number (sid): stranger gets nothing there, own number fromMe works; main stays public (per-number)', async () => {
  const SID = 'ntest00000000abcd'
  await runAs(SID, async () => {
    const sock = mockSock(); const bot = mockBot(sock)
    await handleMessage(bot, { key: { remoteJid: '923111111111@s.whatsapp.net', id: 'F2', fromMe: true }, message: { conversation: '.mode private' } })
    assert.equal(settings.get('mode'), 'private')
    assert.ok(sock.sent.some(s => /Mode.*private/.test(s.content?.text || '')), 'no mode reply')
    sock.sent.length = 0
    await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
    await handleMessage(bot, lidDm('299999999999@lid', '923000000009@s.whatsapp.net', '.menu'))
    assert.equal(anyOut(sock).length, 0)
    await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.menu')) // asli owner har number pe owner
    assert.ok(sock.sent.some(s => (s.content?.video || s.content?.image)))
  })
  assert.equal(settings.get('mode'), 'public') // main alag
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  assert.ok(sock.sent.some(s => (s.content?.video || s.content?.image)), 'main public should answer')
})
await t('mode survives settings reload + session restore (main and extra sid)', async () => {
  const SID = 'ntest00000000abcd'
  settings.set('mode', 'private')
  settings._reset() // cache khali: disk se dobara parho (restart jaisa)
  assert.equal(settings.get('mode'), 'private')
  assert.equal(settings.load(SID).mode, 'private')
  // restart: encrypted store se wapis (exportFor -> importFor), data folder khali ho chuka ho
  const blobMain = settings.exportFor('main'), blobSid = settings.exportFor(SID)
  fs.rmSync('./tmp-test-data', { recursive: true, force: true }); settings._reset()
  assert.equal(settings.get('mode'), 'public') // bina restore default
  settings.importFor('main', blobMain); settings.importFor(SID, blobSid)
  assert.equal(settings.get('mode'), 'private'); assert.equal(settings.load(SID).mode, 'private')
  const sock = mockSock(); const bot = mockBot(sock)
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  await runAs(SID, () => handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu')))
  assert.equal(anyOut(sock).length, 0)
  settings.set('mode', 'public'); runAs(SID, () => settings.set('mode', 'public'))
})
await t('owner check: stranger LID digits never match, own LID sender = owner', async () => {
  const { isOwner } = await import('../lib/handler.js')
  const sock = mockSock(); const bot = mockBot(sock)
  assert.equal(isOwner(bot, { key: { remoteJid: '923000000001@lid', fromMe: false } }), false) // LID jo owner number jaisa dikhe
  assert.equal(isOwner(bot, gmsg(BOT_LID, 'x')), true)
  assert.equal(isOwner(bot, gmsg('200000000003@lid', 'x', { participantAlt: '923000000003@s.whatsapp.net' })), false)
})
await t('status: auto view reads, auto react reacts with statusJidList', async () => {
  settings.set('autoStatusView', true); settings.set('autoStatusReact', true)
  const sock = mockSock()
  ;(await import('../lib/handler.js'))._setStatusDelay(() => 0) // asal mein 1-3 sec gap
  await handleMessage(mockBot(sock), { key: { remoteJid: 'status@broadcast', id: 'S1', participant: '5@lid', participantAlt: '923000000005@s.whatsapp.net' }, message: { conversation: 'story' } })
  await new Promise(r => setTimeout(r, 30))
  assert.ok(sock.sent.find(s => s.read))
  const r = sock.sent.find(s => s.content?.react)
  assert.ok(r && r.jid === 'status@broadcast' && r.opts.statusJidList.includes('5@lid'))
  assert.equal(r.content.react.key.participant, '5@lid')
})

console.log('\n[4] Group admin checks (LID + phone)')
await t('isAdminIn matches by LID and by phoneNumber', () => {
  assert.ok(isAdminIn(META, ['200000000001@lid']))
  assert.ok(isAdminIn(META, ['923000000002@s.whatsapp.net']))
  assert.ok(!isAdminIn(META, ['200000000003@lid']))
})
await t('non-admin .tagall refused', async () => {
  const sock = mockSock(META); await handleMessage(mockBot(sock), gmsg('200000000003@lid', '.tagall'))
  assert.ok(sock.sent.some(s => /sirf group admins/.test(s.content?.text || '')))
})
await t('admin .tagall mentions all members', async () => {
  const sock = mockSock(META); await handleMessage(mockBot(sock), gmsg('200000000001@lid', '.tagall hello'))
  const m = sock.sent.find(s => s.content?.mentions)
  assert.equal(m.content.mentions.length, 3)
})
await t('admin .hidetag sends text with hidden mentions', async () => {
  const sock = mockSock(META); await handleMessage(mockBot(sock), gmsg('200000000001@lid', '.hidetag meeting at 9'))
  const m = sock.sent.find(s => s.content?.mentions)
  assert.equal(m.content.text, 'meeting at 9'); assert.equal(m.content.mentions.length, 3)
})
await t('admin .kick @member calls remove', async () => {
  const sock = mockSock(META)
  const m = gmsg('200000000001@lid', '.kick @200000000003')
  m.message = { extendedTextMessage: { text: '.kick @200000000003', contextInfo: { mentionedJid: ['200000000003@lid'] } } }
  await handleMessage(mockBot(sock), m)
  const g = sock.sent.find(s => s.gpu); assert.equal(g.gpu, 'remove'); assert.deepEqual(g.ids, ['200000000003@lid'])
})
await t('promote/demote by reply', async () => {
  for (const [c, a] of [['.promote', 'promote'], ['.demote', 'demote']]) {
    const sock = mockSock(META)
    const m = gmsg('200000000001@lid', c)
    m.message = { extendedTextMessage: { text: c, contextInfo: { stanzaId: 'Q', participant: '200000000003@lid', quotedMessage: { conversation: 'hi' } } } }
    await handleMessage(mockBot(sock), m)
    assert.equal(sock.sent.find(s => s.gpu)?.gpu, a)
  }
})
await t('bot not admin -> kick refused with message', async () => {
  const meta = { ...META, participants: META.participants.map(p => p.id === BOT_LID ? { ...p, admin: null } : p) }
  const sock = mockSock(meta); await handleMessage(mockBot(sock), gmsg('200000000001@lid', '.close'))
  assert.ok(sock.sent.some(s => /bot ko group admin/.test(s.content?.text || '')))
})
await t('.close/.open set announcement', async () => {
  const sock = mockSock(META); const bot = mockBot(sock)
  await handleMessage(bot, gmsg('200000000001@lid', '.close')); await handleMessage(bot, gmsg('200000000001@lid', '.open'))
  assert.deepEqual(sock.sent.filter(s => s.gset).map(s => s.gset), ['announcement', 'not_announcement'])
})
await t('group command in private chat refused', async () => {
  const sock = mockSock(); await handleMessage(mockBot(sock), pmsg('923000000001@s.whatsapp.net', '.tagall'))
  assert.ok(sock.sent.some(s => /sirf group mein/.test(s.content?.text || '')))
})
await t('antilink warn -> delete + warning; 3rd strike kicks', async () => {
  settings.setGroup(GJ, 'antilink', 'warn')
  const sock = mockSock(META); const bot = mockBot(sock)
  for (let i = 0; i < 3; i++) await handleMessage(bot, gmsg('200000000003@lid', 'join https://chat.whatsapp.com/AbCdEf'))
  assert.equal(sock.sent.filter(s => s.content?.delete).length, 3)
  assert.ok(sock.sent.some(s => /Warning 1\/3/.test(s.content?.text || '')))
  assert.ok(sock.sent.find(s => s.gpu === 'remove'))
})
await t('antilink ignores admins and plain text', async () => {
  const sock = mockSock(META); const bot = mockBot(sock)
  await handleMessage(bot, gmsg('200000000001@lid', 'https://youtube.com/x'))
  await handleMessage(bot, gmsg('200000000003@lid', 'salam sab ko'))
  assert.equal(sock.sent.filter(s => s.content?.delete).length, 0)
  settings.setGroup(GJ, 'antilink', 'off')
})
await t('hasLink detection', () => { assert.ok(hasLink('chat.whatsapp.com/abc')); assert.ok(hasLink('see https://x.com/y')); assert.ok(!hasLink('kya haal hai')) })
await t('welcome on: new member greeted with mention (v7 participant objects)', async () => {
  settings.setGroup(GJ, 'welcome', true)
  const sock = mockSock(META)
  await handleGroupUpdate(mockBot(sock), { id: GJ, action: 'add', participants: [{ id: '300000000007@lid', phoneNumber: '923000000007@s.whatsapp.net' }] })
  const w = sock.sent.find(s => s.content?.text); assert.ok(/khush aamdeed/.test(w.content.text) && w.content.mentions[0] === '300000000007@lid')
})
await t('goodbye off: nothing sent on remove', async () => {
  const sock = mockSock(META)
  await handleGroupUpdate(mockBot(sock), { id: GJ, action: 'remove', participants: ['300000000007@lid'] })
  assert.equal(sock.sent.length, 0)
})

console.log('\n[5] Media pipelines (real ffmpeg)')
const img = './tmp-test-data/sample.png', vid = './tmp-test-data/sample.mp4', aud = './tmp-test-data/sample_long.mp3'
await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=800x600:rate=1', '-frames:v', '1', img])
await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '8', '-pix_fmt', 'yuv420p', vid])
await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=75', '-c:a', 'libmp3lame', aud])
await t('image -> sticker: webp 512x512 with AQDAS pack exif', async () => {
  const st = await toSticker(fs.readFileSync(img))
  const w = new webp.Image(); await w.load(st)
  assert.equal(w.width, 512); assert.equal(w.height, 512)
  assert.ok(w.exif && w.exif.toString().includes('AQDAS MD'))
  fs.writeFileSync('./tmp-test-data/out_sticker.webp', st)
})
await t('video -> animated sticker under 1 MB', async () => {
  const st = await toSticker(fs.readFileSync(vid), { video: true })
  const w = new webp.Image(); await w.load(st)
  assert.ok(w.hasAnim, 'not animated'); assert.ok(st.length < 1024 * 1024, 'too big ' + st.length)
  fs.writeFileSync('./tmp-test-data/out_anim.webp', st)
})
await t('sticker -> image (static and animated) gives PNG', async () => {
  for (const f of ['out_sticker.webp', 'out_anim.webp']) {
    const png = await stickerToImage(fs.readFileSync('./tmp-test-data/' + f))
    assert.equal(png.slice(1, 4).toString(), 'PNG')
  }
})
await t('.sticker command end-to-end with mocked download', async () => {
  const sock = mockSock(); const bot = mockBot(sock)
  const m = { key: { remoteJid: '923000000009@s.whatsapp.net', id: 'I1' }, message: { imageMessage: { caption: '.s', mimetype: 'image/png' } } }
  const { buildCtx: bc, dispatch: dp } = await import('../lib/handler.js')
  const ctx = await bc(bot, m); ctx.download = async () => fs.readFileSync(img)
  await dp(ctx)
  assert.ok(sock.sent.find(s => s.content?.sticker?.length > 1000))
})
await t('setsong trim: 75s audio -> 30s mp3 saved, used by menu; reset restores', async () => {
  const mp3 = await trimTo30(fs.readFileSync(aud))
  fs.writeFileSync('./tmp-test-data/trim.mp3', mp3)
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', './tmp-test-data/trim.mp3'])
  const d = parseFloat(stdout); assert.ok(d > 29.5 && d < 30.6, 'duration ' + d)
  // full command flow with mocked download (owner replies to audio)
  const sock = mockSock(); const bot = mockBot(sock)
  const m = { key: { remoteJid: '923000000001@s.whatsapp.net', id: 'A1' }, message: { extendedTextMessage: { text: '.setsong', contextInfo: { stanzaId: 'Q', quotedMessage: { audioMessage: { mimetype: 'audio/mpeg' } } } } } }
  const ctx = await buildCtx(bot, m); ctx.download = async () => fs.readFileSync(aud)
  await dispatch(ctx)
  assert.equal(songPath(), customSong())
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.setsong reset'))
  assert.equal(songPath(), ORIGINAL_SONG)
})
await t('setdp reply to image -> profile picture updated', async () => {
  const sock = mockSock(); const bot = mockBot(sock)
  const m = { key: { remoteJid: '923000000001@s.whatsapp.net', id: 'D1' }, message: { extendedTextMessage: { text: '.setdp', contextInfo: { stanzaId: 'Q', quotedMessage: { imageMessage: { mimetype: 'image/png' } } } } } }
  const ctx = await buildCtx(bot, m); ctx.download = async () => fs.readFileSync(img)
  await dispatch(ctx)
  assert.ok(sock.sent.find(s => s.pp === BOT))
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.setdp reset'))
})
await t('.setmenu reply to video -> menu uses it; .setmenu dp -> photo; reset -> original clip; stranger refused', async () => {
  const { menuMedia, customMenuVideo, ORIGINAL_MENU } = await import('../lib/assets.js')
  const sock = mockSock(); const bot = mockBot(sock)
  const m = { key: { remoteJid: '923000000001@s.whatsapp.net', id: 'V1' }, message: { extendedTextMessage: { text: '.setmenu', contextInfo: { stanzaId: 'Q', quotedMessage: { videoMessage: { mimetype: 'video/mp4' } } } } } }
  const ctx = await buildCtx(bot, m); ctx.download = async () => fs.readFileSync(vid)
  await dispatch(ctx)
  assert.equal(menuMedia().path, customMenuVideo())
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width:format=duration', '-of', 'csv=p=0', customMenuVideo()])
  assert.ok(/h264,480/.test(stdout), 'not h264 480: ' + stdout)
  sock.sent.length = 0
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  const v = sock.sent.find(s => s.content?.video)
  assert.ok(v && Buffer.compare(v.content.video, fs.readFileSync(customMenuVideo())) === 0 && v.content.gifPlayback, 'custom video not used')
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.setmenu dp'))
  sock.sent.length = 0
  await handleMessage(bot, pmsg('923000000009@s.whatsapp.net', '.menu'))
  assert.ok(sock.sent.find(s => s.content?.image) && !sock.sent.find(s => s.content?.video), '.setmenu dp ignored')
  await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', '.setmenu reset'))
  assert.equal(menuMedia().path, ORIGINAL_MENU)
  assert.ok(!fs.existsSync(customMenuVideo()))
  // non-owner cannot change it
  const s2 = mockSock(); const b2 = mockBot(s2)
  const m2 = { key: { remoteJid: '923000000009@s.whatsapp.net', id: 'V2' }, message: { extendedTextMessage: { text: '.setmenu', contextInfo: { stanzaId: 'Q', quotedMessage: { videoMessage: { mimetype: 'video/mp4' } } } } } }
  const c2 = await buildCtx(b2, m2); c2.download = async () => fs.readFileSync(vid)
  await dispatch(c2)
  assert.ok(!fs.existsSync(customMenuVideo()), 'stranger changed menu')
})
await t('.enhance / .hd reply to image -> 2x sharper jpeg; no image -> help', async () => {
  for (const cmd of ['.enhance', '.hd', '.remini']) {
    const sock = mockSock(); const bot = mockBot(sock)
    const m = { key: { remoteJid: '923000000001@s.whatsapp.net', id: 'E' + cmd }, message: { extendedTextMessage: { text: cmd, contextInfo: { stanzaId: 'Q', quotedMessage: { imageMessage: { mimetype: 'image/png' } } } } } }
    const ctx = await buildCtx(bot, m); ctx.download = async () => fs.readFileSync(img)
    await dispatch(ctx)
    const out = sock.sent.find(s => s.content?.image)
    assert.ok(out, cmd + ' sent no image')
    fs.writeFileSync('./tmp-test-data/hd.jpg', out.content.image)
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', './tmp-test-data/hd.jpg'])
    assert.equal(stdout.trim(), 'mjpeg,1600,1200', cmd + ' size ' + stdout)
  }
  const sock = mockSock(); const bot = mockBot(sock)
  const m = { key: { remoteJid: '923000000001@s.whatsapp.net', id: 'ED' }, message: { extendedTextMessage: { text: '.enhance doc', contextInfo: { stanzaId: 'Q', quotedMessage: { imageMessage: { mimetype: 'image/png' } } } } } }
  const ctx = await buildCtx(bot, m); ctx.download = async () => fs.readFileSync(img)
  await dispatch(ctx)
  assert.ok(sock.sent.find(s => s.content?.document && s.content.mimetype === 'image/jpeg'), 'doc mode')
  const s2 = mockSock()
  await handleMessage(mockBot(s2), pmsg('923000000001@s.whatsapp.net', '.enhance'))
  assert.ok(s2.sent.find(s => /photo pe reply/.test(s.content?.text || '')), 'no help text')
})

console.log('\n[6] AI + TTS + misc')
await t('AI without key -> clear message', async () => {
  await assert.rejects(() => askAI('x', 'hi', { key: '' }), /OPENROUTER_API_KEY/)
})
await t('AI request shape (mock fetch): model, auth header, memory', async () => {
  let seen
  const fake = async (url, o) => { seen = { url, o }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'Islamabad' } }] }) } }
  const a = await askAI('chat1', 'capital?', { fetchImpl: fake, key: 'sk-or-test', model: 'openai/gpt-4o-mini' })
  assert.equal(a, 'Islamabad'); assert.ok(seen.url.includes('openrouter.ai')); assert.equal(seen.o.headers.Authorization, 'Bearer sk-or-test')
  assert.equal(JSON.parse(seen.o.body).model, 'openai/gpt-4o-mini')
  await askAI('chat1', 'aur?', { fetchImpl: fake, key: 'k' })
  assert.equal(JSON.parse(seen.o.body).messages.length, 4)
})
await t('AI API error surfaces message', async () => {
  const fake = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'No auth credentials found' } }) })
  await assert.rejects(() => askAI('c', 'q', { fetchImpl: fake, key: 'bad' }), /No auth/)
})
await t('TTS chunking keeps parts <= 180 chars', () => { const c = chunks('salam '.repeat(200)); assert.ok(c.length > 3 && c.every(x => x.length <= 180)) })
await t('calc, jid, quote, joke, uptime reply', async () => {
  const sock = mockSock(); const bot = mockBot(sock)
  for (const c of ['.calc 25*4+10', '.jid', '.quote', '.joke', '.uptime', '.dice', '.flip', '.settings', '.alive']) await handleMessage(bot, pmsg('923000000001@s.whatsapp.net', c))
  assert.ok(sock.sent.some(s => /= \*110\*/.test(s.content?.text || '')))
  assert.ok(sock.sent.filter(s => s.content?.text || s.content?.image).length >= 9)
})
await t('web: wrong password 401, right password status, pair validates number', async () => {
  const { createApp } = await import('../lib/web.js')
  const fakeBot = { status: 'waiting_pair', registered: false, sock: null, pairNumber: '', pairCode: null, requestPairing: async n => { if (String(n).replace(/\D/g, '').length < 10) throw new Error('Number ghalat hai'); return 'ABCD-EFGH' }, sessionString: () => '' }
  const srv = createApp(fakeBot).listen(0); const port = srv.address().port; const u = p => `http://127.0.0.1:${port}${p}`
  try {
    assert.equal((await fetch(u('/api/status'), { headers: { 'x-admin-password': 'nope' } })).status, 401)
    const ok = await (await fetch(u('/api/status'), { headers: { 'x-admin-password': 'unit-test-pass' } })).json(); assert.equal(ok.status, 'waiting_pair')
    const bad = await fetch(u('/api/pair'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': 'unit-test-pass' }, body: '{"number":"12"}' }); assert.equal(bad.status, 400)
    const good = await (await fetch(u('/api/pair'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': 'unit-test-pass' }, body: '{"number":"923001234567"}' })).json(); assert.equal(good.code, 'ABCD-EFGH')
    assert.equal((await fetch(u('/health'))).status, 200)
    assert.ok((await (await fetch(u('/'))).text()).includes('AQDAS MD'))
  } finally { srv.close() }
})

fs.rmSync('./tmp-test-data', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
