// ═══════════════════════════════════════════════════════════════════
//  AQDAS MD — Random Link Generator (.cmand)
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto'; // ✅ Random 32-char code banane ke liye

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'store-links.json');
const states = {}; 
const hookedSocks = new WeakSet();

// File save/load functions
function loadData() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveData(data) {
    if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Hook to catch user replies
function ensureHook(ctx) {
    const sock = ctx.sock;
    if (!sock || hookedSocks.has(sock)) return;
    hookedSocks.add(sock);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg?.message || !msg.key?.remoteJid) continue;
                if (msg.key.remoteJid.endsWith('@g.us') || msg.key.remoteJid.endsWith('@newsletter')) continue;
                if (!msg.key.fromMe) continue; 
                
                const jid = msg.key.remoteJid;
                const state = states[jid];
                if (!state) continue;

                const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                if (!text || /^[./!#]/.test(text)) continue; 

                const reply = (t) => sock.sendMessage(jid, { text: t });

                // Step 1: Category
                if (state.step === 'await_category') {
                    state.category = text.trim();
                    state.step = 'await_platform';
                    await reply(`✅ Category: *${state.category}*\n\nAb konsa platform select karna hai?\n\n1️⃣ Instagram\n2️⃣ TikTok\n3️⃣ YouTube\n\n_Bas naam likh kar bhejein (jaise: yt ya insta)_`);
                } 
                // Step 2: Platform
                else if (state.step === 'await_platform') {
                    state.platform = text.trim();
                    state.step = 'await_link';
                    await reply(`✅ Platform: *${state.platform}*\n\nAb us video/photo ka link bhejein:`);
                }
                // Step 3: Link & Wait
                else if (state.step === 'await_link') {
                    if (!text.startsWith('http')) {
                        await reply('❌ Sahi link bhejein (http ya https se shuru hona chahiye).');
                        continue;
                    }
                    state.link = text.trim();
                    state.step = 'processing';
                    
                    await reply(`⏳ *Link process ho raha hai...*\n\nBot verify kar raha hai. Please wait...`);

                    // 👇 Yahan Time Set Karein (120000 = 2 Minutes, 5000 = 5 Seconds)
                    const waitTime = 120000; 

                    setTimeout(async () => {
                        try {
                            // 🚀 RANDOM 32-CHARACTER CODE GENERATE KAREIN (e.g., e72662e1c71d7e885211dd5d4d9276b4)
                            const randomCode = crypto.randomBytes(16).toString('hex');
                            
                            // Data save karein
                            const allData = loadData();
                            allData[randomCode] = {
                                category: state.category,
                                platform: state.platform,
                                link: state.link,
                                date: new Date().toISOString()
                            };
                            saveData(allData);

                            // ✅ Aapki Website ka Dashboard Link (Exact Format)
                            const finalLink = `https://mr-aqdas-store.rf.gd/index.php?link=${randomCode}`;

                            await sock.sendMessage(jid, { 
                                text: `✅ *Process Complete!*\n\n📁 *Category:* ${state.category}\n🌐 *Platform:* ${state.platform}\n\n🔗 *Aapka Link:*\n${finalLink}\n\n_Ab aap is link ko copy karke apni website ke dashboard mein use kar sakte hain._`
                            });
                            
                            delete states[jid]; // State clear karein
                        } catch (e) { console.error('[Cmand Timer Error]', e); }
                    }, waitTime); 
                }
            } catch (e) { console.error('[Cmand Hook]', e.message); }
        }
    });
}

export default {
    name: 'cmand',
    alias: ['cmcmand', 'makelink', 'storelink'],
    category: 'tools',
    
    async run(ctx) {
        ensureHook(ctx);
        
        if (!ctx.msg.key.fromMe && !ctx.owner) return;
        
        states[ctx.jid] = { step: 'await_category' };
        return ctx.reply('📝 *Category name likho* (Example: funny, gaming, edits, etc.)');
    }
};
