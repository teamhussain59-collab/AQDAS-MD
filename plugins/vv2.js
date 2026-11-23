// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — View Once Bypass (.vv2)
//  Command: .vv2 (Reply to any View Once Image/Video/Audio)
// ═══════════════════════════════════════════════════════════════════

import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
  name: 'vv2',
  alias: ['viewonce', 'readviewonce'],
  category: 'tools',

  async run(ctx) {
    // Check karein ke kya user ne kisi message ko reply kiya hai
    if (!ctx.quoted) {
      return ctx.reply('⚠️ *Kaise use karein?*\n\nKisi bhi *View Once* (One-time) photo, video ya audio ko reply karein aur `.vv2` likh kar bhejein.');
    }

    const quotedMsg = ctx.quoted.message;

    // View Once message ka type check karein (Baileys V2 formats)
    const type = Object.keys(quotedMsg)[0];
    
    // Agar ye view once nahi hai toh error dein
    if (type !== 'viewOnceMessageV2' && type !== 'viewOnceMessageV2Extension' && type !== 'viewOnceMessage') {
        return ctx.reply('❌ Ye koi View Once message nahi hai. Sahi message ko reply karke `.vv2` bhejein.');
    }

    try {
        // Process shuru hone ka reaction lagayein
        await ctx.react('⏳');

        // Asli media message nikaalein
        const innerMsg = quotedMsg[type].message;
        const mediaType = Object.keys(innerMsg)[0];

        // Media download karein
        const buffer = await downloadMediaMessage(
            { key: ctx.quoted.key, message: innerMsg },
            'buffer',
            {},
            { reuploadRequest: ctx.sock.updateMediaMessage }
        );

        if (!buffer) throw new Error("Media download fail");

        // Media ka payload taiyar karein (Image, Video, Audio)
        let payload = {};
        
        if (mediaType === 'imageMessage') {
            payload = { image: buffer, caption: '👁️ *View Once Image Saved!*\n\n_Powered by AQDAS MD_' };
        } else if (mediaType === 'videoMessage') {
            payload = { video: buffer, caption: '👁️ *View Once Video Saved!*\n\n_Powered by AQDAS MD_' };
        } else if (mediaType === 'audioMessage') {
            payload = { audio: buffer, mimetype: 'audio/mp4' };
        } else {
            return ctx.reply('❌ Ye media type support nahi karta.');
        }

        // Media wapas bhej dein
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
