// Text tools: upper/lower/mock/binary/morse/base64/hash ... (sab offline, foran)
import crypto from 'crypto'
import { quotedText } from '../lib/limit.js'

const MAX = 2000
const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.', '@': '.--.-.', '-': '-....-', '(': '-.--.', ')': '-.--.-', ':': '---...', '=': '-...-', '+': '.-.-.', "'": '.----.', '"': '.-..-.' }
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
const NATO = { a: 'Alfa', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot', g: 'Golf', h: 'Hotel', i: 'India', j: 'Juliett', k: 'Kilo', l: 'Lima', m: 'Mike', n: 'November', o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform', v: 'Victor', w: 'Whiskey', x: 'X-ray', y: 'Yankee', z: 'Zulu', 0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine' }
const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', b: '8', g: '9', l: '1', z: '2' }
const EMOJI_LETTER = c => (/[a-z]/i.test(c) ? String.fromCodePoint(0x1F1E6 + c.toLowerCase().charCodeAt(0) - 97) + '\u200b' : c === ' ' ? '   ' : c)
const ZALGO = ['\u030d', '\u030e', '\u0304', '\u0305', '\u033f', '\u0311', '\u0306', '\u0310', '\u0352', '\u0357', '\u0351', '\u0307', '\u0308', '\u030a', '\u0342', '\u0343', '\u0344', '\u034a', '\u034b', '\u034c', '\u0303', '\u0302', '\u030c', '\u0350', '\u0300', '\u0301', '\u030b', '\u030f', '\u0312', '\u0313', '\u0314', '\u033d', '\u0309', '\u0363', '\u0364', '\u0365', '\u0366', '\u0367', '\u0368', '\u0369', '\u036a', '\u036b', '\u036c', '\u036d', '\u036e', '\u036f', '\u033e', '\u035b', '\u0346', '\u031a', '\u0316', '\u0317', '\u0318', '\u0319', '\u031c', '\u031d', '\u031e', '\u031f', '\u0320', '\u0324', '\u0325', '\u0326', '\u0329', '\u032a', '\u032b', '\u032c', '\u032d', '\u032e', '\u032f', '\u0330', '\u0331', '\u0332', '\u0333', '\u0339', '\u033a', '\u033b', '\u033c', '\u0345', '\u0347', '\u0348', '\u0349', '\u034d', '\u034e', '\u0353', '\u0354', '\u0355', '\u0356', '\u0359', '\u035a', '\u0323']
const words = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
const rnd = n => crypto.randomInt(n)
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat'.split(' ')

export const T = {
  upper: { d: 'CAPITAL LETTERS', f: s => s.toUpperCase(), alias: ['uppercase', 'caps'] },
  lower: { d: 'small letters', f: s => s.toLowerCase(), alias: ['lowercase'] },
  title: { d: 'Har Lafz Ka Pehla Harf Bara', f: s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()), alias: ['capitalize'] },
  swapcase: { d: 'sWAP cASE', f: s => [...s].map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('') },
  mock: { d: 'mOcKiNg SpOnGeBoB text', f: s => { let i = 0; return [...s].map(c => (/[a-z]/i.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('') }, alias: ['spongebob'] },
  binary: { d: 'Text -> binary 0101', f: s => [...Buffer.from(s, 'utf8')].map(b => b.toString(2).padStart(8, '0')).join(' '), alias: ['tobinary'] },
  unbinary: { d: 'Binary -> text', f: s => { const b = s.replace(/[^01]/g, ''); if (b.length < 8) throw new Error('0/1 wala binary do'); return Buffer.from(b.match(/.{8}/g).map(x => parseInt(x, 2))).toString('utf8') }, alias: ['frombinary', 'debinary'] },
  morse: { d: 'Text -> morse code', f: s => [...s.toLowerCase()].map(c => (c === ' ' ? '/' : MORSE[c] || '')).filter(Boolean).join(' '), alias: ['tomorse'] },
  unmorse: { d: 'Morse code -> text', f: s => s.trim().split(/\s+/).map(c => (c === '/' ? ' ' : UNMORSE[c] || '?')).join('').toUpperCase(), alias: ['frommorse', 'demorse'] },
  base64: { d: 'Text -> base64', f: s => Buffer.from(s, 'utf8').toString('base64'), alias: ['b64', 'encode64'] },
  unbase64: { d: 'Base64 -> text', f: s => { const o = Buffer.from(s.trim(), 'base64').toString('utf8'); if (!o) throw new Error('sahi base64 do'); return o }, alias: ['decode64', 'unb64'] },
  hex: { d: 'Text -> hex', f: s => Buffer.from(s, 'utf8').toString('hex').match(/.{2}/g).join(' '), alias: ['tohex'] },
  unhex: { d: 'Hex -> text', f: s => { const h = s.replace(/[^0-9a-f]/gi, ''); if (h.length < 2) throw new Error('hex do (jaise 48 69)'); return Buffer.from(h, 'hex').toString('utf8') }, alias: ['fromhex'] },
  rot13: { d: 'ROT13 (code / decode)', f: s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b) }) },
  atbash: { d: 'Atbash cipher (A<->Z)', f: s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(25 - (c.charCodeAt(0) - b) + b) }) },
  caesar: { d: 'Caesar cipher: .caesar 3 text', u: '<shift> <text>', raw: true, f: (s, args) => { const n = parseInt(args[0]); if (!Number.isFinite(n)) throw new Error('Use: .caesar 3 hello'); const k = ((n % 26) + 26) % 26; return args.slice(1).join(' ').replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + k) % 26 + b) }) } },
  urlencode: { d: 'URL encode', f: s => encodeURIComponent(s), alias: ['encodeurl'] },
  urldecode: { d: 'URL decode', f: s => decodeURIComponent(s), alias: ['decodeurl'] },
  ascii: { d: 'Har harf ka code (A=65)', f: s => [...s].map(c => c.codePointAt(0)).join(' '), alias: ['charcode'] },
  fromascii: { d: 'Codes -> text (72 105)', f: s => String.fromCodePoint(...s.split(/[\s,]+/).filter(Boolean).map(Number).filter(n => n > 0 && n < 0x10ffff)), alias: ['unascii'] },
  unicode: { d: 'Unicode code points (U+0041)', f: s => [...s].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ') },
  nato: { d: 'NATO alphabet (Alfa Bravo)', f: s => [...s.toLowerCase()].map(c => NATO[c] || (c === ' ' ? '/' : c)).join(' ') },
  leet: { d: '1337 h4x0r text', f: s => [...s].map(c => LEET[c.toLowerCase()] || c).join(''), alias: ['1337', 'hacktext'] },
  zalgo: { d: 'Z̷a̴l̸g̵o̶ creepy text', f: s => [...s.slice(0, 200)].map(c => (c === ' ' ? c : c + Array.from({ length: 3 + rnd(5) }, () => ZALGO[rnd(ZALGO.length)]).join(''))).join(''), alias: ['creepy'] },
  claptext: { d: 'Har 👏 lafz 👏 ke 👏 beech', f: s => s.trim().split(/\s+/).join(' 👏 ') },
  emojify: { d: 'Text -> 🇦 🇧 letters', f: s => [...s.slice(0, 120)].map(EMOJI_LETTER).join('') },
  repeat: { d: 'Text dohrao: .repeat 3 hi', u: '<1-20> <text>', raw: true, f: (s, args) => { const n = Math.min(20, Math.max(1, parseInt(args[0]) || 0)); if (!parseInt(args[0])) throw new Error('Use: .repeat 3 Allah hu Akbar'); return Array(n).fill(args.slice(1).join(' ')).join('\n') } },
  shuffle: { d: 'Letters mix karo', f: s => { const a = [...s]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a.join('') }, alias: ['scramble'] },
  slug: { d: 'url-slug-banao', f: s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') },
  camel: { d: 'camelCase', f: s => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join(''), alias: ['camelcase'] },
  snake: { d: 'snake_case', f: s => words(s).join('_'), alias: ['snakecase'] },
  kebab: { d: 'kebab-case', f: s => words(s).join('-'), alias: ['kebabcase'] },
  sortwords: { d: 'Lafz A-Z tarteeb se', f: s => s.trim().split(/\s+/).sort((x, y) => x.localeCompare(y)).join(' '), alias: ['sort'] },
  uniqlines: { d: 'Dohri lines hatao', f: s => [...new Set(s.split('\n'))].join('\n'), alias: ['dedupe'] },
  count: { d: 'Letters / words / lines gino', f: s => `🔢 Letters: ${[...s].length}\n🔤 Bina space: ${[...s.replace(/\s/g, '')].length}\n📝 Words: ${s.trim() ? s.trim().split(/\s+/).length : 0}\n📄 Lines: ${s.split('\n').length}\n⏱️ Parhne ka waqt: ~${Math.max(1, Math.round(s.trim().split(/\s+/).length / 200 * 60))} sec`, alias: ['wordcount', 'charcount', 'textstats'] },
  palindrome: { d: 'Ulta seedha same hai?', f: s => { const c = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return c && c === [...c].reverse().join('') ? `✅ Haan! "${s}" palindrome hai` : `🙅 Nahi, "${s}" palindrome nahi` } },
  vowels: { d: 'Vowels / consonants gino', f: s => { const v = (s.match(/[aeiou]/gi) || []).length, c = (s.match(/[b-df-hj-np-tv-z]/gi) || []).length; return `🅰️ Vowels: ${v}\n🅱️ Consonants: ${c}` } },
  piglatin: { d: 'Pig latin', f: s => s.split(/\s+/).map(w => (/^[aeiou]/i.test(w) ? w + 'way' : w.replace(/^([^aeiou]+)(.*)$/i, '$2$1ay'))).join(' ') },
  md5: { d: 'MD5 hash', f: s => crypto.createHash('md5').update(s).digest('hex') },
  sha1: { d: 'SHA-1 hash', f: s => crypto.createHash('sha1').update(s).digest('hex') },
  sha256: { d: 'SHA-256 hash', f: s => crypto.createHash('sha256').update(s).digest('hex'), alias: ['hash'] },
  blank: { d: 'Khali (invisible) message', noText: true, f: () => '\u2800' + '\n\u2800'.repeat(3), alias: ['invisible', 'blanktext'] },
  uuid: { d: 'Random UUID', noText: true, f: () => crypto.randomUUID() },
  password: { d: 'Mazboot password: .password 16', noText: true, raw: true, u: '[length]', f: (s, args) => { const n = Math.min(64, Math.max(8, parseInt(args[0]) || 16)); const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_'; return '🔐 ' + Array.from({ length: n }, () => cs[rnd(cs.length)]).join('') }, alias: ['pass', 'genpass'] },
  lorem: { d: 'Lorem ipsum dummy text', noText: true, raw: true, u: '[words]', f: (s, args) => { const n = Math.min(300, Math.max(5, parseInt(args[0]) || 40)); const w = Array.from({ length: n }, (_, i) => LOREM[i % LOREM.length]); w[0] = 'Lorem'; return w.join(' ') + '.' }, alias: ['loremipsum', 'dummytext'] }
}

export default Object.entries(T).map(([name, x]) => ({
  name, alias: x.alias || [], category: 'text', usage: x.u || (x.noText ? '' : '<text>'), desc: x.d,
  async run (ctx) {
    const s = (x.raw ? ctx.text : (ctx.text || quotedText(ctx))).slice(0, MAX)
    if (!s && !x.noText) return ctx.reply(`📝 ${x.d}\nUse: ${ctx.prefix}${name} ${x.u || 'AQDAS MD'}  (ya kisi message pe reply karke ${ctx.prefix}${name})`)
    let out
    try { out = x.f(s, ctx.args) } catch (e) { return ctx.reply('❌ ' + (e.message || 'galat input')) }
    if (!out) return ctx.reply('❌ Kuch nahi bana — input check karo')
    await ctx.reply(String(out).slice(0, 4000))
  }
}))
