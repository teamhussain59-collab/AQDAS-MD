import fs from 'fs'
import path from 'path'
import config from '../config.js'
import { dir as dataDir } from './settings.js'
import { currentSid } from './ctx.js'
import { saveAssets } from './store.js'
import { run, tmpFile, rm } from './utils.js'

// Menu song / DP: owner ka custom (data/ folder) ho to woh, warna original (media/)
export const ORIGINAL_SONG = './media/song.mp3'
export const ORIGINAL_DP = './media/dp.jpg'
export const customSong = () => path.join(dataDir(), 'menu_song.mp3')
export const customDp = () => path.join(dataDir(), 'menu_dp.jpg')
export const songPath = () => fs.existsSync(customSong()) ? customSong() : ORIGINAL_SONG
export const dpPath = () => fs.existsSync(customDp()) ? customDp() : ORIGINAL_DP

// kisi bhi audio/video ko pehle 30 second ka mp3 banao (end pe 2 sec fade)
export async function trimTo30 (buf, seconds = 30) {
  const inp = tmpFile('in'), out = tmpFile('mp3')
  fs.writeFileSync(inp, buf)
  try {
    await run(config.ffmpeg, ['-y', '-i', inp, '-vn', '-t', String(seconds), '-af', `afade=t=in:st=0:d=0.3,afade=t=out:st=${seconds - 2}:d=2`, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', out], { timeout: 120000 })
    return fs.readFileSync(out)
  } finally { rm(inp, out) }
}

// har number (sid) ka apna data folder: main = data/, panel numbers = data/s/<sid>/
// set / reset ke foran baad GitHub `sessions` branch pe encrypted save (6h restart ke baad bhi rahe)
export const persistAssets = (sid = currentSid()) => saveAssets(sid, dataDir(sid))
export async function saveSong (mp3) { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(customSong(), mp3); return persistAssets() }
export async function resetSong () { rm(customSong()); return persistAssets() }
export async function saveDp (jpg) { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(customDp(), jpg); return persistAssets() }
export async function resetDp () { rm(customDp()); return persistAssets() }
