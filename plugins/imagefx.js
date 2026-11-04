// Photo effects: photo bhejo (caption mein command) ya photo pe reply karo -> ffmpeg filter -> nayi photo
import fs from 'fs'
import config from '../config.js'
import { run, tmpFile, rm } from '../lib/utils.js'
import { toSticker } from '../lib/media.js'
import { heavy } from '../lib/limit.js'

const FIT = "scale='min(1600,iw)':'min(1600,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2"
const num = (v, d, lo, hi) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

export const FX = {
  grey: { d: 'Black & white', alias: ['gray', 'bw', 'greyscale'], vf: () => 'hue=s=0' },
  blur: { d: 'Blur (dhundla)', u: '[1-30]', vf: a => `gblur=sigma=${num(a[0], 8, 1, 30)}` },
  invert: { d: 'Negative / ulte rang', alias: ['negative', 'negate'], vf: () => 'negate' },
  sepia: { d: 'Sepia (purani bhoori photo)', vf: () => 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131' },
  pixelate: { d: 'Pixel / mosaic', alias: ['mosaic', 'pixelfx'], u: '[4-60]', vf: a => { const p = num(a[0], 16, 4, 60); return `scale=iw/${p}:-1:flags=neighbor,scale=iw*${p}:-1:flags=neighbor` } },
  mirror: { d: 'Aaina (left-right ulta)', alias: ['hflip'], vf: () => 'hflip' },
  vflip: { d: 'Ulta (upar-neeche)', alias: ['flipimg', 'upsidedownimg'], vf: () => 'vflip' },
  rotate: { d: 'Ghumao: 90 / 180 / 270', u: '[90|180|270]', vf: a => ({ 90: 'transpose=1', 180: 'hflip,vflip', 270: 'transpose=2' })[String(num(a[0], 90, 90, 270))] || 'transpose=1' },
  bright: { d: 'Roshan (brightness +)', alias: ['brighten'], vf: () => 'eq=brightness=0.15:contrast=1.05' },
  darken: { d: 'Andhera (brightness -)', alias: ['dim'], vf: () => 'eq=brightness=-0.18' },
  contrast: { d: 'Zyada contrast', vf: () => 'eq=contrast=1.6' },
  saturate: { d: 'Tez rang (saturation)', alias: ['vivid'], vf: () => 'eq=saturation=2.2' },
  sharpen: { d: 'Sharp / clear', alias: ['sharp'], vf: () => 'unsharp=7:7:2.0:7:7:0.0' },
  vignette: { d: 'Kinare andhere (vignette)', vf: () => 'vignette=angle=PI/3.2' },
  emboss: { d: 'Emboss (ubhra hua)', vf: () => "format=gray,convolution='-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2'" },
  edges: { d: 'Sirf kinare (edge detect)', alias: ['edge', 'outlinefx'], vf: () => 'edgedetect=low=0.1:high=0.3' },
  sketch: { d: 'Pencil sketch', alias: ['pencil', 'drawing'], vf: () => 'format=gray,edgedetect=mode=wires:low=0.05:high=0.2,negate' },
  toon: { d: 'Cartoon look', alias: ['cartoonfx', 'comicfx'], vf: () => "eq=saturation=1.6,format=rgb24,lutrgb=r='floor(val/48)*48':g='floor(val/48)*48':b='floor(val/48)*48',unsharp=5:5:1.5" },
  posterize: { d: 'Posterize (kam rang)', alias: ['poster'], vf: () => "format=rgb24,lutrgb=r='floor(val/64)*64+32':g='floor(val/64)*64+32':b='floor(val/64)*64+32'" },
  deepfry: { d: 'Deep fried meme 🍳', alias: ['fry'], q: 25, vf: () => 'eq=saturation=3:contrast=1.8:brightness=0.06,unsharp=7:7:3,noise=alls=28:allf=t' },
  rgbsplit: { d: 'RGB glitch split', alias: ['glitchimg', 'chromatic'], vf: () => 'format=gbrp,rgbashift=rh=-14:bh=14:gv=4' },
  grain: { d: 'Film grain', alias: ['noisy'], vf: () => 'noise=alls=22:allf=t' },
  warm: { d: 'Garam (warm) tone', alias: ['warmtone'], vf: () => 'colorbalance=rs=0.15:gs=0.05:bs=-0.15:rm=0.1:bm=-0.1' },
  cooltone: { d: 'Thanda (cool) tone', alias: ['cold'], vf: () => 'colorbalance=rs=-0.15:bs=0.2:rm=-0.1:bm=0.15' },
  oldphoto: { d: 'Purani photo (fade + grain)', alias: ['retroimg'], vf: () => 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=0.85:brightness=0.04,noise=alls=15:allf=t,vignette=angle=PI/3' },
  hue: { d: 'Rang ghumao: .hue 120', u: '[0-360]', vf: a => `hue=h=${num(a[0], 120, 0, 360)}` },
  thermal: { d: 'Thermal camera', alias: ['heatmap'], vf: () => "format=gray,lutrgb=r='clip(val*3-255,0,255)':g='clip(255-abs(val*2-255)*1.2,0,255)':b='clip(255-val*2.4,0,255)',format=yuv420p" },
  nightvision: { d: 'Night vision (hara)', alias: ['nv'], vf: () => 'hue=s=0,eq=brightness=0.08:contrast=1.3,colorchannelmixer=rr=0.15:gg=1.1:bb=0.15,noise=alls=18:allf=t,vignette=angle=PI/3.5' },
  square: { d: 'Square crop (DP ke liye)', alias: ['squarecrop'], vf: () => "crop='min(iw,ih)':'min(iw,ih)'" },
  frame: { d: 'Safaid frame', alias: ['border'], vf: () => 'pad=iw+80:ih+80:40:40:white,pad=iw+12:ih+12:6:6:0x222222' },
  jail: { d: 'Jail ke peeche 😂', alias: ['prison'], vf: () => 'hue=s=0.3,drawgrid=w=iw/7:h=ih*3:t=iw/45:c=0x1a1a1a@0.92,drawbox=x=0:y=ih*0.1:w=iw:h=ih/40:c=0x1a1a1a@0.92:t=fill,drawbox=x=0:y=ih*0.88:w=iw:h=ih/40:c=0x1a1a1a@0.92:t=fill' },
  bulge: { d: 'Phoola hua (fisheye)', alias: ['fisheye'], vf: () => 'lenscorrection=k1=-0.28:k2=0' },
  squeeze: { d: 'Pichka hua (pinch)', alias: ['pinchimg'], vf: () => 'lenscorrection=k1=0.45:k2=0.15' },
  wide: { d: 'Chaura (wide)', alias: ['widen'], vf: () => 'scale=iw*1.8:ih' },
  tall: { d: 'Lamba (tall)', alias: ['thin'], vf: () => 'scale=iw:ih*1.8' },
  pixelart: { d: '8-bit pixel art', alias: ['8bit'], vf: () => "scale=trunc(iw/20)*2:-2:flags=area,format=rgb24,eq=saturation=1.4,lutrgb=r='floor(val/51)*51':g='floor(val/51)*51':b='floor(val/51)*51',scale=iw*10:-2:flags=neighbor" },
  circle: { d: 'Gol (round) sticker', alias: ['round', 'circlecrop'], sticker: true, vf: () => "crop='min(iw,ih)':'min(iw,ih)',scale=512:512,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-W/2,Y-H/2),W/2-1),255,0)'" }
}

export async function applyFx (buf, name, args = [], { ffmpeg = config.ffmpeg || 'ffmpeg' } = {}) {
  const x = FX[name]; if (!x) throw new Error('effect nahi: ' + name)
  const inp = tmpFile('img'), out = tmpFile(x.sticker ? 'png' : 'jpg')
  fs.writeFileSync(inp, buf)
  try {
    await run(ffmpeg, ['-y', '-v', 'error', '-i', inp, '-frames:v', '1', '-vf', `${FIT},${x.vf(args)}`, ...(x.sticker ? [] : ['-q:v', String(x.q || 3)]), out], { timeout: 90000 })
    const o = fs.readFileSync(out)
    return x.sticker ? await toSticker(o, { video: false }) : o
  } finally { rm(inp, out) }
}

const IMG = ['imageMessage', 'stickerMessage']
export default Object.entries(FX).map(([name, x]) => ({
  name, alias: x.alias || [], category: 'image', usage: `(photo pe reply)${x.u ? ' ' + x.u : ''}`, desc: 'Photo effect: ' + x.d,
  async run (ctx) {
    if (!IMG.includes(ctx.targetType)) return ctx.reply(`🖌️ Photo bhejo caption *${ctx.prefix}${name}* ke sath, ya kisi photo pe reply karo *${ctx.prefix}${name}*`)
    await ctx.react('🖌️')
    try {
      const out = await heavy(async () => applyFx(await ctx.download(), name, ctx.args))
      await ctx.reply(x.sticker ? { sticker: out } : { image: out, mimetype: 'image/jpeg', caption: `🖌️ *${name}* — AQDAS MD` })
      await ctx.react('✅')
    } catch (e) { await ctx.react('❌'); await ctx.reply('⚠️ Effect nahi laga: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 150)) }
  }
}))
