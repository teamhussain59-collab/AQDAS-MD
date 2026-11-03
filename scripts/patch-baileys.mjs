// npm install ke baad chalta hai: Baileys rc14 mein WhatsApp ki nayi pairing step (companion_reg_refresh) ka fix.
// Upstream: WhiskeySockets/Baileys issue #2737, PR #2765 (QR fix), PR #2602 + PR #2872 (pairing code:
// stage guard + link_code_pairing_nonce ek 0x00 byte, string '0' (0x30) nahi — phone '0' pe 'Couldn't link device' deta hai).
// Idempotent: dobara chalao to kuch nahi badalta. Fail ho to install nahi rukta.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket')
const MARK = '/* AQDAS-PATCH-2765 */'
let changed = 0

function patch (file, edits) {
  const p = path.join(root, file)
  if (!fs.existsSync(p)) { console.log('[patch-baileys] file nahi mili:', file); return }
  let s = fs.readFileSync(p, 'utf8')
  let n = 0
  for (const [a, b] of edits) {
    if (s.includes(b)) continue
    if (!s.includes(a)) { console.log('[patch-baileys] pattern nahi mila (Baileys version badla?):', file, JSON.stringify(a.slice(0, 60))); continue }
    s = s.replace(a, b); n++
  }
  if (!n) { console.log('[patch-baileys] kuch badalna nahi tha:', file); return }
  if (!s.startsWith(MARK)) s = MARK + '\n' + s
  fs.writeFileSync(p, s)
  changed += n
  console.log('[patch-baileys] patched:', file, n, 'edit(s)')
}

try {
  patch('socket.js', [
    ['        const advB64 = creds.advSecretKey;\n', '        let currentRef;\n        aqdasRefreshQR = () => { if (currentRef && ws.isOpen) ev.emit(\'connection.update\', { qr: buildPairingQRData(currentRef, noiseKeyB64, identityKeyB64, creds.advSecretKey, browser) }); };\n'],
    ['            const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, advB64, browser);\n', '            currentRef = ref;\n            const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, creds.advSecretKey, browser);\n'],
    ['    // QR gen\n    ws.on(\'CB:iq,type:set,pair-device\', async (stanza) => {\n',
      '    // AQDAS: server unpaired companion ka adv secret retire kare to naya bana ke QR dobara dikhao (PR #2765)\n' +
      '    let aqdasRefreshQR;\n' +
      '    ws.on(\'CB:notification,type:companion_reg_refresh\', (node) => {\n' +
      '        const ok = getBinaryNodeChild(node, \'companion_reg_refresh\') || getBinaryNodeChild(node, \'pair-device-rotate-qr\');\n' +
      '        if (!ok) { ev.emit(\'connection.update\', { aqdasRegRefresh: \'malformed\' }); return; }\n' +
      '        if (creds.me) { ev.emit(\'connection.update\', { aqdasRegRefresh: \'ignored (pairing-code flow)\' }); return; }\n' +
      '        creds.advSecretKey = randomBytes(32).toString(\'base64\');\n' +
      '        ev.emit(\'creds.update\', { advSecretKey: creds.advSecretKey });\n' +
      '        ev.emit(\'connection.update\', { aqdasRegRefresh: \'rotated\' });\n' +
      '        aqdasRefreshQR?.();\n' +
      '    });\n' +
      '    // QR gen\n    ws.on(\'CB:iq,type:set,pair-device\', async (stanza) => {\n'],
    ["                            tag: 'link_code_pairing_nonce',\n                            attrs: {},\n                            content: '0'\n",
      "                            tag: 'link_code_pairing_nonce',\n                            attrs: {},\n                            content: Buffer.alloc(1) /* AQDAS PR #2872 */\n"]
  ])
  patch('messages-recv.js', [
    ['        const stanza = buildAckStanza(node, errorCode, authState.creds.me.id);\n',
      '        const meId = authState.creds.me?.id;\n        if (node.tag === \'message\' && !meId) {\n            throw new Boom(\'cannot ack a message before creds.me is set\');\n        }\n        const stanza = buildAckStanza(node, errorCode, meId);\n'],
    ['            case \'link_code_companion_reg\':\n                const linkCodeCompanionReg = getBinaryNodeChild(node, \'link_code_companion_reg\');\n',
      '            case \'link_code_companion_reg\':\n                const linkCodeCompanionReg = getBinaryNodeChild(node, \'link_code_companion_reg\');\n                if (linkCodeCompanionReg?.attrs?.stage !== \'primary_hello\' || !getBinaryNodeChildBuffer(linkCodeCompanionReg, \'primary_identity_pub\')) {\n                    logger.debug({ node }, \'link_code_companion_reg notification without pairing data, skipping\');\n                    break;\n                }\n']
  ])
} catch (e) { console.log('[patch-baileys] error:', e.message) }
console.log('[patch-baileys] done, files changed:', changed)
