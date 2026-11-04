'use strict'
// ===== Custom command sandbox (alag process) =====
// Admin panel (docs/commands.html) se aayi custom command ka code yahan chalta hai — bot ke process se BAHAR.
// Parent (lib/customcmds.js) is process ko: khaali env (koi secret nahi), Node permission model (sirf yahi file read,
// koi file write / child process / worker nahi), 64 MB RAM aur wall-clock timeout ke saath chalata hai.
// Code ek vm context mein chalta hai jahan require / process / fs / Buffer nahi — sirf `ctx` object.
const vm = require('vm')

let seq = 0
const pending = new Map()
const send = (m) => { try { process.send(m) } catch {} }

process.on('message', (m) => {
  if (!m || typeof m !== 'object') return
  if (m.t === 'res') {
    const p = pending.get(m.id); if (!p) return
    pending.delete(m.id)
    if (m.ok) p.res(m.v == null ? null : String(m.v)); else p.rej(String(m.e || 'error'))
    return
  }
  if (m.t === 'job') start(String(m.code || ''), String(m.data || '{}'), Number(m.cpuMs) || 3000)
})

// sandbox -> parent: sirf string ops. res/rej sandbox ke apne functions hain, unhe sirf primitive milta hai.
function bridge (op, json, res, rej) {
  const id = ++seq
  pending.set(id, { res, rej })
  let a = null
  try { a = JSON.parse(String(json)) } catch {}
  send({ t: 'op', id, op: String(op), a })
}

let started = false
function start (code, data, cpuMs) {
  if (started) return
  started = true
  const logs = []
  const box = vm.createContext(Object.create(null), { name: 'aqdas-custom', codeGeneration: { strings: false, wasm: false } })
  try {
    const boot = vm.runInContext(`(function (bridge, data, log) {
  'use strict'
  const D = JSON.parse(data)
  const call = (op, a) => new Promise((res, rej) => bridge(op, JSON.stringify(a === undefined ? null : a), res, rej))
  const str = (v) => (v == null ? '' : String(v))
  const api = {
    args: Object.freeze(Array.isArray(D.args) ? D.args.map(String) : []),
    text: str(D.text), command: str(D.command), prefix: str(D.prefix),
    sender: str(D.sender), pushName: str(D.pushName), isOwner: !!D.isOwner, isGroup: !!D.isGroup,
    quotedText: str(D.quotedText),
    reply: (t) => call('reply', { text: str(t) }),
    sendImage: (src, caption) => call('image', { src: str(src), caption: str(caption) }),
    react: (e) => call('react', { emoji: str(e) }),
    get: (url) => call('get', { url: str(url) }),
    getJson: (url) => call('get', { url: str(url) }).then((t) => JSON.parse(t)),
    sleep: (ms) => call('sleep', { ms: Number(ms) || 0 })
  }
  globalThis.ctx = Object.freeze(api)
  globalThis.console = Object.freeze({ log: (...a) => log(a.map(str).join(' ')), error: (...a) => log(a.map(str).join(' ')) })
})`, box, { timeout: 1000 })
    boot(bridge, data, (s) => { if (logs.length < 20) logs.push(String(s).slice(0, 300)) })
    const wrapped = '(async () => { const module = { exports: {} }; const exports = module.exports;\n' +
      'await (async function () {\n' + code + '\n}).call(undefined);\n' +
      "if (typeof module.exports === 'function') await module.exports(ctx);\n" +
      "else if (module.exports && typeof module.exports.run === 'function') await module.exports.run(ctx);\n})()"
    const script = new vm.Script(wrapped, { filename: 'command.js' })
    const p = script.runInContext(box, { timeout: cpuMs, breakOnSigint: false })
    Promise.resolve(p).then(
      () => { send({ t: 'done', logs }); setTimeout(() => process.exit(0), 20) },
      (e) => { send({ t: 'error', e: errText(e), logs }); setTimeout(() => process.exit(0), 20) }
    )
  } catch (e) {
    send({ t: 'error', e: errText(e), logs }); setTimeout(() => process.exit(0), 20)
  }
}

function errText (e) {
  try {
    if (e && typeof e === 'object' && 'message' in e) return String(e.message).slice(0, 300)
    return String(e).slice(0, 300)
  } catch { return 'error' }
}
send({ t: 'ready' })
