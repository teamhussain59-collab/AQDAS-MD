// .url — photo/video/file bhejo ya reply karo, bot uska direct link bana dega
const FREEIMAGE_KEY = process.env.FREEIMAGE_KEY || '6d207e02198a847aa98d0a2a901485a5' // freeimage.host ki public key

const EXT = { imageMessage: 'jpg', videoMessage: 'mp4', audioMessage: 'mp3', stickerMessage: 'webp', documentMessage: 'bin' }
const MIME = { jpg: 'image/jpeg', mp4: 'video/mp4', mp3: 'audio/mpeg', webp: 'image/webp', bin: 'application/octet-stream' }

async function post (url, form, ms = 60000) {
  const r = await fetch(url, { method: 'POST', body: form, headers: { 'User-Agent': 'Mozilla/5.0 AQDAS-MD' }, signal: AbortSignal.timeout(ms) })
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { _raw: t, _status: r.status } }
}

async function toFreeImage (buf, name, mime) {
  const f = new FormData()
  f.append('key', FREEIMAGE_KEY); f.append('action', 'upload'); f.append('format', 'json')
  f.append('source', new Blob([buf], { type: mime }), name)
  const j = await post('https://freeimage.host/api/1/upload', f)
  return j?.image?.url || null
}
async function toQuax (buf, name, mime) {
  const f = new FormData(); f.append('files[]', new Blob([buf], { type: mime }), name)
  const j = await post('https://qu.ax/upload.php', f)
  return j?.files?.[0]?.url || null
}
async function toUguu (buf, name, mime) {
  const f = new FormData(); f.append('files[]', new Blob([buf], { type: mime }), name)
  const j = await post('https://uguu.se/upload', f)
  return j?.files?.[0]?.url || null
}

export default [
  {
    name: 'url', alias: ['tourl', 'imgurl', 'upload'], category: 'tools', usage: '(photo/video/file pe reply ya caption)', desc: 'Photo/video/file ka direct URL banao',
    async run (ctx) {
      const t = ctx.targetType
      if (!EXT[t]) return ctx.reply(`📸 Photo/video/file bhejo caption *${ctx.prefix}url* ke sath, ya us pe reply karo *${ctx.prefix}url*`)
      await ctx.react('⏳')
      let buf
      try { buf = await ctx.download() } catch (e) { await ctx.react('❌'); return ctx.reply('❌ File download nahi hui, dobara bhejo') }
      if (buf.length > 30 * 1024 * 1024) { await ctx.react('❌'); return ctx.reply('❌ File 30MB se badi hai') }
      let ext = EXT[t]
      const dmime = ctx.quoted?.message?.documentMessage?.mimetype || ctx.msg?.message?.documentMessage?.mimetype
      if (t === 'documentMessage' && dmime) ext = (dmime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'
      const mime = (t === 'documentMessage' && dmime) || MIME[ext] || 'application/octet-stream'
      const name = `aqdas_${Date.now()}.${ext}`
      const tries = (t === 'imageMessage' || t === 'stickerMessage') ? [toFreeImage, toQuax, toUguu] : [toQuax, toUguu]
      let url = null
      for (const fn of tries) { try { url = await fn(buf, name, mime); if (url) break } catch {} }
      if (!url) { await ctx.react('❌'); return ctx.reply('❌ Upload nahi hua, thodi der baad try karo') }
      await ctx.react('✅')
      const kb = (buf.length / 1024).toFixed(0)
      return ctx.reply(`✅ *URL ban gaya!*\n\n${url}\n\n📦 Size: ${kb} KB\n> AQDAS MD`)
    }
  }
]
