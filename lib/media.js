import fs from 'fs'
import webp from 'node-webpmux'
import config from '../config.js'
import { run, tmpFile, rm } from './utils.js'

const VF = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000'

// image/video buffer -> WhatsApp sticker (webp 512x512 + pack name exif)
export async function toSticker (buf, { video = false, pack = config.packname, author = config.author } = {}) {
  const inp = tmpFile(video ? 'mp4' : 'img'), out = tmpFile('webp')
  fs.writeFileSync(inp, buf)
  try {
    const args = video
      ? ['-y', '-i', inp, '-t', '6', '-vf', `fps=12,${VF}`, '-c:v', 'libwebp', '-loop', '0', '-q:v', '45', '-preset', 'default', '-an', '-fps_mode', 'passthrough', out]
      : ['-y', '-i', inp, '-vf', VF, '-frames:v', '1', '-c:v', 'libwebp', '-q:v', '80', '-preset', 'picture', '-an', out]
    await run(config.ffmpeg, args, { timeout: 120000 })
    let data = fs.readFileSync(out)
    // video sticker bara ho to quality kam karo (WhatsApp ~1MB limit)
    if (video && data.length > 900 * 1024) {
      await run(config.ffmpeg, ['-y', '-i', inp, '-t', '5', '-vf', `fps=10,${VF.replace(/512/g, '320')}`, '-c:v', 'libwebp', '-loop', '0', '-q:v', '25', '-an', '-fps_mode', 'passthrough', out], { timeout: 120000 })
      data = fs.readFileSync(out)
    }
    return await addExif(data, pack, author)
  } finally { rm(inp, out) }
}

export async function addExif (data, pack, author) {
  const img = new webp.Image()
  await img.load(data)
  const json = { 'sticker-pack-id': 'aqdas-md-' + Date.now(), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['🤖'] }
  const head = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
  const body = Buffer.from(JSON.stringify(json), 'utf8')
  const exif = Buffer.concat([head, body])
  exif.writeUIntLE(body.length, 14, 4)
  img.exif = exif
  const out = await img.save(null)
  // node-webpmux save() VP8X ka "alpha" flag (0x10) mita deta hai -> transparent kinare kaale dikhte the. Wapas lagao.
  const hadAlpha = data.length > 20 && data.toString('latin1', 12, 16) === 'VP8X' && (data[20] & 0x10)
  if (hadAlpha && out.length > 20 && out.toString('latin1', 12, 16) === 'VP8X') out[20] |= 0x10
  return out
}

// sticker (webp) -> png image
export async function stickerToImage (buf) {
  const img = new webp.Image()
  await img.load(buf)
  let still = buf
  if (img.hasAnim) {
    const frames = await img.demux({ buffers: true, frame: 0 })
    still = frames[0]
  }
  const inp = tmpFile('webp'), out = tmpFile('png')
  fs.writeFileSync(inp, still)
  try {
    await run(config.ffmpeg, ['-y', '-i', inp, '-frames:v', '1', out], { timeout: 60000 })
    return fs.readFileSync(out)
  } finally { rm(inp, out) }
}

// mp3 -> ogg opus (voice note)
export async function toVoiceNote (buf) {
  const inp = tmpFile('mp3'), out = tmpFile('ogg')
  fs.writeFileSync(inp, buf)
  try {
    await run(config.ffmpeg, ['-y', '-i', inp, '-vn', '-c:a', 'libopus', '-b:a', '64k', '-ac', '1', '-ar', '48000', out], { timeout: 60000 })
    return fs.readFileSync(out)
  } finally { rm(inp, out) }
}
