import { download, ytdlpAvailable, isUrl } from '../lib/download.js'

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
      const r = await download(ctx.text, kind)
      try {
        if (kind === 'audio') {
          await ctx.reply({ audio: r.buffer, mimetype: 'audio/mpeg', fileName: r.title + '.mp3' })
          await ctx.reply(`🎵 *${r.title}*\n_— AQDAS MD_`)
        } else {
          await ctx.reply({ video: r.buffer, mimetype: 'video/mp4', caption: `🎬 *${r.title}*\n_— AQDAS MD_` })
        }
        await ctx.react('✅')
      } finally { r.cleanup() }
    }
  }
}

export default [
  cmd('play', ['song', 'music'], 'audio', '<song ka naam ya link>', 'YouTube se song (mp3)'),
  cmd('video', ['ytv', 'vid'], 'video', '<naam ya link>', 'YouTube se video'),
  cmd('ytmp3', ['yta'], 'audio', '<youtube link>', 'YouTube link se mp3', true),
  cmd('ytmp4', [], 'video', '<youtube link>', 'YouTube link se mp4', true),
  cmd('tiktok', ['tt', 'tiktokdl'], 'video', '<tiktok link>', 'TikTok video download', true),
  cmd('insta', ['ig', 'instagram', 'reel'], 'video', '<instagram link>', 'Instagram reel/video download', true),
  cmd('fb', ['facebook'], 'video', '<facebook link>', 'Facebook video download', true),
  cmd('tiktokmp3', ['ttmp3'], 'audio', '<tiktok link>', 'TikTok ka sound (mp3)', true)
]
