// Bhaari kaam (ffmpeg: logo / sticker / filter) ek waqt mein zyada se zyada N — taa ke 100 log ek saath .neon bhejein to bhi runner na atke
export function makeLimiter (max = 3) {
  let active = 0; const q = []
  const next = () => { if (active >= max || !q.length) return; active++; const { fn, res, rej } = q.shift(); Promise.resolve().then(fn).then(res, rej).finally(() => { active--; next() }) }
  const limit = fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next() })
  limit.stats = () => ({ active, queued: q.length })
  return limit
}
export const heavy = makeLimiter(Number(process.env.HEAVY_JOBS || 3))

// reply kiye hue message ka text (caption bhi)
export function quotedText (ctx) {
  const q = ctx.quoted?.message
  return (q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '').trim()
}
