// Logo maker: sab kuch runner pe ffmpeg se banta hai (bundled OFL fonts, gradients, glow, outline, 3D).
// Kisi scraper website pe depend nahi. Styles: lib/logostyles.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import config from '../config.js'
import { run, tmpFile, rm } from './utils.js'
import { STYLES } from './logostyles.js'

export const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'media', 'fonts')
const METRICS = JSON.parse(fs.readFileSync(path.join(FONT_DIR, 'metrics.json'), 'utf8'))
export const W = 1280, H = 640
export const MAX_CHARS = 40
export { STYLES }
export const styleNames = () => Object.keys(STYLES)

const hex = c => (String(c).startsWith('#') ? '0x' + c.slice(1) : c)

export function textWidth (font, s) { // 1000-unit em
  const m = METRICS[font]; let w = 0
  for (const ch of s) { const c = ch.codePointAt(0); w += (c >= 32 && c < 127) ? m.w[c - 32] : m.w[33] }
  return w
}

// text -> lines + font size + baselines (sab se bara size jo canvas mein fit ho)
export function layout (font, text, { pad = 0, maxSize = 250 } = {}) {
  const m = METRICS[font]
  if (!m) throw new Error('font nahi mila: ' + font)
  const words = text.split(/\s+/).filter(Boolean)
  const cands = [[words.join(' ')]]
  if (words.length > 1) {
    let best = null
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ')
      const mw = Math.max(textWidth(font, a), textWidth(font, b))
      if (!best || mw < best.mw) best = { mw, lines: [a, b] }
    }
    cands.push(best.lines)
  }
  if (words.length > 3) {
    let best = null
    for (let i = 1; i < words.length - 1; i++) for (let j = i + 1; j < words.length; j++) {
      const ls = [words.slice(0, i), words.slice(i, j), words.slice(j)].map(x => x.join(' '))
      const mw = Math.max(...ls.map(l => textWidth(font, l)))
      if (!best || mw < best.mw) best = { mw, lines: ls }
    }
    cands.push(best.lines)
  }
  const maxW = W * 0.88 - pad * 2, maxH = H * 0.74 - pad * 2
  const lh = m.a + Math.min(m.d, m.a * 0.4) // bohat lambe descender (Nosifer) se lines door na hon
  let pick = null
  for (const lines of cands) {
    const mw = Math.max(...lines.map(l => textWidth(font, l)), 1)
    const size = Math.floor(Math.min(maxW * 1000 / mw, maxH * 1000 / (lines.length * lh), maxSize))
    if (!pick || size > pick.size + 4) pick = { lines, size }
  }
  const { lines, size } = pick
  const lhp = lh * size / 1000
  const top = (H - lhp * lines.length) / 2
  const baselines = lines.map((_, i) => Math.round(top + i * lhp + m.a * size / 1000))
  const widest = Math.max(...lines.map(l => textWidth(font, l))) * size / 1000
  const box = { x0: Math.round((W - widest) / 2), x1: Math.round((W + widest) / 2), y0: Math.round(top), y1: Math.round(top + lhp * lines.length) }
  return { lines, size, baselines, box, top }
}

function grad (colors, { dir = 'v', type = 'linear', box = { x0: 0, y0: 0, x1: W, y1: H } } = {}) {
  const cs = colors.slice(0, 8).map((c, i) => `c${i}=${hex(c)}`).join(':')
  let x0, y0, x1, y1
  const cx = Math.round((box.x0 + box.x1) / 2), cy = Math.round((box.y0 + box.y1) / 2)
  if (type === 'radial' || type === 'circular' || type === 'spiral') { x0 = cx; y0 = cy; x1 = Math.max(box.x1, cx + 1); y1 = Math.max(box.y1, cy + 1) } else if (dir === 'h') { x0 = box.x0; y0 = cy; x1 = box.x1; y1 = cy } else if (dir === 'd') { x0 = box.x0; y0 = box.y0; x1 = box.x1; y1 = box.y1 } else { x0 = cx; y0 = box.y0; x1 = cx; y1 = box.y1 }
  return `gradients=s=${W}x${H}:r=1:d=1:speed=0.00001:n=${Math.max(2, Math.min(8, colors.length))}:${cs}:x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:type=${type}`
}
const src = (paint, opts) => (Array.isArray(paint) && paint.length > 1 ? grad(paint, opts) : `color=c=${hex(Array.isArray(paint) ? paint[0] : paint)}:s=${W}x${H}:r=1:d=1`)

// background patterns (gray alpha mask expressions for geq)
const PATTERN = {
  stars: "if(lt(random(1),0.0016),255,if(lt(random(1),0.004),110,0))",
  dots: 'if(lt(hypot(mod(X,28)-14,mod(Y,28)-14),5),255,0)',
  bricks: 'if(lt(mod(Y,48),5)+lt(mod(X+48*mod(floor(Y/48),2),96),5),255,0)',
  stripes: 'if(lt(mod(X+Y,56),24),255,0)',
  rays: 'if(lt(mod(atan2(Y-H/2,X-W/2)*24/PI+48,2),1),255,0)',
  hex: 'if(lt(abs(mod(X,60)-30)+abs(mod(Y,52)-26)*1.15,26),0,255)',
  waves: 'if(lt(abs(mod(Y+18*sin(X/40),40)-20),3),255,0)',
  checker: 'if(eq(mod(floor(X/64)+floor(Y/64),2),0),255,0)',
  circles: 'if(lt(mod(hypot(X-W/2,Y-H/2),48),5),255,0)',
  rain: 'if(lt(mod(X*7+Y*0.25,23),1)*lt(mod(Y+X*13,90),50),255,0)',
  matrix: 'if(lt(mod(X,22),12)*lt(random(1),0.14)*gt(mod(Y+X*37,140),40),255,0)',
  scratch: 'if(lt(random(1),0.002),255,0)',
  plasma: '128+60*sin(X/37)+60*sin(Y/23+X/51)'
}

export function buildFilter (st, L, files) {
  const P = []; let n = 0
  const lab = p => `${p}${n++}`
  // text masks libass (ass filter) se: GitHub runner ka static ffmpeg 7 drawtext ke bagair hai, libass us mein hai
  const m = METRICS[st.font]
  const fs0 = (L.size * m.k).toFixed(1) // ASS font size = em * (winAscent+winDescent)/unitsPerEm
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: M,${m.f},${fs0},&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const esc = t => t.replace(/\\/g, '/').replace(/\{/g, '(').replace(/\}/g, ')')
  const mask = specs => {
    const l = lab('m')
    let ev = ''
    for (const { dx = 0, dy = 0, bw = 0 } of specs) {
      L.lines.forEach((ln, i) => {
        const cy = L.baselines[i] + (m.wd - m.wa) * L.size / 2000 // libass line box = winAscent..winDescent
        ev += `Dialogue: 0,0:00:00.00,0:00:10.00,M,,0,0,0,,{\\pos(${(W / 2 + dx).toFixed(1)},${(cy + dy).toFixed(1)})\\bord${Math.max(0, bw).toFixed(1)}\\shad0}${esc(ln)}\n`
      })
    }
    const f = path.join(files.dir, `${l}.ass`)
    fs.writeFileSync(f, head + ev)
    P.push(`color=c=black:s=${W}x${H}:r=1:d=1,format=rgb24,ass=filename='${f}':fontsdir='${files.dir}',format=gray,lut=c0='clip((val-16)*255/219,0,255)'[${l}]`)
    return l
  }
  const paint = (p, m, o = {}) => { const c = lab('c'), out = lab('p'); P.push(`${src(p, { box: L.box, ...o })},format=rgba[${c}]`); P.push(`[${c}][${m}]alphamerge[${out}]`); return out }
  let base = lab('bg')
  P.push(`${src(st.bg, { dir: st.bgDir || 'd', type: st.bgType || 'linear', box: { x0: 0, y0: 0, x1: W, y1: H } })},format=rgba[${base}]`)
  const over = (layer, x = 0, y = 0) => { const o = lab('o'); P.push(`[${base}][${layer}]overlay=${x}:${y}:format=auto[${o}]`); base = o }
  const filt = f => { const o = lab('f'); P.push(`[${base}]${f}[${o}]`); base = o }
  for (const fx of st.bgfx || []) {
    const [name, color = '#ffffff', alpha = 0.25] = Array.isArray(fx) ? fx : [fx]
    if (PATTERN[name]) {
      const g = lab('g'); const e = PATTERN[name]
      P.push(`color=c=black:s=${W}x${H}:r=1:d=1,format=gray,geq=lum='${e}*${alpha}'${name === 'stars' ? ',gblur=sigma=0.7,lut=c0=val*2.2' : ''}[${g}]`)
      over(paint(color, g))
    } else if (name === 'noise') filt(`noise=alls=${Math.round(alpha * 60)}:allf=u`)
    else if (name === 'vignette') filt('vignette=angle=PI/3.6')
    else if (name === 'grid') filt(`drawgrid=w=64:h=64:t=2:c=${hex(color)}@${alpha}`)
    else if (name === 'scan') filt(`drawgrid=w=${W}:h=4:t=1:c=${hex(color)}@${alpha}`)
    else if (name === 'glowspot') { const g = lab('g'); P.push(`color=c=black:s=${W}x${H}:r=1:d=1,format=gray,geq=lum='255*${alpha}*max(0,1-hypot(X-W/2,Y-H/2)/(W*0.42))'[${g}]`); over(paint(color, g)) }
    else if (name === 'frame') filt(`drawbox=x=18:y=18:w=${W - 36}:h=${H - 36}:t=6:c=${hex(color)}@${alpha}`)
  }
  const ow = (st.outline?.w || 0), ow2 = ow + (st.outline2?.w || 0)
  const outer = ow2 || ow
  if (st.shadow) {
    const s = st.shadow; let m = mask([{ dx: s.dx ?? 10, dy: s.dy ?? 10, bw: outer }])
    if (s.blur) { const b = lab('b'); P.push(`[${m}]gblur=sigma=${s.blur}[${b}]`); m = b }
    over(paint(s.color || '#000000', m))
  }
  for (const g of [].concat(st.glow || [])) {
    const m = mask([{ bw: outer + (g.spread || 0) }]); const b = lab('b')
    P.push(`[${m}]gblur=sigma=${g.sigma || 18},lut=c0='min(255,val*${g.gain || 2})'[${b}]`)
    over(paint(g.color, b, { dir: g.dir || 'h' }))
  }
  if (st.extrude) {
    const e = st.extrude; const d = e.depth || 12; const specs = []
    for (let i = d; i >= 1; i--) specs.push({ dx: (e.dx ?? 1) * i, dy: (e.dy ?? 1) * i, bw: outer })
    over(paint(e.color || '#000000', mask(specs), { dir: 'v' }))
  }
  if (st.glitch) {
    const g = st.glitch; const off = g.off || 9
    over(paint(g.c1 || '#ff0040', mask([{ dx: -off, dy: g.dy || 0, bw: ow }])))
    over(paint(g.c2 || '#00f0ff', mask([{ dx: off, dy: -(g.dy || 0), bw: ow }])))
  }
  if (st.outline2) over(paint(st.outline2.color, mask([{ bw: ow2 }]), { dir: st.outline2.dir || 'v' }))
  if (st.outline) over(paint(st.outline.color, mask([{ bw: ow }]), { dir: st.outline.dir || 'v' }))
  over(paint(st.fill, mask([{}]), { dir: st.fillDir || 'v', type: st.fillType || 'linear' }))
  if (st.inner) { // andar ki chamak (highlight) upar wale hisse pe
    const m = mask([{ dy: -Math.max(2, L.size * 0.03) }]); const m2 = mask([{}]); const x = lab('x')
    P.push(`[${m}][${m2}]blend=all_mode=multiply,lut=c0=val*${st.inner.alpha || 0.35}[${x}]`)
    over(paint(st.inner.color || '#ffffff', x))
  }
  if (st.slices) { // glitch: text ki kuch patti side mein khiskao
    for (const [fy, dx, hh] of st.slices) {
      const y = Math.round(L.box.y0 + (L.box.y1 - L.box.y0) * fy), h = Math.max(6, Math.round((L.box.y1 - L.box.y0) * hh))
      const a = lab('s'), b = lab('s'), c = lab('s'), o = lab('o')
      P.push(`[${base}]split[${a}][${b}]`); P.push(`[${b}]crop=${W}:${h}:0:${y}[${c}]`); P.push(`[${a}][${c}]overlay=${dx}:${y}[${o}]`); base = o
    }
  }
  for (const f of st.post || []) filt(f)
  filt('format=yuvj444p')
  return { graph: P.join(';'), out: base }
}

export function cleanText (raw, st = {}) {
  let t = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (st.upper) t = t.toUpperCase()
  return t
}

export async function makeLogo (styleName, raw, { ffmpeg = config.ffmpeg || 'ffmpeg', timeout = 60000 } = {}) {
  const st = STYLES[String(styleName).toLowerCase()]
  if (!st) throw new Error('Ye style nahi hai: ' + styleName)
  const text = cleanText(raw, st)
  if (!text) throw new Error('Text do')
  if ([...text].length > MAX_CHARS) throw new Error(`Text bohat lamba hai (max ${MAX_CHARS} letters)`)
  const pad = (st.outline?.w || 0) + (st.outline2?.w || 0) + (st.extrude ? (st.extrude.depth || 12) * 1.2 : 0) + (st.glitch ? 12 : 0)
  const L = layout(st.font, text, { pad, maxSize: st.maxSize || 250 })
  const dir = tmpFile('logo') // sirf is style ka font (libass har mask pe poora folder parhta hai)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(FONT_DIR, st.font + '.ttf'), path.join(dir, st.font + '.ttf'))
  const out = path.join(dir, 'out.jpg')
  try {
    const { graph, out: o } = buildFilter(st, L, { dir })
    await run(ffmpeg, ['-y', '-v', 'error', '-filter_complex', graph, '-map', `[${o}]`, '-frames:v', '1', '-q:v', '2', out], { timeout })
    return fs.readFileSync(out)
  } finally { rm(dir) }
}
