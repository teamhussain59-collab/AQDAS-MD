// Fancy text fonts (Unicode): har font apni command (.boldfont AQDAS), .fancy sab ek saath
const A = 65, a = 97, Z0 = 48
function alpha (up, low, dig = null, ex = {}) {
  return s => [...s].map(ch => {
    if (ex[ch]) return ex[ch]
    const c = ch.codePointAt(0)
    if (c >= 65 && c <= 90 && up) return String.fromCodePoint(up + c - A)
    if (c >= 97 && c <= 122 && low) return String.fromCodePoint(low + c - a)
    if (c >= 48 && c <= 57 && dig) return String.fromCodePoint(dig + c - Z0)
    return ch
  }).join('')
}
const table = (from, to) => { const m = {}; [...from].forEach((c, i) => { m[c] = [...to][i] }); return s => [...s].map(c => m[c] ?? m[c.toLowerCase()] ?? c).join('') }
const comb = mark => s => [...s].map(c => (c === ' ' ? c : c + mark)).join('')
const sep = (j, l = '', r = '') => s => l + [...s].join(j) + r
const FLIP = table("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?'\"()[]{}<>&_;",
  "ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ꓭƆꓷƎℲ⅁HIſꓘ⅂WNOԀტꓤSꓕ∩ΛMX⅄Z0ƖᄅƐㄣϛ9ㄥ86˙'¡¿,„)(][}{><⅋‾؛")
const MIRROR = table('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ɒdɔbɘʇϱʜiįʞlmnoqpɿƨɈυvwxγzAᙠƆᗡƎꟻᎮHIႱ⋊⅃MИOꟼỌЯƧTUVWXYZ')

export const FONTS = [
  ['boldfont', 'Bold', alpha(0x1D400, 0x1D41A, 0x1D7CE)],
  ['italicfont', 'Italic', alpha(0x1D434, 0x1D44E, null, { h: 'ℎ' })],
  ['bolditalic', 'Bold italic', alpha(0x1D468, 0x1D482)],
  ['scriptfont', 'Script / cursive', alpha(0x1D49C, 0x1D4B6, null, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' })],
  ['boldscript', 'Bold script', alpha(0x1D4D0, 0x1D4EA)],
  ['frakturfont', 'Old English (fraktur)', alpha(0x1D504, 0x1D51E, null, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' })],
  ['boldfraktur', 'Bold old English', alpha(0x1D56C, 0x1D586)],
  ['doublefont', 'Double-struck', alpha(0x1D538, 0x1D552, 0x1D7D8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
  ['sansfont', 'Sans', alpha(0x1D5A0, 0x1D5BA, 0x1D7E2)],
  ['sansbold', 'Sans bold', alpha(0x1D5D4, 0x1D5EE, 0x1D7EC)],
  ['sansitalic', 'Sans italic', alpha(0x1D608, 0x1D622)],
  ['sansbolditalic', 'Sans bold italic', alpha(0x1D63C, 0x1D656)],
  ['monofont', 'Monospace', alpha(0x1D670, 0x1D68A, 0x1D7F6)],
  ['widefont', 'Ｖａｐｏｒｗａｖｅ (wide)', s => alpha(0xFF21, 0xFF41, 0xFF10)(s).replace(/ /g, '\u3000')],
  ['circlefont', 'Circled', alpha(0x24B6, 0x24D0, null, { 0: '⓪', 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧', 9: '⑨' })],
  ['blackcircle', 'Black circles', s => alpha(0x1F150, 0x1F150, null, { 0: '⓿', 1: '❶', 2: '❷', 3: '❸', 4: '❹', 5: '❺', 6: '❻', 7: '❼', 8: '❽', 9: '❾' })(s)],
  ['squarefont', 'Squares', alpha(0x1F130, 0x1F130)],
  ['blacksquare', 'Black squares', alpha(0x1F170, 0x1F170)],
  ['bracketfont', 'Parenthesis', alpha(0x249C, 0x249C, null, { 1: '⑴', 2: '⑵', 3: '⑶', 4: '⑷', 5: '⑸', 6: '⑹', 7: '⑺', 8: '⑻', 9: '⑼' })],
  ['smallcaps', 'Small caps', table('abcdefghijklmnopqrstuvwxyz', 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ')],
  ['tinyfont', 'Superscript (tiny)', table('abcdefghijklmnopqrstuvwxyz0123456789+-=()', 'ᵃᵇᶜᵈᵉᶠᵍʰᶦʲᵏˡᵐⁿᵒᵖᑫʳˢᵗᵘᵛʷˣʸᶻ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾')],
  ['upsidedown', 'Upside down', s => [...FLIP(s)].reverse().join('')],
  ['mirrorfont', 'Mirror', s => [...MIRROR(s)].reverse().join('')],
  ['strikefont', 'S̶t̶r̶i̶k̶e̶', comb('\u0336')],
  ['underfont', 'U̲n̲d̲e̲r̲l̲i̲n̲e̲', comb('\u0332')],
  ['doubleunder', 'Double underline', comb('\u0333')],
  ['overfont', 'Overline', comb('\u0305')],
  ['slashfont', 'Slash', comb('\u0338')],
  ['tildefont', 'Wavy (tilde)', comb('\u0334')],
  ['dotfont', 'Dots below', comb('\u0324')],
  ['arrowfont', 'Arrows below', comb('\u034E')],
  ['heartfont', 'Hearts between', sep('♥')],
  ['starfont', 'Stars between', sep('★', '★ ', ' ★')],
  ['spacefont', 'S p a c e d', sep(' ')],
  ['wingfont', 'Wings ꧁ ꧂', s => '꧁༺ ' + s + ' ༻꧂'],
  ['kingfont', 'King 👑', s => '👑 ' + alpha(0x1D4D0, 0x1D4EA)(s) + ' 👑'],
  ['firefont', 'Fire 🔥', s => '🔥 ' + alpha(0x1D400, 0x1D41A, 0x1D7CE)(s) + ' 🔥'],
  ['bubblefont', 'Bubbles ⓑⓤⓑⓑⓛⓔ', s => '°•.•° ' + alpha(0x24B6, 0x24D0)(s) + ' °•.•°'],
  ['glitchfont', 'G̷l̷i̷t̷c̷h̷ (zalgo lite)', s => [...s].map((c, i) => (c === ' ' ? c : c + ['\u0337', '\u0334', '\u0335', '\u0338'][i % 4])).join('')],
  ['cursedfont', 'Cursed / runes', table('abcdefghijklmnopqrstuvwxyz', 'ᗩᗷᑕᗪEᖴGᕼIᒍKᒪᗰᑎOᑭᑫᖇᔕTᑌᐯᗯ᙭Yᘔ')],
  ['greekfont', 'Greek style', table('abcdefghijklmnopqrstuvwxyz', 'αвcԃєƒɢнιנкℓмησρqяѕтυνωχуz')],
  ['currencyfont', 'Currency ₳₿', table('abcdefghijklmnopqrstuvwxyz', '₳฿₵ĐɆ₣₲ⱧłJ₭Ⱡ₥₦Ø₱QⱤ₴₮ɄV₩ӾɎⱫ')]
]
export const FONT_MAP = Object.fromEntries(FONTS.map(([n, d, f]) => [n, { desc: d, fn: f }]))
