// AQDAS MD launcher: bot crash/restart ho to khud dobara chalata hai
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const main = path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.js')
let fast = 0, last = 0
function start () {
  const child = spawn(process.execPath, [main, ...process.argv.slice(2)], { stdio: 'inherit' })
  child.on('exit', (code, sig) => {
    if (sig === 'SIGINT' || sig === 'SIGTERM') process.exit(0)
    fast = Date.now() - last < 10000 ? fast + 1 : 0
    last = Date.now()
    const wait = fast > 5 ? 30000 : 2000
    console.log(`[AQDAS MD] bot band hua (code ${code}). ${wait / 1000}s mein restart...`)
    setTimeout(start, wait)
  })
  for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { child.kill(s); setTimeout(() => process.exit(0), 1500) })
}
last = Date.now()
start()
