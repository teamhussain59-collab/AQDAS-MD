// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — View Once Bypass (.vv2) - Fixed Version
//  Command: .vv2 (Reply to any Image/Video/Audio)
// ═══════════════════════════════════════════════════════════════════

import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
  name: 'vv2',
  alias: ['viewonce', 'readviewonce'],
  category: 'tools',

  async run(ctx) {
    // 1. Check karein ke kya user ne kisi message ko reply kiya hai
    if (!ctx.quoted) {
      return ctx.reply('⚠️ *Kaise use karein?*\n\nKisi bhi *View Once* (One-time) photo, video ya audio ko reply karein aur `.vv2` likh kar bhejein.');
    }

    // 2. Message object nikaalein (Handler ke hisaab se)
    let msgObj = ctx.quoted.message || ctx.quoted;
    let type = Object.keys(msgObj)[0];

    // 3. Agar View Once ka wrapper laga hua hai, toh usko kholain
    if (type === 'viewOnceMessage' || type === 'viewOnceMessageV2' || type === 'viewOnceMessageV2Extension') {
        msgObj = msgObj[type].message;
        type = Object.keys(msgObj)[0];
    }

    // 4. Check karein ke ye Image, Video ya Audio hai
    if (type !== 'imageMessage' && type !== 'videoMessage' && type !== 'audioMessage') {
        return ctx.reply('❌ Ye koi Photo, Video ya Audio nahi hai. Sahi message ko reply karke `.vv2` bhejein.');
    }

    try {
        // Process shuru hone ka reaction lagayein
        await ctx.react('⏳');

        // 5. Media Download Karein
        const buffer = await downloadMediaMessage(
            { key: ctx.quoted.key, message: msgObj }, // Asli message object pass karein
            'buffer',
            {},
            { reuploadRequest: ctx.sock.updateMediaMessage }
        );

        if (!buffer) throw new Error("Media download fail");

        // 6. Media ka payload taiyar karein
        let payload = {};
        
        if (type === 'imageMessage') {
            payload = { image: buffer, caption: '👁️ *View Once Photo Saved!*\n\n_Powered by AQDAS MD_' };
        } else if (type === 'videoMessage') {
            payload = { video: buffer, caption: '👁️ *View Once Video Saved!*\n\n_Powered by AQDAS MD_' };
        } else if (type === 'audioMessage') {
            payload = { audio: buffer, mimetype: 'audio/mp4' };
        }

        // 7. Media wapas bhej dein
        await ctx.sock.sendMessage(ctx.jid, payload);
        
        // Success reaction
        await ctx.react('✅');

    } catch (error) {
        console.error('[VV2 Error]:', error);
        await ctx.react('❌');
        return ctx.reply(`⚠️ Media download karne mein error aya: ${error.message}`);
    }
  }
};
