// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — Channel Status Plugin
//  Kisi bhi photo, video ya text ko Channel par post karne ke liye.
//  Command: .cstatus <channel_link> <text/media>
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: 'cstatus',
  alias: ['cpost', 'channelpost'],
  category: 'tools',

  async run(ctx) {
    // Sirf owner ya khud ka message ho tabhi chale
    if (!ctx.msg.key.fromMe && !ctx.owner) return;

    let text = (ctx.text || '').trim();
    let channelJid = null;
    
    // 1. Check karein ke text mein Channel ka link hai ya nahi
    const match = text.match(/channel\/([A-Za-z0-9@._-]+)/);
    if (match) {
        try {
            const meta = await ctx.sock.newsletterMetadata('invite', match[1]);
            if (meta && meta.id) {
                channelJid = meta.id;
                // Text mein se link hata dein taake post mein na aaye
                text = text.replace(match[0], '').trim(); 
            }
        } catch (e) {}
    }

    // 2. Agar link nahi diya, toh OTP bot wale saved channel par bhej dein
    if (!channelJid) {
        const STATE_FILE = path.join(__dirname, '..', 'data', 'otp-state.json');
        try {
            const store = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            const s = store[ctx.jid];
            if (s && s.numbersChannels && s.numbersChannels.length > 0) {
                channelJid = s.numbersChannels[0];
            }
        } catch(e) {}
    }

    if (!channelJid) {
        return ctx.reply('❌ Channel link nahi mila!\n\n📝 *Use:*\nMedia/Text bhejein aur caption mein `.cstatus <channel link>` likhein.\n_(Ya pehle `.jd` se apna channel set karein)_');
    }

    const quoted = ctx.quoted;
    const msg = ctx.msg;
    
    // Message ka type check karein (Image, Video, Text)
    const type = Object.keys(msg.message || {})[0];
    
    let payload = {};
    try {
        if (type === 'imageMessage') {
            const buffer = await ctx.download();
            payload = { image: buffer, caption: text || msg.message.imageMessage.caption || '' };
        } else if (type === 'videoMessage') {
            const buffer = await ctx.download();
            payload = { video: buffer, caption: text || msg.message.videoMessage.caption || '' };
        } else if (quoted) {
            const qType = Object.keys(quoted.message || {})[0];
            if (qType === 'imageMessage') {
                const buffer = await ctx.download(quoted);
                payload = { image: buffer, caption: text };
            } else if (qType === 'videoMessage') {
                const buffer = await ctx.download(quoted);
                payload = { video: buffer, caption: text };
            } else if (qType === 'conversation' || qType === 'extendedTextMessage') {
                payload = { text: quoted.message.conversation || quoted.message.extendedTextMessage.text };
            }
        } else if (text) {
            payload = { text: text };
        }

        if (Object.keys(payload).length === 0) {
            return ctx.reply('❌ Koi text ya media nahi mila.\n\n📝 *Use:*\nPhoto/Video bhejein aur caption mein `.cstatus <link>` likhein.');
        }

        // Channel par post bhejein
        await ctx.sock.sendMessage(channelJid, payload);
        return ctx.reply('✅ *Channel par Status post ho gaya!*\nSaare followers ko notification chali gayi.');
        
    } catch (e) {
        return ctx.reply(`❌ Post fail: ${e.message}\n\n⚠️ *Note:* Bot ko us Channel ka Admin hona chahiye.`);
    }
  }
};
