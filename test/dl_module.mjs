// Bot ka asli download module (lib/download.js) GitHub runner pe — .play/.video/.ytmp3/.ytmp4/tiktok/fb/insta
import fs from 'fs'
const { download, _routes } = await import('../lib/download.js')
const cases = [
  ['.play (naam)', 'tum hi ho arijit singh', 'audio'],
  ['.video (naam)', 'pasoori coke studio', 'video'],
  ['.ytmp3 (link)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'audio'],
  ['.ytmp4 (link)', 'https://youtu.be/dQw4w9WgXcQ', 'video'],
  ['.play (naam 2)', 'pasoori', 'audio'],
  ['.ytmp4 (shorts)', 'https://www.youtube.com/shorts/tPEE9ZwTmy0', 'video'],
  ['.tiktok', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'video'],
  ['.tiktokmp3', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'audio'],
  ['.fb', 'https://www.facebook.com/watch/?v=10153231379946729', 'video'],
  ['.insta', 'https://www.instagram.com/reel/C6EP7QhIPTk/', 'video']
]
const rows = []
for (const [name, q, kind] of cases) {
  const t0 = Date.now()
  try {
    const r = await download(q, kind)
    const mb = (r.buffer.length / 1048576).toFixed(1)
    rows.push([name, true, `${mb} MB "${r.title.slice(0, 40)}" ${r.file.split('.').pop()} via ${r.via || 'yt-dlp'} ${Date.now() - t0}ms`])
    r.cleanup()
  } catch (e) { rows.push([name, false, String(e.message).slice(0, 200) + ` (${Date.now() - t0}ms)`]) }
  console.log(rows.at(-1)[1] ? 'PASS' : 'FAIL', rows.at(-1)[0], '-', rows.at(-1)[2])
}
// har YouTube raasta alag se (kaunsa chalta hai)
for (const [name, fn] of [['route yt-dlp', () => _routes.ytdlp('https://www.youtube.com/watch?v=kJQP7kiw5Fk', 'audio')], ['route yt-dlp tv', () => _routes.ytdlp('https://www.youtube.com/watch?v=kJQP7kiw5Fk', 'audio', ['--extractor-args', 'youtube:player_client=tv_embedded'])], ['route invidious audio', () => _routes.invidious('kJQP7kiw5Fk', 'audio')], ['route invidious video', () => _routes.invidious('kJQP7kiw5Fk', 'video')], ['route tikwm', () => _routes.tikwm('https://www.tiktok.com/@scout2015/video/6718335390845095173', 'video')]]) {
  const t0 = Date.now()
  try { const r = await fn(); rows.push([name, true, `${(r.buffer.length / 1048576).toFixed(1)} MB ${Date.now() - t0}ms`]); r.cleanup() } catch (e) { rows.push([name, false, String(e.message).slice(0, 160)]) }
  console.log(rows.at(-1)[1] ? 'PASS' : 'FAIL', rows.at(-1)[0], '-', rows.at(-1)[2])
}
const md = `\n## Bot download module\n\n| | command | result |\n|---|---|---|\n` + rows.map(r => `| ${r[1] ? '✅' : '❌'} | ${r[0]} | ${r[2].replace(/\|/g, '/')} |`).join('\n') + '\n'
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
