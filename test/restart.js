// node test/restart.js — admin restart (bina GitHub ke): 401 bina password, sahi password pe save hooks chal ke exit 0
// aur libsignal ki "Closing session" jaisi lines log mein nahi aatin
import assert from 'assert'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

if (process.argv[2] === 'child') {
  process.env.ADMIN_PASSWORD = 'unit-test-pass'
  await import('../lib/quiet.js')
  console.info('Closing session:', { indexInfo: {}, currentRatchet: { privKey: 'SECRET' } })
  console.log('Opening session:', 'SECRET2')
  console.log('normal line ok')
  const { onExit } = await import('../lib/ghstatus.js')
  onExit(async () => { await new Promise(r => setTimeout(r, 200)); console.log('HOOK: saved') })
  const { createApp } = await import('../lib/web.js')
  const srv = createApp({ status: 'connected', registered: true, sock: null, sessionString: () => '' }).listen(0)
  const u = p => `http://127.0.0.1:${srv.address().port}${p}`
  assert.equal((await fetch(u('/api/admin/restart'), { method: 'POST' })).status, 401)
  const j = await (await fetch(u('/api/admin/restart'), { method: 'POST', headers: { 'x-admin-password': 'unit-test-pass' } })).json()
  console.log('RESTART', JSON.stringify(j))
  const html = await (await fetch(u('/admin'))).text()
  assert.ok(html.includes('🔄 Restart bot'))
  console.log('ADMIN_BUTTON ok')
} else {
  const t0 = Date.now()
  const c = spawn(process.execPath, [fileURLToPath(import.meta.url), 'child'], { env: { ...process.env, GITHUB_ACTIONS: '' } })
  let out = ''
  c.stdout.on('data', d => { out += d }); c.stderr.on('data', d => { out += d })
  const code = await new Promise(r => c.on('exit', r))
  const ms = Date.now() - t0
  try {
    assert.equal(code, 0, 'exit code')
    assert.ok(out.includes('RESTART {"ok":true,"mode":"exit"}'), 'restart answer')
    assert.ok(out.includes('ADMIN_BUTTON ok'))
    assert.ok(out.includes('HOOK: saved'), 'save hook ran before exit')
    assert.ok(out.includes('normal line ok'))
    assert.ok(!/SECRET|Closing session|Opening session/.test(out), 'secret log line leaked')
    assert.ok(ms < 9000)
    console.log(`✅ restart test passed (exit after ${ms} ms, save hook ran, no session keys in log)`)
  } catch (e) { console.log(out); console.log('❌', e.message); process.exit(1) }
}
