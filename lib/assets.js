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

// Menu media: .setmenu wali (video / photo) > original motion clip (media/menu.mp4) > DP photo
// .setmenu dp = menu pe sirf DP photo (setting menuDp)
export const ORIGINAL_MENU = './media/menu.mp4'
export const customMenuVideo = () => path.join(dataDir(), 'menu_media.mp4')
export const customMenuImage = () => path.join(dataDir(), 'menu_media.jpg')
export function menuMedia (useDp = false) {
  const dp = fs.existsSync(dpPath()) ? { type: 'image', path: dpPath() } : null
  if (useDp) return dp
  if (fs.existsSync(customMenuVideo())) return { type: 'video', path: customMenuVideo() }
  if (fs.existsSync(customMenuImage())) return { type: 'image', path: customMenuImage() }
  if (fs.existsSync(ORIGINAL_MENU)) return { type: 'video', path: ORIGINAL_MENU }
  return dp
}

// koi bhi video/gif -> chhota mp4 (h264, bina awaz, max 15 sec, max 480px) taake GIF jaisa chale aur store mein chhota rahe
export async function toMenuVideo (buf, seconds = 15) {
  const inp = tmpFile('in'), out = tmpFile('mp4')
  fs.writeFileSync(inp, buf)
  try {
    await run(config.ffmpeg, ['-y', '-i', inp, '-t', String(seconds), '-an', '-vf', "scale='min(480,iw)':-2:flags=lanczos,fps=30,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-profile:v', 'main', '-movflags', '+faststart', out], { timeout: 180000 })
    return fs.readFileSync(out)
  } finally { rm(inp, out) }
}

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
export async function saveMenuVideo (mp4) { fs.mkdirSync(dataDir(), { recursive: true }); rm(customMenuImage()); fs.writeFileSync(customMenuVideo(), mp4); return persistAssets() }
export async function saveMenuImage (jpg) { fs.mkdirSync(dataDir(), { recursive: true }); rm(customMenuVideo()); fs.writeFileSync(customMenuImage(), jpg); return persistAssets() }
export async function resetMenu () { rm(customMenuVideo(), customMenuImage()); return persistAssets() }

// .enhance: photo 2x (lanczos) + sharp (unsharp) + halka contrast/color normalise — sirf ffmpeg, koi paid API nahi
export async function enhanceImage (buf) {
  const inp = tmpFile('img'), out = tmpFile('jpg')
  fs.writeFileSync(inp, buf)
  try {
    // bari photo ko bohat bara na karo: lambi side max 4096
    const vf = "scale='if(gt(iw,ih),min(iw*2,4096),-2)':'if(gt(iw,ih),-2,min(ih*2,4096))':flags=lanczos,unsharp=5:5:0.9:5:5:0.0,eq=contrast=1.05:saturation=1.08:brightness=0.01,hqdn3d=1:1:2:2"
    await run(config.ffmpeg, ['-y', '-i', inp, '-frames:v', '1', '-vf', vf, '-q:v', '2', out], { timeout: 120000 })
    return fs.readFileSync(out)
  } finally { rm(inp, out) }
}
