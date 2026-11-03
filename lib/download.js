import fs from 'fs'
import path from 'path'
import config from '../config.js'
import { run, tmpFile, rm, hasBin } from './utils.js'

let ytdlpOk = null
export async function ytdlpAvailable () {
  if (ytdlpOk === null) ytdlpOk = await hasBin(config.ytdlp)
  return ytdlpOk
}

export const isUrl = s => /^https?:\/\//i.test(String(s || '').trim())

// yt-dlp se download: kind = 'audio' | 'video'. query = link ya naam (YouTube search)
export async function download (query, kind = 'audio') {
  const dir = tmpFile('dl'); fs.mkdirSync(dir, { recursive: true })
  const target = isUrl(query) ? query.trim() : `ytsearch1:${query}`
  const max = `${config.maxDownloadMB}M`
  const common = ['--no-playlist', '--no-warnings', '--max-filesize', max, '--match-filter', 'duration < 1200 & !is_live',
    '-o', path.join(dir, '%(title).80B.%(ext)s'), '--print', 'after_move:filepath', '--no-simulate']
  if (config.ffmpeg !== 'ffmpeg') common.push('--ffmpeg-location', config.ffmpeg)
  const args = kind === 'audio'
    ? ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '5', ...common, target]
    : ['-f', 'b[ext=mp4][height<=720]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/b', '--merge-output-format', 'mp4', ...common, target]
  try {
    const { stdout } = await run(config.ytdlp, args, { timeout: 300000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    const file = [...lines].reverse().find(l => fs.existsSync(l)) || fs.readdirSync(dir).map(f => path.join(dir, f))[0]
    if (!file || !fs.existsSync(file)) throw new Error('File nahi mili (shayad bohat bari hai, 20 min se lambi hai ya private hai)')
    const title = path.basename(file).replace(/\.[^.]+$/, '')
    return { buffer: fs.readFileSync(file), title, file: path.basename(file), cleanup: () => rm(dir) }
  } catch (e) {
    rm(dir)
    const msg = String(e.stderr || e.message || '')
    if (/Sign in to confirm|bot/i.test(msg)) throw new Error('YouTube ne is server ko block kiya (bot check). Termux/ghar ke internet pe try karo ya baad mein.')
    if (/File is larger|max-filesize/i.test(msg)) throw new Error(`File ${config.maxDownloadMB}MB se bari hai`)
    throw new Error(msg.split('\n').find(l => /ERROR/.test(l))?.replace(/^ERROR:\s*/, '').slice(0, 200) || 'Download fail')
  }
}
