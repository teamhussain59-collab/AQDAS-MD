// Download routes probe — GitHub Actions runner se kaunsa source chalta hai (sirf test, bot ka hissa nahi)
import { execFile } from 'child_process'
import fs from 'fs'
const sh = (cmd, args, ms = 120000) => new Promise(res => {
  const t0 = Date.now()
  execFile(cmd, args, { timeout: ms, maxBuffer: 64 << 20 }, (e, out, err) => res({ ok: !e, ms: Date.now() - t0, out: String(out || ''), err: String(err || e?.message || '') }))
})
const J = async (url, opts = {}, ms = 20000) => { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'Mozilla/5.0', ...(opts.headers || {}) } }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch {} return { status: r.status, j, t: t.slice(0, 300) } }
const results = []
const rec = (name, ok, info) => { results.push({ name, ok, info: String(info || '').replace(/\s+/g, ' ').slice(0, 260) }); console.log(ok ? 'PASS' : 'FAIL', name, '-', String(info || '').replace(/\s+/g, ' ').slice(0, 260)) }
const size = f => { try { return fs.statSync(f).size } catch { return 0 } }
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const YTID = 'dQw4w9WgXcQ'

const v = await sh('yt-dlp', ['--version']); rec('yt-dlp version', v.ok, v.out.trim())
for (const [label, extra] of [
  ['yt-dlp default', []],
  ['yt-dlp tv,web_safari,mweb', ['--extractor-args', 'youtube:player_client=tv,web_safari,mweb']],
  ['yt-dlp android_vr', ['--extractor-args', 'youtube:player_client=android_vr']],
  ['yt-dlp ios', ['--extractor-args', 'youtube:player_client=ios']],
  ['yt-dlp tv_embedded', ['--extractor-args', 'youtube:player_client=tv_embedded']],
  ['yt-dlp mweb', ['--extractor-args', 'youtube:player_client=mweb']]
]) {
  const out = `/tmp/p_${label.replace(/\W+/g, '_')}.m4a`
  const r = await sh('yt-dlp', ['-f', 'ba[ext=m4a]/ba', '--no-playlist', '--max-filesize', '30M', '-o', out, ...extra, YT], 150000)
  rec('YT audio ' + label, size(out) > 100000, size(out) ? `${size(out)} bytes ${r.ms}ms` : (r.err.split('\n').filter(l => /ERROR|WARN/.test(l)).slice(-2).join(' | ') || r.err.slice(-200)))
}
{ const r = await sh('yt-dlp', ['--print', '%(id)s %(title)s', '--flat-playlist', 'ytsearch1:tum hi ho arijit'], 60000); rec('YT search (ytsearch1)', r.ok && r.out.trim().length > 5, r.ok ? r.out.trim() : r.err.slice(-200)) }

// Piped
let piped = []
try { const r = await J('https://piped-instances.kavin.rocks/'); piped = (r.j || []).map(x => x.api_url).filter(Boolean) } catch (e) { rec('piped instance list', false, e.message) }
piped = [...new Set([...piped, 'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee', 'https://pipedapi.r4fo.com', 'https://pipedapi.leptons.xyz'])]
rec('piped instances', piped.length > 0, piped.length + ' known')
let pipedOk = 0
for (const base of piped.slice(0, 14)) {
  try {
    const r = await J(`${base}/streams/${YTID}`, {}, 12000)
    const a = (r.j?.audioStreams || []).sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0))[0]
    if (!a?.url) { rec('piped ' + base, false, `HTTP ${r.status} ${r.j?.error || r.t.slice(0, 80)}`); continue }
    const m = await fetch(a.url, { headers: { range: 'bytes=0-200000', 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    const b = Buffer.from(await m.arrayBuffer())
    rec('piped ' + base, b.length > 50000, `stream HTTP ${m.status}, got ${b.length} bytes`)
    if (b.length > 50000) { pipedOk++; if (pipedOk >= 3) break }
  } catch (e) { rec('piped ' + base, false, e.message) }
}

// Invidious
let inv = []
try { const r = await J('https://api.invidious.io/instances.json?sort_by=health'); inv = (r.j || []).filter(x => x[1]?.api && x[1]?.type === 'https').map(x => x[1].uri) } catch (e) { rec('invidious list', false, e.message) }
inv = [...new Set([...inv, 'https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be', 'https://invidious.f5.si'])]
rec('invidious instances', inv.length > 0, inv.length + ' known')
let invOk = 0
for (const base of inv.slice(0, 12)) {
  try {
    const r = await J(`${base}/api/v1/videos/${YTID}?local=true`, {}, 12000)
    const a = (r.j?.adaptiveFormats || []).filter(f => /audio/.test(f.type || '')).sort((x, y) => (+y.bitrate || 0) - (+x.bitrate || 0))[0]
    if (!a?.url) { rec('invidious ' + base, false, `HTTP ${r.status} ${r.j?.error || r.t.slice(0, 80)}`); continue }
    const u = a.url.startsWith('/') ? base + a.url : a.url
    const m = await fetch(u, { headers: { range: 'bytes=0-200000', 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    const b = Buffer.from(await m.arrayBuffer())
    rec('invidious ' + base, b.length > 50000, `stream HTTP ${m.status}, got ${b.length} bytes`)
    if (b.length > 50000 && ++invOk >= 3) break
  } catch (e) { rec('invidious ' + base, false, e.message) }
}
// Invidious search
for (const base of inv.slice(0, 5)) { try { const r = await J(`${base}/api/v1/search?q=${encodeURIComponent('tum hi ho')}&type=video`, {}, 10000); const id = Array.isArray(r.j) && r.j[0]?.videoId; rec('invidious search ' + base, !!id, id || `HTTP ${r.status}`); if (id) break } catch (e) { rec('invidious search ' + base, false, e.message) } }

// cobalt-style instances
for (const base of ['https://api.cobalt.tools', 'https://cobalt-api.meowing.de', 'https://cobalt-backend.canine.tools', 'https://capi.3kh0.net', 'https://cobalt-api.kwiatekmiki.com']) {
  try {
    const r = await J(base + '/', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ url: YT, downloadMode: 'audio' }) }, 15000)
    rec('cobalt ' + base, !!(r.j?.url || r.j?.status === 'tunnel' || r.j?.status === 'redirect'), `HTTP ${r.status} ${r.j?.status || ''} ${r.j?.error?.code || r.t.slice(0, 80)}`)
  } catch (e) { rec('cobalt ' + base, false, e.message) }
}

// TikTok / Instagram / Facebook
const sm = [
  ['tiktok yt-dlp', 'https://www.tiktok.com/@scout2015/video/6718335390845095173'],
  ['instagram yt-dlp', 'https://www.instagram.com/reel/C6EP7QhIPTk/'],
  ['facebook yt-dlp', 'https://www.facebook.com/watch/?v=10153231379946729']
]
for (const [label, url] of sm) {
  const out = `/tmp/p_${label.replace(/\W+/g, '_')}.mp4`
  const r = await sh('yt-dlp', ['-f', 'b[ext=mp4]/b', '--max-filesize', '60M', '-o', out, url], 120000)
  rec(label, size(out) > 20000, size(out) ? `${size(out)} bytes` : (r.err.split('\n').filter(l => /ERROR/.test(l)).slice(-1)[0] || r.err.slice(-200)))
}
try { const r = await J('https://www.tikwm.com/api/?url=' + encodeURIComponent(sm[0][1]) + '&hd=1'); rec('tikwm api', !!r.j?.data?.play, r.j?.data?.play ? 'play url ok' : (r.j?.msg || r.t.slice(0, 100))) } catch (e) { rec('tikwm api', false, e.message) }

const pass = results.filter(r => r.ok).length
let md = `## Download probe (${new Date().toISOString()})\n\n${pass}/${results.length} pass\n\n| | route | info |\n|---|---|---|\n` + results.map(r => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.info.replace(/\|/g, '/')} |`).join('\n') + '\n'
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
fs.writeFileSync('probe.json', JSON.stringify(results, null, 1))
console.log('RESULTS_JSON ' + JSON.stringify(results))
