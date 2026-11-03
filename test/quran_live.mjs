// Quran live fetch (Actions se): 1:1-7, 36:1-5, naam se search, audio link
import fs from 'fs'
const q = await import('../lib/quran.js')
const rows = []
const ok = (n, c, i) => { rows.push([n, !!c, i]); console.log(c ? 'PASS' : 'FAIL', n, '-', i) }
try { const a = await q.getAyat(1, 1, 7); ok('1:1-7', a.length === 7 && a[0].ar && a[0].ur, `${a.length} ayat, urdu: ${a[6].ur.slice(0, 40)}`) } catch (e) { ok('1:1-7', false, e.message) }
try { const a = await q.getAyat(36, 1, 5); ok('36:1-5', a.length === 5 && a[0].ar, `${a.length} ayat`) } catch (e) { ok('36:1-5', false, e.message) }
for (const s of ['yaseen', 'rahman', 'mulk', 'kahf', 'fatiha']) ok('naam ' + s, !!q.findSurah(s), String(q.findSurah(s)))
try { const u = await q.ayahAudio(36, 1); const r = await fetch(u, { method: 'HEAD' }); ok('audio 36:1', r.ok, u + ' HTTP ' + r.status) } catch (e) { ok('audio', false, e.message) }
const md = `\n## Quran live\n\n` + rows.map(r => `- ${r[1] ? '✅' : '❌'} ${r[0]}: ${r[2]}`).join('\n') + '\n'
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
