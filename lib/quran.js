// 📖 Quran — api.alquran.cloud (koi key nahi), fallback: jsDelivr (fawazahmed0/quran-api). Arabic (Uthmani) + Urdu (Jalandhry) + English
const SURAH = [[1, "Al-Faatiha", 7],[2, "Al-Baqara", 286],[3, "Aal-i-Imraan", 200],[4, "An-Nisaa", 176],[5, "Al-Maaida", 120],[6, "Al-An'aam", 165],[7, "Al-A'raaf", 206],[8, "Al-Anfaal", 75],[9, "At-Tawba", 129],[10, "Yunus", 109],[11, "Hud", 123],[12, "Yusuf", 111],[13, "Ar-Ra'd", 43],[14, "Ibrahim", 52],[15, "Al-Hijr", 99],[16, "An-Nahl", 128],[17, "Al-Israa", 111],[18, "Al-Kahf", 110],[19, "Maryam", 98],[20, "Taa-Haa", 135],[21, "Al-Anbiyaa", 112],[22, "Al-Hajj", 78],[23, "Al-Muminoon", 118],[24, "An-Noor", 64],[25, "Al-Furqaan", 77],[26, "Ash-Shu'araa", 227],[27, "An-Naml", 93],[28, "Al-Qasas", 88],[29, "Al-Ankaboot", 69],[30, "Ar-Room", 60],[31, "Luqman", 34],[32, "As-Sajda", 30],[33, "Al-Ahzaab", 73],[34, "Saba", 54],[35, "Faatir", 45],[36, "Yaseen", 83],[37, "As-Saaffaat", 182],[38, "Saad", 88],[39, "Az-Zumar", 75],[40, "Ghafir", 85],[41, "Fussilat", 54],[42, "Ash-Shura", 53],[43, "Az-Zukhruf", 89],[44, "Ad-Dukhaan", 59],[45, "Al-Jaathiya", 37],[46, "Al-Ahqaf", 35],[47, "Muhammad", 38],[48, "Al-Fath", 29],[49, "Al-Hujuraat", 18],[50, "Qaaf", 45],[51, "Adh-Dhaariyat", 60],[52, "At-Tur", 49],[53, "An-Najm", 62],[54, "Al-Qamar", 55],[55, "Ar-Rahmaan", 78],[56, "Al-Waaqia", 96],[57, "Al-Hadid", 29],[58, "Al-Mujaadila", 22],[59, "Al-Hashr", 24],[60, "Al-Mumtahana", 13],[61, "As-Saff", 14],[62, "Al-Jumu'a", 11],[63, "Al-Munaafiqoon", 11],[64, "At-Taghaabun", 18],[65, "At-Talaaq", 12],[66, "At-Tahrim", 12],[67, "Al-Mulk", 30],[68, "Al-Qalam", 52],[69, "Al-Haaqqa", 52],[70, "Al-Ma'aarij", 44],[71, "Nooh", 28],[72, "Al-Jinn", 28],[73, "Al-Muzzammil", 20],[74, "Al-Muddaththir", 56],[75, "Al-Qiyaama", 40],[76, "Al-Insaan", 31],[77, "Al-Mursalaat", 50],[78, "An-Naba", 40],[79, "An-Naazi'aat", 46],[80, "Abasa", 42],[81, "At-Takwir", 29],[82, "Al-Infitaar", 19],[83, "Al-Mutaffifin", 36],[84, "Al-Inshiqaaq", 25],[85, "Al-Burooj", 22],[86, "At-Taariq", 17],[87, "Al-A'laa", 19],[88, "Al-Ghaashiya", 26],[89, "Al-Fajr", 30],[90, "Al-Balad", 20],[91, "Ash-Shams", 15],[92, "Al-Lail", 21],[93, "Ad-Dhuhaa", 11],[94, "Ash-Sharh", 8],[95, "At-Tin", 8],[96, "Al-Alaq", 19],[97, "Al-Qadr", 5],[98, "Al-Bayyina", 8],[99, "Az-Zalzala", 8],[100, "Al-Aadiyaat", 11],[101, "Al-Qaari'a", 11],[102, "At-Takaathur", 8],[103, "Al-Asr", 3],[104, "Al-Humaza", 9],[105, "Al-Fil", 5],[106, "Quraish", 4],[107, "Al-Maa'un", 7],[108, "Al-Kawthar", 3],[109, "Al-Kaafiroon", 6],[110, "An-Nasr", 3],[111, "Al-Masad", 5],[112, "Al-Ikhlaas", 4],[113, "Al-Falaq", 5],[114, "An-Naas", 6]] // [number, englishName, ayahs]
const ALIAS = { yaseen: 36, yasin: 36, yasinn: 36, rahman: 55, rehman: 55, fatiha: 1, fateha: 1, alhamd: 1, alhamdu: 1, mulk: 67, tabarak: 67, kahf: 18, kahaf: 18, waqia: 56, waqiah: 56, waqiya: 56, muzammil: 73, muzzamil: 73, baqarah: 2, baqara: 2, baqra: 2, imran: 3, ikhlas: 112, qulhuwallah: 112, falaq: 113, nas: 114, naas: 114, kausar: 108, kawthar: 108, kauser: 108, asr: 103, takasur: 102, takathur: 102, juma: 62, jumma: 62, jumuah: 62, yusuf: 12, maryam: 19, taha: 20, noor: 24, nur: 24, sajdah: 32, sajda: 32, dukhan: 44, fath: 48, hujurat: 49, najm: 53, qamar: 54, hadid: 57, hashr: 59, naba: 78, nabaa: 78, mudassir: 74, muddaththir: 74, qadr: 97, zilzal: 99, zalzala: 99, adiyat: 100, qariah: 101, humazah: 104, feel: 105, fil: 105, quraish: 106, quraysh: 106, maun: 107, kafirun: 109, kafiroon: 109, nasr: 110, lahab: 111, masad: 111, ayatulkursi: 2, kursi: 2 }
const norm = s => String(s || '').toLowerCase().replace(/^(surah|sura|surat)\s*/, '').replace(/[^a-z]/g, '').replace(/^(al|an|ar|as|at|ad|az|ash|aal)(?=[a-z]{3})/, '').replace(/(.)\1+/g, '$1')
const NAMES = SURAH.map(([n, e]) => [n, norm(e)])
function lev (a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
export function findSurah (q) {
  const s = String(q || '').trim()
  if (/^\d+$/.test(s)) { const n = +s; return n >= 1 && n <= 114 ? n : null }
  const raw = s.toLowerCase().replace(/[^a-z]/g, '')
  if (ALIAS[raw]) return ALIAS[raw]
  const k = norm(s)
  if (!k) return null
  if (ALIAS[k]) return ALIAS[k]
  const exact = NAMES.find(([, n]) => n === k); if (exact) return exact[0]
  const pre = NAMES.find(([, n]) => n.startsWith(k) || k.startsWith(n)); if (pre && k.length >= 3) return pre[0]
  let best = null, bd = 99
  for (const [n, nm] of NAMES) { const d = lev(k, nm); if (d < bd) { bd = d; best = n } }
  return bd <= Math.max(1, Math.floor(k.length / 3)) ? best : null
}
export const surahInfo = n => { const s = SURAH[n - 1]; return s ? { number: s[0], name: s[1], ayahs: s[2] } : null }

// "1-7" | "5" | "" -> [from, to] (max 10 ayat; chhoti surah poori)
export function parseRange (r, total) {
  if (!r) return total <= 20 ? [1, total] : [1, Math.min(10, total)]
  const m = /^(\d+)(?:\s*[-–:]\s*(\d+))?$/.exec(String(r).trim())
  if (!m) return null
  let a = +m[1], b = m[2] ? +m[2] : a
  if (a < 1 || a > total) return null
  if (b < a) [a, b] = [b, a]
  b = Math.min(b, total, a + 9)
  return [a, b]
}

const J = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'AQDAS-MD' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }

export async function getAyat (n, from, to) {
  try {
    const j = await J(`https://api.alquran.cloud/v1/surah/${n}/editions/quran-uthmani,ur.jalandhry,en.sahih?offset=${from - 1}&limit=${to - from + 1}`)
    const [ar, ur, en] = j.data
    return ar.ayahs.map((a, i) => ({ n: a.numberInSurah, ar: a.text.replace(/^\uFEFF/, ''), ur: ur.ayahs[i]?.text || '', en: en.ayahs[i]?.text || '' }))
  } catch (e) {
    const out = []
    for (let a = from; a <= to; a++) {
      const base = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/'
      const [ar, ur, en] = await Promise.all(['ara-quranuthmanihaf', 'urd-fatehmuhammadja', 'eng-ummmuhammad'].map(ed => J(`${base}${ed}/${n}/${a}.json`).catch(() => ({}))))
      if (!ar.text) throw new Error('Quran API se jawab nahi aaya, thori der baad try karo')
      out.push({ n: a, ar: ar.text, ur: ur.text || '', en: en.text || '' })
    }
    return out
  }
}

export async function ayahAudio (n, a) {
  try { const j = await J(`https://api.alquran.cloud/v1/ayah/${n}:${a}/ar.alafasy`); if (j.data?.audio) return j.data.audio } catch {}
  let abs = 0; for (let i = 1; i < n; i++) abs += SURAH[i - 1][2]
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${abs + a}.mp3`
}

export function format (info, from, to, ayat, english = true) {
  let t = `📖 *Surah ${info.name} (${info.number})* — Ayat ${from === to ? from : from + '-' + to}\n`
  for (const x of ayat) {
    t += `\n﴿${x.n}﴾ ${x.ar}\n`
    if (x.ur) t += `🇵🇰 ${x.ur}\n`
    if (english && x.en) t += `_${x.en}_\n`
  }
  if (to < info.ayahs) t += `\nAgli ayat: .quran ${info.number} ${to + 1}-${Math.min(info.ayahs, to + 10)}`
  return t.trim()
}
