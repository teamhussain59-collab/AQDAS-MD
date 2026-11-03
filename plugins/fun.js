import { pick } from '../lib/utils.js'

export const QUOTES = [
  'Mehnat itni khamoshi se karo ke kamyabi shor macha de. 🔥',
  'Waqt sab ko milta hai, zindagi badalne ke liye. Lekin zindagi dobara nahi milti waqt badalne ke liye.',
  'Khwab woh nahi jo neend mein aayein, khwab woh hain jo neend na aane dein.',
  'Success is not final, failure is not fatal: it is the courage to continue that counts.',
  'Code likho, galti karo, seekho, phir se code likho. 💻',
  'Jo log tum pe hanstay hain, unhein apni kamyabi se jawab do.',
  'The best way to predict the future is to create it.',
  'Har din ek naya mauqa hai, use zaya mat karo.',
  'Sabr karo, behtareen cheezein waqt leti hain. ⏳',
  'Stay hungry, stay foolish.',
  'Apni pehchan khud banao, kisi ki copy mat bano. 😎',
  'Mushkil waqt guzar jata hai, mazboot log reh jatay hain. 💪'
]
export const JOKES = [
  'Teacher: Batao, sab se purana janwar kaunsa hai?\nStudent: Zebra.\nTeacher: Kaise?\nStudent: Kyun ke woh black & white hai! 😂',
  'Wife: Suniye, main moti lag rahi hoon?\nHusband: Nahi jaan...\nWife: Pakka?\nHusband: Haan, mujhe abhi zinda rehna hai. 😅',
  'Programmer ki bivi: Market se 1 doodh le aao, agar anday milein to 6 le aana.\nWoh 6 doodh le aaya. 🥛😂',
  'Why do programmers prefer dark mode? Because light attracts bugs! 🐛',
  'Doctor: Aap ko araam ki zaroorat hai.\nPatient: Doctor sahab, meri zaban dekhiye.\nDoctor: Is ko bhi araam ki zaroorat hai! 🤐',
  'Pappu: Sir, main kal school nahi aaunga.\nSir: Kyun?\nPappu: Kal Sunday hai! 😂',
  'WiFi password poocha to dost ne kaha: "pehle chai pilao." Ab WiFi bhi rishwat leta hai. ☕',
  'I told my computer I needed a break, and it said: "No problem, I will go to sleep." 💤',
  'Ammi: Beta, phone chhor ke parhai karo.\nBeta: Ammi, Google pe hi to parh raha hoon.\nAmmi: Pehle Google ko bhi chhoro! 😂',
  'There are 10 types of people: those who understand binary and those who do not. 🤓'
]

export default [
  { name: 'quote', alias: ['qoute', 'motivation'], category: 'fun', desc: 'Motivational quote (Roman Urdu)', async run (ctx) { await ctx.reply(`💭 _${pick(QUOTES)}_\n\n— AQDAS MD`) } },
  { name: 'joke', alias: ['mazak'], category: 'fun', desc: 'Joke suno (Roman Urdu)', async run (ctx) { await ctx.reply(`😂 ${pick(JOKES)}`) } },
  {
    name: 'dice', alias: ['roll'], category: 'fun', desc: 'Dice ghumao 🎲',
    async run (ctx) { await ctx.reply(`🎲 Dice: *${1 + Math.floor(Math.random() * 6)}*`) }
  },
  {
    name: 'flip', alias: ['toss'], category: 'fun', desc: 'Sikka uchhalo',
    async run (ctx) { await ctx.reply(`🪙 ${Math.random() < 0.5 ? 'Head' : 'Tail'}!`) }
  }
]
