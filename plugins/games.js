// Games: truth / dare / would-you-rather / 8ball / rate / ship / rps / slot ... (sab offline)
import crypto from 'crypto'
const r = n => crypto.randomInt(n)
const pick = a => a[r(a.length)]
const pct = () => r(101)
const bar = p => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10))
const who = ctx => ctx.mentioned?.[0] ? '@' + ctx.mentioned[0].split('@')[0] : (ctx.text || ctx.pushName || 'Tum')
const ment = ctx => (ctx.mentioned?.length ? { mentions: ctx.mentioned } : {})
const send = (ctx, text) => (ctx.mentioned?.length ? ctx.sock.sendMessage(ctx.jid, { text, ...ment(ctx) }, { quoted: ctx.msg }) : ctx.reply(text))

const TRUTH = ['Tumhara sab se bara dar (fear) kya hai?', 'Aakhri jhoot kab aur kis se bola?', 'Kis pe secret crush tha / hai?', 'Phone mein sab se ajeeb search kya hai?', 'Kabhi kisi ka message dekh kar ignore kiya? Kis ka?', 'Bachpan ki sab se sharminda karne wali baat?', 'Kis dost se sab se zyada jealous ho?', 'Agar ek din invisible ho jao to kya karoge?', 'Sab se lambi der tak kab soye the?', 'Kabhi exam mein cheating ki?', 'Group mein sab se funny kaun hai?', 'Apni koi buri aadat batao', 'Kabhi kisi ki cheez chupke se khayi?', 'Aakhri baar kab roye the aur kyun?', 'Kis celebrity se shaadi karna chahoge?', 'Tumhara sab se bara khwab kya hai?', 'Kabhi Ammi se kuch chhupaya? Kya?', 'Phone ki gallery mein aakhri photo kya hai?', 'Kis cheez pe paisa zaya kiya jis pe afsos hai?', 'Agar kal duniya khatam ho to aaj kya karoge?']
const DARE = ['Group mein apni ek funny selfie bhejo 🤳', 'Agle 3 messages sirf emojis mein likho', 'Kisi dost ko "I miss you yaar" bhejo 😂', 'Apni awaz mein ek line ka gaana voice note mein bhejo 🎤', '10 push-ups karo aur batao ✅', 'Apna status 1 ghante ke liye "Main pagal hoon 🤪" lagao', 'Aakhri chat ka screenshot bhejo (personal hata kar)', 'Kisi ko apni sab se purani photo bhejo', 'Ulta (reverse) likh kar apna naam bhejo', '1 minute tak ek taang pe khare raho 🦩', 'Group mein kisi ki 3 tareefein karo', 'Apna DP 30 min ke liye cartoon laga do', 'Ammi/Abbu ko "Love you" bolo aur reaction batao ❤️', 'Apne phone ka battery % batao aur screenshot bhejo 🔋', 'Kisi ko voice note mein "Assalam o Alaikum janab" bolo bhaari awaz mein']
const WYR = [['Hamesha sach bolna parhe', 'Hamesha jhoot sunna parhe'], ['Udd sako', 'Invisible ho sako'], ['10 saal aage jao', '10 saal peeche'], ['Kabhi mobile na milay', 'Kabhi internet na milay'], ['Ameer magar akele', 'Ghareeb magar dosto ke sath'], ['Biryani kabhi na khao', 'Pizza kabhi na khao'], ['Har jagah 10 min late', 'Har jagah 20 min pehle'], ['Janwaron se baat kar sako', 'Har zaban bol sako'], ['Garmi mein bina AC', 'Sardi mein bina geezer'], ['Hamesha gaana gaate raho', 'Hamesha naachte raho'], ['Famous ho jao', 'Ameer ho jao'], ['Kabhi so na sako', 'Kabhi kha na sako'], ['Cricket world cup jeeto', 'Lottery jeeto'], ['Sirf chai piyo', 'Sirf coffee piyo']]
const BALL = ['Haan, bilkul ✅', 'Pakka 💯', 'Bina shak ke haan', 'Lagta hai haan 🙂', 'Haan, InshaAllah 🤲', 'Abhi kehna mushkil hai 🤔', 'Baad mein poochna ⏳', 'Mat poocho 😶', 'Nahi lagta ❌', 'Bilkul nahi 🙅', 'Mera jawab nahi hai', 'Chances kam hain 😬', 'Shayad... 🎲', 'Dil kehta hai haan ❤️', 'Dimagh kehta hai nahi 🧠']
const PICKUP = ['Kya tum WiFi ho? Kyunki mujhe connection mehsoos ho raha hai 📶', 'Tumhari muskurahat itni pyari hai ke Google bhi search karta hai 😊', 'Tum chai ho kya? Kyunki tumhare bina subah adhoori hai ☕', 'Kya tumhare paas map hai? Main tumhari aankhon mein kho gaya 🗺️', 'Tum Ludo ki 6 ho — har koi tumhe chahta hai 🎲', 'Mere dil ka password tum ho 🔐', 'Tum battery ho kya? Tumhe dekh kar charge ho jata hoon 🔋']
const COMPLIMENT = ['Tum bohat achay insaan ho ❤️', 'Tumhari baatein dil khush kar deti hain 😊', 'Tum jaise dost naseeb walon ko milte hain 🤝', 'Tumhari smile kamaal hai ✨', 'Tum mehnati aur samajhdar ho 💪', 'Tum har group ki jaan ho 🎉', 'Tumhari soch bohat achi hai 🧠', 'Tum bohat honest ho, ye rare hai 💎']
const ROAST = ['Tumhara WiFi tumse zyada fast hai 😂', 'Tum itne slow ho ke snail bhi overtake kar le 🐌', 'Tumhari selfie dekh ke camera ne bhi kaha "phir se lo" 📸', 'Tum group ke "seen" specialist ho 👀', 'Tumhara dimagh 2G pe chalta hai 📶', 'Tum alarm ke 10 snooze wale insaan ho ⏰', 'Tum itne lazy ho ke sapne bhi copy-paste karte ho 😴']
const FORTUNE = ['Aaj tumhe ek achi khabar milegi 📩', 'Mehnat ka phal jald milega 🍎', 'Koi purana dost yaad karega 📞', 'Paisa aane wala hai InshaAllah 💰', 'Aaj kisi ki madad karo, barkat hogi 🤲', 'Naya mauqa darwaze pe hai 🚪', 'Sabr karo, waqt badlega ⏳', 'Aaj ka din tumhara hai 🌟']
const NHIE = ['Never have I ever: class mein so gaya 😴', 'Never have I ever: kisi ka message galti se forward kiya', 'Never have I ever: phone toilet mein giraya 📱', 'Never have I ever: kisi ko block kiya aur phir unblock', 'Never have I ever: Ammi se chhup ke pizza khaya 🍕', 'Never have I ever: poori raat jaag ke series dekhi 📺', 'Never have I ever: galat bande ko "I love you" bhej diya 😳']
const TOT = [['Chai ☕', 'Coffee ☕'], ['Biryani 🍛', 'Karahi 🍲'], ['Cricket 🏏', 'Football ⚽'], ['Subah 🌅', 'Raat 🌙'], ['Garmi ☀️', 'Sardi ❄️'], ['Android 🤖', 'iPhone 🍎'], ['PUBG 🎯', 'Free Fire 🔥'], ['Pahar ⛰️', 'Samandar 🌊'], ['Dost 🤝', 'Paisa 💰']]

export default [
  { name: 'truth', category: 'games', desc: 'Truth sawal', async run (ctx) { await ctx.reply(`🤔 *TRUTH*\n\n${pick(TRUTH)}`) } },
  { name: 'dare', category: 'games', desc: 'Dare challenge', async run (ctx) { await ctx.reply(`😈 *DARE*\n\n${pick(DARE)}`) } },
  { name: 'tod', alias: ['truthordare'], category: 'games', desc: 'Truth ya dare (bot khud chunega)', async run (ctx) { const t = r(2); await ctx.reply(t ? `🤔 *TRUTH*\n\n${pick(TRUTH)}` : `😈 *DARE*\n\n${pick(DARE)}`) } },
  { name: 'wyr', alias: ['wouldyourather'], category: 'games', desc: 'Would you rather (kya pasand karoge)', async run (ctx) { const [x, y] = pick(WYR); await ctx.reply(`🤷 *Kya pasand karoge?*\n\n🅰️ ${x}\n      ya\n🅱️ ${y}\n\nA ya B likho!`) } },
  { name: 'thisorthat', alias: ['tot'], category: 'games', desc: 'This or that', async run (ctx) { const [x, y] = pick(TOT); await ctx.reply(`⚖️ *${x}*  ya  *${y}*?`) } },
  { name: 'nhie', alias: ['neverhaveiever'], category: 'games', desc: 'Never have I ever', async run (ctx) { await ctx.reply('🙊 ' + pick(NHIE)) } },
  { name: '8ball', alias: ['magic8', 'ask8'], category: 'games', usage: '<sawal>', desc: 'Magic 8-ball se poocho', async run (ctx) { if (!ctx.text) return ctx.reply(`🎱 Use: ${ctx.prefix}8ball Kya main pass hounga?`); await ctx.reply(`🎱 *Sawal:* ${ctx.text}\n*Jawab:* ${pick(BALL)}`) } },
  { name: 'rating', alias: ['rateme', 'rateit'], category: 'games', usage: '<cheez / @user>', desc: '10 mein se rating', async run (ctx) { const p = r(11); await send(ctx, `⭐ ${who(ctx)}: *${p}/10*\n${'⭐'.repeat(p) || '😬'}`) } },
  { name: 'ship', alias: ['match'], category: 'games', usage: '<naam1> <naam2> / @a @b', desc: 'Do logon ki jodi % ❤️', async run (ctx) {
    const m = ctx.mentioned || []; let a, b
    if (m.length >= 2) { a = '@' + m[0].split('@')[0]; b = '@' + m[1].split('@')[0] } else if (m.length === 1) { a = ctx.pushName || 'Tum'; b = '@' + m[0].split('@')[0] } else { [a, b] = ctx.text.split(/\s*(?:\+|&|and|aur|x|\s)\s*/i).filter(Boolean) }
    if (!a || !b) return ctx.reply(`💞 Use: ${ctx.prefix}ship Ali Sara  ya  ${ctx.prefix}ship @a @b`)
    const key = [a, b].map(s => s.toLowerCase()).sort().join('|'); const p = parseInt(crypto.createHash('md5').update(key).digest('hex').slice(0, 4), 16) % 101
    const v = p > 85 ? 'Made for each other 💍' : p > 60 ? 'Achi jodi 💕' : p > 35 ? 'Dosti behtar hai 🤝' : 'Mushkil hai bhai 😅'
    await send(ctx, `💞 *SHIP*\n${a} ❤️ ${b}\n\n${bar(p)} *${p}%*\n${v}`)
  } },
  { name: 'lovecalc', alias: ['lovetest', 'lovemeter'], category: 'games', usage: '<naam1> <naam2>', desc: 'Love calculator', async run (ctx) {
    const [a, b] = ctx.text.split(/\s+/); if (!a || !b) return ctx.reply(`❤️ Use: ${ctx.prefix}lovecalc Ali Sara`)
    const p = parseInt(crypto.createHash('sha1').update([a, b].map(s => s.toLowerCase()).sort().join('+') + 'love').digest('hex').slice(0, 4), 16) % 101
    await ctx.reply(`❤️ *LOVE METER*\n${a} + ${b}\n\n${bar(p)} *${p}%*`)
  } },
  { name: 'rps', alias: ['rockpaperscissors'], category: 'games', usage: 'rock/paper/scissors', desc: 'Rock paper scissors bot ke sath', async run (ctx) {
    const M = { rock: '🪨', paper: '📄', scissors: '✂️' }; const alias = { r: 'rock', p: 'paper', s: 'scissors', patthar: 'rock', kaghaz: 'paper', qainchi: 'scissors', stone: 'rock', scissor: 'scissors' }
    let me = (ctx.args[0] || '').toLowerCase(); me = alias[me] || me
    if (!M[me]) return ctx.reply(`✊ Use: ${ctx.prefix}rps rock / paper / scissors`)
    const bot = pick(Object.keys(M)); const win = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
    const res = me === bot ? 'Barabar! 🤝' : win[me] === bot ? 'Tum jeet gaye! 🎉' : 'Bot jeet gaya! 🤖'
    await ctx.reply(`Tum: ${M[me]}  vs  Bot: ${M[bot]}\n\n*${res}*`)
  } },
  { name: 'slot', alias: ['slots', 'jackpot'], category: 'games', desc: 'Slot machine 🎰', async run (ctx) {
    const S = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎', '7️⃣']; const x = [pick(S), pick(S), pick(S)]
    const res = x[0] === x[1] && x[1] === x[2] ? '💰 JACKPOT! 💰' : (x[0] === x[1] || x[1] === x[2] || x[0] === x[2]) ? 'Do milay! Thora sa jeet 🙂' : 'Haar gaye 😢 phir try karo'
    await ctx.reply(`🎰 | ${x.join(' | ')} |\n\n*${res}*`)
  } },
  { name: 'choose', alias: ['pick', 'chuno'], category: 'games', usage: 'a, b, c', desc: 'Bot tumhare liye chunega', async run (ctx) { const o = ctx.text.split(/\s*(?:,|\||\bya\b|\bor\b)\s*/i).filter(Boolean); if (o.length < 2) return ctx.reply(`🤔 Use: ${ctx.prefix}choose biryani, pizza, burger`); await ctx.reply(`🤔 Main kehta hoon: *${pick(o)}*`) } },
  { name: 'iq', alias: ['iqtest'], category: 'games', usage: '[@user]', desc: 'IQ check (mazak)', async run (ctx) { const p = 60 + r(101); await send(ctx, `🧠 ${who(ctx)} ka IQ: *${p}* ${p > 140 ? '(genius! 🤓)' : p > 100 ? '(smart 😎)' : '(koshish jaari rakho 😂)'}`) } },
  { name: 'luck', alias: ['lucky', 'kismat'], category: 'games', usage: '[@user]', desc: 'Aaj ki kismat %', async run (ctx) { const p = pct(); await send(ctx, `🍀 ${who(ctx)} ki aaj ki kismat\n${bar(p)} *${p}%*`) } },
  { name: 'handsome', alias: ['beauty', 'cute'], category: 'games', usage: '[@user]', desc: 'Kitne handsome / cute ho %', async run (ctx) { const p = pct(); await send(ctx, `😎 ${who(ctx)}\n${bar(p)} *${p}%* cute`) } },
  { name: 'pickup', alias: ['pickupline', 'flirt'], category: 'games', desc: 'Pickup line 😏', async run (ctx) { await ctx.reply('😏 ' + pick(PICKUP)) } },
  { name: 'compliment', alias: ['tareef', 'praise'], category: 'games', usage: '[@user]', desc: 'Tareef karo', async run (ctx) { await send(ctx, `💐 ${who(ctx)}, ${pick(COMPLIMENT)}`) } },
  { name: 'roast', category: 'games', usage: '[@user]', desc: 'Halka phulka roast 🔥', async run (ctx) { await send(ctx, `🔥 ${who(ctx)}: ${pick(ROAST)}`) } },
  { name: 'fortune', alias: ['future', 'qismat'], category: 'games', desc: 'Aaj ka fortune 🔮', async run (ctx) { await ctx.reply('🔮 ' + pick(FORTUNE)) } },
  { name: 'mathquiz', alias: ['quiz', 'math'], category: 'games', desc: 'Jaldi hisaab lagao (jawab neeche chhupa)', async run (ctx) {
    const a = 2 + r(48), b = 2 + r(48), op = pick(['+', '-', '×']); const ans = op === '+' ? a + b : op === '-' ? a - b : a * b
    await ctx.reply(`🧮 *${a} ${op} ${b} = ?*\n\nJawab:${'\n'.repeat(12)}👉 ${ans}`)
  } },
  { name: 'pickrandom', alias: ['randommember', 'someone'], category: 'games', group: true, desc: 'Group se random member chuno', async run (ctx) {
    const ps = ctx.meta?.participants || []; if (!ps.length) return ctx.reply('Group ke members nahi mile')
    const p = pick(ps); const jid = p.phoneNumber || p.id
    await ctx.sock.sendMessage(ctx.jid, { text: `🎯 Chuna gaya: @${String(jid).split('@')[0]}`, mentions: [jid] }, { quoted: ctx.msg })
  } }
]
