import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getContentType, normalizeMessageContent, jidNormalizedUser } from '@whiskeysockets/baileys'

export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const pick = arr => arr[Math.floor(Math.random() * arr.length)]
export const num = jid => String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')

export function runtime (sec) {
  sec = Math.floor(sec)
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60
  return `${d ? d + 'd ' : ''}${h}h ${m}m ${s}s`
}

export function run (cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 200, timeout: opts.timeout || 180000, ...opts }, (err, stdout, stderr) => {
      if (err) { err.stderr = String(stderr || ''); return reject(err) }
      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

export async function hasBin (bin) {
  try { await run(bin, ['--version'], { timeout: 15000 }); return true } catch (e) {
    if (e.code === 'ENOENT') return false
    try { await run(bin, ['-version'], { timeout: 15000 }); return true } catch { return false }
  }
}

export function tmpFile (ext) {
  const dir = path.join(os.tmpdir(), 'aqdas-md')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)
}
export function rm (...files) { for (const f of files) { try { fs.rmSync(f, { force: true, recursive: true }) } catch {} } }

// Message se text nikalo (har type ka)
export function getBody (message) {
  const m = normalizeMessageContent(message)
  if (!m) return ''
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption ||
    m.documentMessage?.caption || m.buttonsResponseMessage?.selectedButtonId || m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId || ''
}

export function getType (message) { return getContentType(normalizeMessageContent(message)) }

// Sender ke tamam possible ids (LID + phone) taa ke admin/owner check sahi ho
export function senderIds (msg, sock) {
  const k = msg.key
  const ids = new Set()
  if (k.fromMe) {
    if (sock?.user?.id) ids.add(jidNormalizedUser(sock.user.id))
    if (sock?.user?.lid) ids.add(jidNormalizedUser(sock.user.lid))
  }
  for (const j of [k.participant, k.participantAlt, k.participantPn, msg.participant]) if (j) ids.add(jidNormalizedUser(j))
  if (!k.remoteJid?.endsWith('@g.us') && !k.fromMe) for (const j of [k.remoteJid, k.remoteJidAlt, k.senderPn]) if (j) ids.add(jidNormalizedUser(j))
  return [...ids]
}

export function participantIds (p) {
  if (typeof p === 'string') return [jidNormalizedUser(p)]
  return [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(jidNormalizedUser)
}

export function isAdminIn (meta, ids) {
  if (!meta?.participants) return false
  const set = new Set(ids.map(jidNormalizedUser))
  return meta.participants.some(p => (p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin || p.isSuperAdmin) && participantIds(p).some(i => set.has(i)))
}

export function botIds (sock) {
  return [sock?.user?.id, sock?.user?.lid].filter(Boolean).map(jidNormalizedUser)
}

export const LINK_RE = /(https?:\/\/)?(chat\.whatsapp\.com\/[A-Za-z0-9]+|wa\.me\/|whatsapp\.com\/channel\/|(?:www\.)?[a-z0-9-]+\.(?:com|net|org|pk|in|io|me|xyz|link|ly|gg|tk|info|co)(?:\/\S*)?)/i
export const hasLink = t => LINK_RE.test(String(t || ''))
