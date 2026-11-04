// Website screenshot: free, bina key wali services, ek fail ho to agli (thum.io -> microlink -> wordpress mshots)
import dns from 'dns'
import net from 'net'

export class BadUrl extends Error {}

const PRIVATE4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]
const ip4n = ip => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0)
export function isPrivateIp (ip) {
  if (net.isIPv4(ip)) {
    const n = ip4n(ip)
    return PRIVATE4.some(([base, bits]) => { const size = 2 ** (32 - bits); const b = ip4n(base); return n >= b && n < b + size })
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase()
    if (l === '::' || l === '::1') return true
    if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7))
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(l)
  }
  return true
}

// user ka link -> saaf https/http URL (ya BadUrl)
export function normalizeUrl (raw) {
  let s = String(raw || '').trim().replace(/^<|>$/g, '')
  if (!s) throw new BadUrl('Link do. Misal: .ss https://google.com')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:]+:\d+/.test(s)) throw new BadUrl('Sirf http:// ya https:// wale link chalte hain.')
    s = 'https://' + s
  }
  let u
  try { u = new URL(s) } catch { throw new BadUrl('Ye link sahi nahi hai. Misal: .ss https://google.com') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadUrl('Sirf http:// ya https:// wale link chalte hain.')
  if (u.username || u.password) throw new BadUrl('Link mein username/password nahi hona chahiye.')
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) throw new BadUrl('Ye link sahi nahi hai.')
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new BadUrl('Private / local address ka screenshot nahi ho sakta.') } else {
    if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) throw new BadUrl('Ye public website ka link nahi lagta.')
    if (!/^[a-z0-9.-]+$/.test(host) && !/^xn--/.test(host)) { /* unicode domain: URL() ne punycode bana diya hota hai */ }
  }
  return u.toString()
}

// domain ka asli (public) IP hai? warna saaf error
export async function checkHost (url, lookup = dns.promises.lookup) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) return true
  let addrs
  try { addrs = await lookup(host, { all: true }) } catch { throw new BadUrl(`Ye website nahi mili (${host}). Spelling check karo.`) }
  if (!addrs?.length) throw new BadUrl(`Ye website nahi mili (${host}).`)
  if (addrs.some(a => isPrivateIp(a.address))) throw new BadUrl('Private / local address ka screenshot nahi ho sakta.')
  return true
}

export function providers (url, { mobile = false, full = false } = {}) {
  const e = encodeURIComponent(url)
  const thum = mobile ? 'https://image.thum.io/get/iphoneX/noanimate/' : full ? 'https://image.thum.io/get/width/1280/fullpage/noanimate/' : 'https://image.thum.io/get/width/1280/crop/800/noanimate/'
  const micro = `https://api.microlink.io/?url=${e}&screenshot=true&meta=false&embed=screenshot.url` + (mobile ? '&device=iPhone%20X' : '') + (full ? '&screenshot.fullPage=true' : '')
  const ms = `https://s0.wp.com/mshots/v1/${e}?` + (mobile ? 'vpw=390&vph=844&w=390&h=844' : 'w=1280&h=800')
  return [{ name: 'thum.io', url: thum + url }, { name: 'microlink', url: micro }, { name: 'mshots', url: ms }]
}

const isImage = (buf, type) => {
  if (!buf || buf.length < 3000) return false
  if (/^image\//i.test(type || '')) return true
  return (buf[0] === 0x89 && buf[1] === 0x50) || (buf[0] === 0xff && buf[1] === 0xd8) || buf.slice(0, 4).toString() === 'RIFF'
}

export async function screenshot (raw, { mobile = false, full = false, fetchImpl = fetch, lookup, timeout = 45000 } = {}) {
  const url = normalizeUrl(raw)
  await checkHost(url, lookup)
  const errors = []
  for (const p of providers(url, { mobile, full })) {
    try {
      const r = await fetchImpl(p.url, { headers: { 'User-Agent': 'Mozilla/5.0 (AQDAS-MD-Bot)', Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) })
      if (!r.ok) { errors.push(`${p.name} ${r.status}`); continue }
      const buf = Buffer.from(await r.arrayBuffer())
      const type = r.headers?.get?.('content-type') || ''
      // mshots pehli dafa "generating" wali choti GIF deta hai: woh nahi chahiye
      if (!isImage(buf, type) || /gif/i.test(type)) { errors.push(`${p.name} no image`); continue }
      if (buf.length > 15 * 1024 * 1024) { errors.push(`${p.name} too big`); continue }
      return { buffer: buf, url, provider: p.name, mimetype: /jpe?g/i.test(type) ? 'image/jpeg' : 'image/png' }
    } catch (e) { errors.push(`${p.name} ${e.name === 'TimeoutError' ? 'timeout' : 'error'}`) }
  }
  const err = new Error('Screenshot nahi ban saka — teeno services ne jawab nahi diya (' + errors.join(', ') + '). Thori dair baad try karo.')
  err.errors = errors
  throw err
}
