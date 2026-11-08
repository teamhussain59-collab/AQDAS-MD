import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', 'data', 'otp-state.json');

export default {
  name: 'chstatus',
  alias: ['cring', 'channelring', 'chstat'],
  category: 'tools',

  async run(ctx) {
    if (!ctx.msg.key.fromMe && !ctx.owner) return;

    let channelJid = null;
    let text = (ctx.text || '').trim();

    // 1. Agar aapne channel ka link diya hai
    const match = text.match(/channel\/([A-Za-z0-9@._-]+)/);
    if (match) {
        try {
            const meta = await ctx.sock.newsletterMetadata('invite', match[1]);
            if (meta && meta.id) {
                channelJid = meta.id;
                text = text.replace(match[0], '').trim(); 
            }
        } catch(e) {}
    }

    // 2. Agar link nahi diya, toh pichle `.jd` wale saved channel par bhej dein
    if (!channelJid) {
        try {
            const store = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            const s = store[ctx.jid];
            if (s && s.numbersChannels && s.numbersChannels.length > 0) {
                channelJid = s.numbersChannels[0];
            }
        } catch(e) {}
    }

    if (!channelJid) {
        return ctx.reply('❌ Channel nahi mila!\n\n📝 `.chstatus <channel_link>` likh kar photo bhejein.');
    }

    const quoted = ctx.quoted;
    const msg = ctx.msg;
    const type = Object.keys(msg.message || {})[0];
    
    let payload = {};
    
    try {
        // Media ya text taiyar karein
        if (type === 'imageMessage') {
            const buffer = await ctx.download();
            payload = { image: buffer, caption: text };
        } else if (type === 'videoMessage') {
            const buffer = await ctx.download();
            payload = { video: buffer, caption: text };
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
            return ctx.reply('❌ Koi media ya text nahi mila.');
        }

        // 🚀 CHANNEL STATUS PAR BHEJEIN (Naya WhatsApp Feature)
        // Isme status@broadcast ke sath channelJid specify kiya jata hai
        const options = {
            statusJidList: [channelJid], // Ye line channel status banati hai
            backgroundColor: '#000000',
            font: 1
        };

        await ctx.sock.sendMessage('status@broadcast', payload, options);
        
        return ctx.reply('✅ *Channel Status lag gaya!*\n\n📱 Apne WhatsApp ke "Updates" tab mein jayein aur channel ke status (ring) mein check karein.');
        
    } catch (e) {
        return ctx.reply(`❌ Error: ${e.message}\n\n⚠️ Agar error aaye toh iska matlab aapka Baileys version abhi is naye feature ko fully support nahi kar raha.`);
    }
  }
};
