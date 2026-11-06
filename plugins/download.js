import { download, ytdlpAvailable, isUrl } from '../lib/download.js'
import { playCard } from '../lib/playpick.js'

async function guard (ctx, usage) {
  if (!ctx.text) { await ctx.reply(`Use: ${ctx.prefix}${ctx.command} ${usage}`); return false }
  if (!(await ytdlpAvailable())) {
    await ctx.reply('⚠️ Download ke liye *yt-dlp* install nahi hai.\nTermux: `pip install yt-dlp`\nServer: Dockerfile mein already hai.')
    return false
  }
  return true
}

function cmd (name, alias, kind, usage, desc, needUrl = false) {
  return {
    name, alias, category: 'download', usage, desc,
    async run (ctx) {
      if (!(await guard(ctx, usage))) return
      if (needUrl && !isUrl(ctx.text)) return ctx.reply(`❌ Link do. Use: ${ctx.prefix}${name} ${usage}`)
      await ctx.react('⏳')
      await ctx.reply(`📥 Download ho raha hai... (${kind === 'audio' ? 'song' : 'video'})`)
      let r
      try { r = await download(ctx.text, kind) } catch (e) { await ctx.react('❌'); return ctx.reply('❌ ' + e.message) }
      try {
        if (kind === 'audio') {
          await ctx.reply({ audio: r.buffer, mimetype: 'audio/mpeg', fileName: r.title + '.mp3' })
          await ctx.reply(`🎵 *${r.title}*\n_— AQDAS MD_`)
        } else if (r.buffer.length > 60 * 1048576) {
          // WhatsApp video ki had ~64MB: bari file document ban ke jati hai
          await ctx.reply({ document: r.buffer, mimetype: 'video/mp4', fileName: r.title.slice(0, 60) + '.mp4', caption: `🎬 *${r.title}*\n(bari file, document mein)\n_— AQDAS MD_` })
        } else {
          await ctx.reply({ video: r.buffer, mimetype: 'video/mp4', caption: `🎬 *${r.title}*\n_— AQDAS MD_` })
        }
        await ctx.react('✅')
      } finally { r.cleanup() }
    }
  }
}

export default [
  { name: 'play', alias: ['song', 'music'], category: 'download', usage: '<song ka naam ya link>', desc: 'Song: photo + info, phir 1 = MP3 / 2 = MP4', async run (ctx) { if (!(await guard(ctx, '<song ka naam ya link>'))) return; return playCard(ctx) } },
  cmd('playmp3', ['songmp3'], 'audio', '<song ka naam>', 'Seedha song mp3 (bina sawal)'),
  cmd('video', ['ytv', 'vid'], 'video', '<naam ya link>', 'YouTube se video'),
  cmd('ytmp3', ['yta'], 'audio', '<youtube link>', 'YouTube link se mp3', true),
  cmd('ytmp4', [], 'video', '<youtube link>', 'YouTube link se mp4', true),
  cmd('tiktok', ['tt', 'tiktokdl'], 'video', '<tiktok link>', 'TikTok video download', true),
  cmd('insta', ['ig', 'instagram', 'reel'], 'video', '<instagram link>', 'Instagram reel/video download', true),
  cmd('fb', ['facebook'], 'video', '<facebook link>', 'Facebook video download', true),
  cmd('tiktokmp3', ['ttmp3'], 'audio', '<tiktok link>', 'TikTok ka sound (mp3)', true)
]
