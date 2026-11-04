// Menu: har linked number apna bot.start() -> loadPlugins() ek saath chalata hai. Har command menu mein sirf EK dafa
// aaye aur "Commands: N" asli ginti ho (3 numbers pe pehle har command 3 baar aati thi). Run: node test/menu.js
process.env.DATA_DIR = './tmp-test-menu'
process.env.OWNER_NUMBER = '923000000001'
process.env.SESSION_DIR = './tmp-test-menu-session'
const fs = await import('fs')
const assert = (await import('assert')).default
const settings = await import('../lib/settings.js')
const { loadPlugins, commands, list } = await import('../lib/plugins.js')
const { menuText } = await import('../plugins/main.js')
const { customList } = await import('../lib/customcmds.js')

let pass = 0, fail = 0
async function t (name, fn) {
  try { await fn(); pass++; console.log('  ✔', name) } catch (e) { fail++; console.log('  ✖', name, '\n     ', e.message) }
}
fs.rmSync('./tmp-test-menu', { recursive: true, force: true })
settings._reset?.()

const lines = m => m.split('\n').filter(l => l.startsWith('│ ➤ '))
const counted = m => Number((m.match(/Commands: (\d+)/) || [])[1])

await t('3 numbers ek saath loadPlugins(): har command ek dafa', async () => {
  const r = await Promise.all([loadPlugins(), loadPlugins(), loadPlugins()])
  assert.ok(list.length > 50, 'commands load hui: ' + list.length)
  assert.ok(r.every(x => x === list))
  const names = list.map(c => c.name.toLowerCase())
  assert.strictEqual(new Set(names).size, names.length, 'list mein duplicate')
})

await t('menu: koi line do dafa nahi, Commands = asli ginti', async () => {
  const m = menuText({ settings })
  const l = lines(m)
  const dup = l.filter((x, i) => l.indexOf(x) !== i)
  assert.deepStrictEqual(dup, [], 'duplicate menu lines: ' + dup.slice(0, 3).join(' | '))
  assert.strictEqual(l.length, list.length + customList().length)
  assert.strictEqual(counted(m), list.length + customList().length)
  assert.strictEqual(l.filter(x => /^│ ➤ \.menu$/.test(x)).length, 1)
})

await t('baad mein aur numbers / reconnect: loadPlugins() dobara bhi ginti nahi badhti', async () => {
  const n = list.length
  await loadPlugins(); await Promise.all([loadPlugins(), loadPlugins()])
  assert.strictEqual(list.length, n)
  assert.strictEqual(counted(menuText({ settings })), n + customList().length)
})

await t('.reload (force) do dafa ek saath: phir bhi ek dafa, aliases kaam', async () => {
  const n = list.length
  await Promise.all([loadPlugins(true), loadPlugins(true), loadPlugins()])
  assert.strictEqual(list.length, n)
  const names = list.map(c => c.name.toLowerCase())
  assert.strictEqual(new Set(names).size, names.length)
  assert.strictEqual(commands.get('help')?.name, 'menu')
  assert.strictEqual(lines(menuText({ settings })).filter(x => /^│ ➤ \.menu$/.test(x)).length, 1)
})

fs.rmSync('./tmp-test-menu', { recursive: true, force: true })
fs.rmSync('./tmp-test-menu-session', { recursive: true, force: true })
console.log(`\n${fail ? '❌' : '✅'} menu: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
