// ===== Log safety =====
// WhatsApp ki encryption library (libsignal) "Closing session: SessionEntry {...privKey...}" jaisi
// cheezein console pe print karti hai. Repo public hai, to Actions ka log bhi public hai:
// aisi lines kabhi print na hon. (main.js sab se pehle isko import karta hai)
const DROP = /^(Closing session|Opening session|Removing old closed session|Session already (closed|open)|Migrating session|Closing open session|Closing stale open session)/
const secretish = a => a && typeof a === 'object' && (a.constructor?.name === 'SessionEntry' || ('indexInfo' in a && 'currentRatchet' in a))
for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
  const orig = console[k].bind(console)
  console[k] = (...args) => {
    if (typeof args[0] === 'string' && DROP.test(args[0])) return
    if (args.some(secretish)) return
    orig(...args)
  }
}
export default true
