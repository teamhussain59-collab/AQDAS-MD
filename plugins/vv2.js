// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — View Once Bypass (.vv2) - Bulletproof Version
//  Command: .vv2 (Reply to any Image/Video/Audio)
// ═══════════════════════════════════════════════════════════════════

import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
  name: 'vv2',
  alias: ['viewonce', 'readviewonce'],
  category: 'tools',

  async run(ctx) {
    if (!ctx.quoted) {
      return ctx.reply('⚠️ *Kaise use karein?*\n\nKisi bhi *View Once* (One-time) photo, video ya audio ko reply karein aur `.vv2` likh kar bhejein.');
    }

    let quoted = ctx.quoted;
    let innerMsg = quoted.message;

    // 1. Har tarah ke View Once wrapper ko kholain (Unwrap)
    if (innerMsg.viewOnceMessageV2) {
        innerMsg = innerMsg.viewOnceMessageV2.message;
    } else if (innerMsg.viewOnceMessageV2Extension) {
        innerMsg = innerMsg.viewOnceMessageV2Extension.message;
    } else if (innerMsg.viewOnceMessage) {
        innerMsg = innerMsg.viewOnceMessage.message;
    }

    let type = Object.keys(innerMsg)[0];

    // 2. Check karein ke valid media hai ya nahi
    if (type !== 'imageMessage' && type !== 'videoMessage' && type !== 'audioMessage') {
        return ctx.reply('❌ Ye koi Photo, Video ya Audio nahi hai. Sahi message ko reply karein.');
    }

    try {
        await ctx.react('⏳');

        // 3. Exact object banayein jo Baileys ko chahiye
        const msgToDownload = {
            key: quoted.key,
            message: innerMsg
        };

        // 4. Media Download karein (Bina kisi waLogger error ke)
        const buffer = await downloadMediaMessage(
            msgToDownload, 
            'buffer', 
            {}, 
            { 
                logger: console, // Logger error fix
                reuploadRequest: ctx.sock.updateMediaMessage 
            }
        );

        if (!buffer || buffer.length === 0) throw new Error("File download fail ho gayi.");

        // 5. Media wapas bhejein
        let payload = {};
        if (type === 'imageMessage') {
            payload = { image: buffer, caption: '👁️ *View Once Photo Saved!*\n\n_Powered by AQDAS MD_' };
        } else if (type === 'videoMessage') {
            payload = { video: buffer, caption: '👁️ *View Once Video Saved!*\n\n_Powered by AQDAS MD_' };
        } else if (type === 'audioMessage') {
            payload = { audio: buffer, mimetype: 'audio/mp4' };
        }

        await ctx.sock.sendMessage(ctx.jid, payload);
        await ctx.react('✅');

    } catch (error) {
        console.error('[VV2 Error]:', error);
        await ctx.react('❌');
        
        // Agar URL missing ka error aaye toh saaf message dein
        if (error.message.includes('No valid media URL') || error.message.includes('directPath')) {
            return ctx.reply('⚠️ *Download Fail:* WhatsApp ne is media ka link block kar diya hai ya media expire ho gayi hai.\n\n👉 Media aane ke *foran baad* `.vv2` reply karein, thodi der baad WhatsApp link block kar deta hai.');
        }
        
        return ctx.reply(`⚠️ Media download fail: ${error.message}`);
    }
  }
};
