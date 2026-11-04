# ⚡ AQDAS MD — WhatsApp Bot (by AQDAS HACKER)

Multi-device WhatsApp bot. **Pairing code** se link hota hai (QR nahi), real time chalta hai, auto-react, sticker, AI, download, group tools, web pairing page — sab kuch.

> ⚠️ **Zaroori:** Ye unofficial library (Baileys) hai. WhatsApp kabhi bhi number **ban** kar sakta hai. Hamesha **alag / spare number** pe chalao, apna main number nahi. Spam mat karo.

---

## 📦 Kya kya hai (features)
- 🔑 Pairing code login (8 digit code), session `session/` folder mein save, auto-reconnect, saaf logs
- 🌐 Web pairing page (server ke liye): password daalo → number daalo → code aata hai → status "CONNECTED"
- 🖼️ Bot ka DP (`media/dp.jpg`) — pehli dafa connect pe khud lag jata hai · 🎵 30 sec ka original theme song (`media/song.mp3`) `.menu` ke sath
- ❤️ Auto-react (emoji list badal saktay ho), 👀 auto status view, 💚 auto status react, ✔️ auto read, 🟢 always online, ⌨️ typing
- 🖼️ Sticker maker (photo/video → sticker, sticker → photo, pack name)
- 🤖 AI chat (`.ai`) — OpenRouter (apni key `.env` mein)
- 📥 YouTube / TikTok / Instagram / Facebook song-video download (yt-dlp)
- 🛠️ Real free APIs: mosam, lyrics, wikipedia, translate, dictionary, currency, github, image search, namaz timings, country info, short link, QR, meme, joke, quote, fact, TTS (awaz)
- 👥 Group: tagall, hidetag, welcome/goodbye, antilink (warn/kick), kick/promote/demote, group info, open/close, link
- 🧩 Plugins: `plugins/` folder mein nayi `.js` file daalo = nayi command

---

## 🐙 1) GitHub Actions (tumhari pehli choice)
> ⚠️ **Sach baat:** GitHub ki terms Actions ko 24/7 bot hosting ke liye allow **nahi** karti — **GitHub account suspend ho sakta hai**. Har run max 6 ghante (yahan ~5h50m), har 6 ghante naya run, beech mein thori dair bot off. Scheduled workflow kabhi kabhi late chalta hai, aur repo pe 60 din koi activity na ho to GitHub schedule band kar deta hai. Lambay arsay ke liye Render/Koyeb/VPS behtar hai. Apna **spare** GitHub account aur **spare** WhatsApp number use karo.

**Step 1 — Repo banao**
1. github.com → **New repository** → naam `AQDAS-MD` → **Public** → Create (public repo pe Actions free/unlimited; private pe sirf 2000 min/mahina, 24/7 bot 1.5 din mein khatam. Code mein koi secret nahi, secrets GitHub Secrets mein safe rehte hain aur log mein print nahi hote)
2. **"uploading an existing file"** → zip ke **andar wali sab files/folders** drag karo (`.github` folder bhi — agar upload mein na aaye to step 1b) → **Commit**
   - 1b: repo mein **Add file → Create new file** → naam likho `.github/workflows/run-bot.yml` → zip wali `run-bot.yml` ka sara text paste → Commit

**Step 2 — Secrets daalo** (repo → **Settings → Secrets and variables → Actions → New repository secret**)
- `OWNER_NUMBER` = tumhara number, jaise `923001234567`
- `PAIR_NUMBER` = **bot wala** spare number (sirf pehli pairing ke liye)
- `OPENROUTER_API_KEY` = apni OpenRouter key (AI ke liye, optional)
- `SESSION_B64` = abhi mat banao (Step 4 mein)

**Step 3 — Pehli pairing (ek dafa)** — 2 tareeqay:
- **A) Actions log se:** repo → **Actions** tab → "I understand… enable" → **AQDAS MD Bot → Run workflow** → run kholo → "Run AQDAS MD" step kholo → log mein `🔑 PAIRING CODE: XXXX-XXXX` aayega → foran (2 min ke andar) bot wale phone pe **WhatsApp → Linked devices → Link a device → Link with phone number instead** → code likho. Code expire ho jaye to log mein naya code khud aa jata hai (5 dafa tak).
- **B) Termux / Posit Cloud mein** ek dafa `node index.js` chala ke pair karo (neeche steps).

**Step 4 — Session save karo:** connect hote hi bot **apni hi chat** ("Message yourself", bot wale phone pe) mein ek lamba text bhejta hai `AQDAS-MD~....` — yahi SESSION_ID hai (baad mein bhi `.session` likh ke mil jata hai). Isay copy karke secret **`SESSION_B64`** banao. Phir `PAIR_NUMBER` secret **delete** kar do.

**Step 5 — Chalao:** Actions → **Run workflow** dabao. Ab har 6 ghante khud restart hoga (cron). Rokna ho to Actions → workflow → **⋯ → Disable workflow**.
- Agar log mein "Logged out" aaye → phone se device hat gaya: `SESSION_B64` delete karo, `PAIR_NUMBER` dobara daalo, Step 3 se.
- Note: Actions pe `.autoreact` jaisi ON/OFF settings har naye run pe default ho jati hain (disk save nahi hoti). Pakki setting chahiye to `run-bot.yml` ke `env:` mein likho, jaise `AUTO_STATUS_REACT: 'true'`.
- Note: har run purane SESSION_ID se start hota hai; aam tor pe theek chalta hai. Kabhi connect masla aaye to dobara pair karke naya SESSION_B64 daal do.

## 📱 2) Termux (Android)
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git ffmpeg python
pip install yt-dlp
# zip ko phone mein unzip karo (ya GitHub se clone), phir:
cd AQDAS-MD
cp .env.example .env
nano .env        # OWNER_NUMBER mein apna number (92300...), WEB=false likho, save: CTRL+X, Y, Enter
npm install
node index.js
```
- Number poochega → **bot wala** number likho country code ke sath, jaise `923001234567` (+ ya 0 nahi)
- Screen pe **PAIRING CODE** aayega, jaise `ABCD-1234`
- Bot wale phone pe: **WhatsApp → ⋮ → Linked devices → Link a device → "Link with phone number instead"** → code likho
- "CONNECTED ✅" aa jaye to bot ready. Bot ke number pe `.menu` likho.
- Termux band ho to bot band. Background ke liye: `termux-wake-lock` chalao, aur battery optimization se Termux hata do.
- Zip ka rasta: agar zip Download mein hai: `termux-setup-storage` phir `cp ~/storage/downloads/AQDAS_MD_bot.zip ~ && cd ~ && unzip AQDAS_MD_bot.zip`

## ☁️ 3) Render.com (free, GitHub se) — 24/7 ke liye behtar
1. **GitHub** pe naya repo banao (Private behtar) → "uploading an existing file" → zip ke **andar wali sab files** upload karo (`node_modules` nahi, `.env` nahi)
2. **render.com** pe GitHub se login → **New → Blueprint** → apna repo chuno (ye `render.yaml` khud parh lega)
   (ya **New → Web Service** → repo → Runtime: **Docker** → Instance: **Free**)
3. Environment variables daalo:
   - `ADMIN_PASSWORD` = koi mazboot password (web page ke liye)
   - `OWNER_NUMBER` = tumhara number, jaise `923001234567`
   - `OPENROUTER_API_KEY` = apni OpenRouter key (AI ke liye)
   - `SESSION_ID` = abhi khali
4. **Deploy** → jo link mile (jaise `https://aqdas-md.onrender.com`) usay kholo
5. Password daalo → bot wala number daalo → **Get Pairing Code** → phone pe WhatsApp → Linked devices → Link with phone number → code likho
6. CONNECTED ✅ ke baad page pe **Show SESSION_ID** dabao (ya bot pe `.session` likho) → woh lamba text copy karke Render ke `SESSION_ID` env mein paste karo → Save. Ab restart/redeploy pe dobara pair nahi karna padega.

⚠️ Render free ke sach: 15 min koi visit na ho to service so jati hai. Bot khud apne `/health` ko har 10 min ping karta hai (`RENDER_EXTERNAL_URL` se) taa ke jagta rahe; phir bhi behtar hai **cron-job.org / UptimeRobot** pe `https://TUMHARA-LINK/health` har 5 min ka monitor laga do. Free disk save nahi hoti, isi liye `SESSION_ID` zaroori hai. Agar SESSION_ID ke baad bhi connect na ho to page se dobara pair kar lo.

## ☁️ 4) Koyeb (free)
- koyeb.com → **Create Web Service → GitHub** → repo → Builder: **Dockerfile** → Instance: Free
- Env vars wohi jo Render mein (ADMIN_PASSWORD, OWNER_NUMBER, OPENROUTER_API_KEY, SESSION_ID) + `KEEP_ALIVE_URL` = Koyeb ka public link
- Port: Koyeb jo `PORT` de bot wahi use karta hai (agar poochay to 8000 ya 3000 — dono chalengay, PORT env se)
- Deploy → link kholo → web page se pair karo (Render ke step 5–6 ki tarah)

## 🖥️ 5) VPS (Ubuntu)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg git python3-pip unzip
sudo pip3 install -U yt-dlp   # (naye Ubuntu pe: sudo pip3 install -U yt-dlp --break-system-packages)
# zip upload (scp) karke: unzip AQDAS_MD_bot.zip  ||  ya git clone <tumhara-repo>
cd AQDAS-MD
cp .env.example .env && nano .env     # ADMIN_PASSWORD, OWNER_NUMBER, OPENROUTER_API_KEY, WEB=true, PORT=3000
npm install
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # jo command de woh copy-paste karke chalao
```
Phir browser mein `http://VPS-IP:3000` kholo → web page se pair karo. Logs: `pm2 logs aqdas-md`. (Firewall mein port 3000 kholna ho to: `sudo ufw allow 3000`)

## 🧪 6) Posit Cloud (posit.cloud) — sirf testing / pairing ke liye
Posit Cloud ka **Terminal** tab kholo (pehli pairing / SESSION_ID nikalne ke liye best):
```bash
node -v || echo "node nahi hai"
# agar node nahi ya purana (20 se kam) hai:
cd ~ && curl -fsSLO https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz
tar -xf node-v20.18.1-linux-x64.tar.xz && export PATH=$HOME/node-v20.18.1-linux-x64/bin:$PATH
echo 'export PATH=$HOME/node-v20.18.1-linux-x64/bin:$PATH' >> ~/.bashrc
# zip ko Files panel se upload karo, phir:
unzip AQDAS_MD_bot.zip && cd AQDAS-MD
cp .env.example .env && sed -i 's/^WEB=true/WEB=false/' .env
npm install
node index.js      # number likho -> pairing code -> phone pe link
```
⚠️ Sach: Posit Cloud free mein project **idle / tab band** hone pe so jata hai aur mahine ke ghante limited hain — ye **24/7 nahi** chalega. ffmpeg na ho to sticker nahi banega. Wahan pair karke `.session` se SESSION_ID le lo aur bot Render/Koyeb/VPS pe chalao.

## ❌ Vercel / Netlify
Ye "serverless" hain — WhatsApp bot ko hamesha khula connection chahiye, wahan **nahi chalega**. Render/Koyeb/VPS use karo.

---

## 🔧 .env settings
| Key | Kya hai |
|---|---|
| `OWNER_NUMBER` | Owner ka number (comma se zyada bhi: `92300...,92311...`). Bot ka apna number bhi owner hai |
| `PREFIX` | Command ka nishan, default `.` |
| `MODE` | `public` (sab) / `private` (sirf owner) |
| `PAIR_NUMBER` | Bot wala number (diya ho to start pe khud code print) |
| `WEB`, `PORT`, `ADMIN_PASSWORD` | Web pairing page. Default password `change-me-123` web pe **nahi chalega**, apna rakho |
| `SESSION_ID` | Free host ke liye session backup (`.session` se milta hai). **Kisi ko mat dena** |
| `OPENROUTER_API_KEY` (ya `OPENROUTER_KEY`) | AI ke liye apni key (openrouter.ai/keys). Bot mein koi key pehle se nahi |
| `OPENROUTER_MODEL` | Model id, default `openai/gpt-4o-mini` (openrouter.ai/models se koi bhi) |
| `AUTO_REACT`, `AUTO_REACT_EMOJIS`, `AUTO_REACT_SCOPE` | Auto-react default (all / private / group) |
| `AUTO_READ`, `AUTO_STATUS_VIEW`, `AUTO_STATUS_REACT`, `STATUS_REACT_EMOJIS`, `ALWAYS_ONLINE`, `AUTO_TYPING` | Baqi auto features ka default |
| `SET_DP_ON_FIRST_CONNECT` | Pehli dafa bot ka DP khud lagao (true) |
| `MENU_SONG` | `.menu` ke sath song (true) |

Owner chat mein in sab ko commands se bhi ON/OFF kar saktay ho (neeche dekho) — woh `data/settings.json` mein save rehti hain.

---

## 📜 Sab commands (74)

### 🏠 Main
- `.menu` — Sab commands ki list (alias: .help, .list, .allmenu, .cmd)
- `.ping` — Bot ki speed check (alias: .speed)
- `.alive` — Bot zinda hai? (DP + info)
- `.uptime` — Bot kab se chal raha hai (alias: .runtime)
- `.owner` — Owner ka contact (alias: .creator)
- `.song` — AQDAS MD ka theme song (30 sec) (alias: .bgm, .theme)

### 🤖 AI
- `.ai <sawal>` — AI se kuch bhi poocho (OpenRouter) (alias: .gpt, .ask, .bot)
- `.aireset` — AI ki chat memory saaf karo

### 📥 Download
- `.play <song ka naam ya link>` — YouTube se song (mp3) (alias: .song, .music)
- `.video <naam ya link>` — YouTube se video (alias: .ytv, .vid)
- `.ytmp3 <youtube link>` — YouTube link se mp3 (alias: .yta)
- `.ytmp4 <youtube link>` — YouTube link se mp4
- `.tiktok <tiktok link>` — TikTok video download (alias: .tt, .tiktokdl)
- `.insta <instagram link>` — Instagram reel/video download (alias: .ig, .instagram, .reel)
- `.fb <facebook link>` — Facebook video download (alias: .facebook)
- `.tiktokmp3 <tiktok link>` — TikTok ka sound (mp3) (alias: .ttmp3)

### 🖼️ Sticker
- `.sticker (photo/video pe reply)` — Photo ya video (6 sec) se sticker (alias: .s, .stiker)
- `.take pack|author` — Sticker ka pack naam badlo (alias: .steal, .wm)
- `.toimg (sticker pe reply)` — Sticker ko photo banao (alias: .toimage, .photo)

### 🛠️ Tools (real free APIs)
- `.weather <city>` — Mosam ka haal (wttr.in) (alias: .mosam, .wether)
- `.lyrics <artist - song>` — Song ke lyrics (lrclib) (alias: .lyric)
- `.wiki <topic>` — Wikipedia summary (.wiki ur <topic> Urdu) (alias: .wikipedia)
- `.translate <lang> <text>` — Translate (en, ur, ar, hi...) (alias: .tr, .tarjuma)
- `.define <english word>` — English dictionary (alias: .dict, .meaning)
- `.currency <amount> <from> <to>` — Currency rate (100 usd pkr) (alias: .convert, .rate)
- `.github <username>` — GitHub profile info (alias: .gh, .gitstalk)
- `.img <search>` — Image search (Openverse/Wikimedia) (alias: .image, .pic)
- `.namaz <city>` — Namaz timings (Pakistan default) (alias: .prayer, .salah)
- `.country <country>` — Country info (alias: .mulk)
- `.short <link>` — Link chhota karo (alias: .shorturl, .tinyurl)
- `.qr <text/link>` — QR code banao (alias: .qrcode)
- `.tts [ur/en] <text>` — Text ko awaz (voice note) mein badlo (alias: .say, .bol)
- `.jid` — Is chat ki ID
- `.calc <2+2*5>` — Calculator (alias: .calculate)

### 😂 Fun
- `.jokeapi` — English joke (live API) (alias: .ejoke)
- `.zenquote` — Famous quote (live API) (alias: .iquote)
- `.fact` — Random fact (alias: .facts)
- `.meme` — Random meme
- `.quote` — Motivational quote (Roman Urdu) (alias: .qoute, .motivation)
- `.joke` — Joke suno (Roman Urdu) (alias: .mazak)
- `.dice` — Dice ghumao 🎲 (alias: .roll)
- `.flip` — Sikka uchhalo (alias: .toss)

### 👥 Group (admin)
- `.tagall [msg]` — Sab members ko tag karo (alias: .everyone, .all)
- `.hidetag <msg>` — Chupke se sab ko tag (sirf message dikhega) (alias: .htag)
- `.kick @user` — Member ko Remove kar diya (admin only) (alias: .remove)
- `.promote @user` — Member ko Admin bana diya (admin only)
- `.demote @user` — Member ko Admin se hata diya (admin only)
- `.groupinfo` — Group ki info (alias: .ginfo, .gcinfo)
- `.close` — Group band (sirf admin message karein) (alias: .mute, .lock)
- `.open` — Group khol do (sab message karein) (alias: .unmute, .unlock)
- `.link` — Group ka invite link (alias: .grouplink, .invite)
- `.welcome on/off` — Naye member ko welcome message
- `.goodbye on/off` — Member jaye to goodbye message (alias: .bye)
- `.setwelcome <text>` — Apna welcome text (@user @group @count @desc)
- `.setgoodbye <text>` — Apna goodbye text (@user @group)
- `.antilink warn/kick/off` — Link bhejne walon ko warning (3 pe kick) ya seedha kick

### ⚙️ Auto ON/OFF (owner)
- `.autoreact on/off` — Auto React ON/OFF (alias: .areact)
- `.autoread on/off` — Auto Read (blue tick) ON/OFF
- `.autostatus on/off` — Auto Status View ON/OFF (alias: .statusview, .autoview)
- `.statusreact on/off` — Auto Status React ON/OFF (alias: .autostatusreact, .autoreactstatus)
- `.alwaysonline on/off` — Always Online ON/OFF (alias: .online)
- `.autotyping on/off` — Typing... dikhana (commands pe) ON/OFF (alias: .typing)
- `.menusong on/off` — Menu ke sath song ON/OFF
- `.setemoji ❤️,🔥,😂` — Auto-react ke emojis set karo (alias: .reactemoji)
- `.statusemoji 💚,🔥` — Status react ke emojis
- `.reactscope all/private/group` — Auto-react kahan: sab, sirf inbox, sirf groups

### 👑 Owner
- `.mode public/private` — Public = sab use karein, Private = sirf owner
- `.setprefix <symbol>` — Prefix badlo (jaise . ! #)
- `.settings` — Sab ON/OFF settings dekho (alias: .status, .config)
- `.setdp (photo pe reply) / reset` — Bot ka DP + menu photo badlo (alias: .setpp)
- `.setsong (audio pe reply) / naam / link / reset` — Menu ka song badlo (pehle 30 sec) (alias: .setmenusong)
- `.session` — SESSION_ID (free host ke liye) apni chat mein (alias: .sessionid)
- `.restart` — Bot restart
- `.reload` — Naye plugins load karo (restart ke baghair)

**Welcome text mein:** `@user` `@group` `@count` `@desc` likh saktay ho.
**Menu song apna lagana:** kisi audio/voice note pe reply karo `.setsong` (ya `.setsong song ka naam` / YouTube link) → pehle 30 sec save. Original wapas: `.setsong reset`.
**DP badalna:** kisi photo pe reply `.setdp` · original: `.setdp reset`.

---

## 🧩 Nayi command banana (plugin)
`plugins/meri.js` file banao:
```js
export default {
  name: 'hello', alias: ['hi'], category: 'fun', desc: 'Salam karo',
  async run (ctx) { await ctx.reply(`Wa alaikum salam ${ctx.pushName} 👋`) }
}
```
Owner `.reload` likhe ya bot restart karo. `ctx` mein: `reply, react, text, args, sender, isGroup, isAdmin, isBotAdmin, owner, quoted, download(), sock, settings`. Options: `owner: true`, `group: true`, `admin: true`, `botAdmin: true`.

---

## 🛡️ Ye bot kya NAHI karta (jaan boojh kar)
- Kisi ki jasoosi, doosron ki chats/messages chhupke se save karna (anti-delete capture), location/data churana — **nahi**
- Ban/crash/bug/lag message, virus, "wiper", kisi ka account hack/takeover — **nahi**
- Bulk spam / broadcast — **nahi** (is se number jaldi ban hota hai)
- Bot sirf apne number ki chats mein aanay walay messages pe kaam karta hai. Koi chhupa hua data bahar nahi bhejta. AI sirf tab chalti hai jab koi `.ai` likhe (woh text OpenRouter jata hai).

## ❓ Masle (troubleshooting)
- **Code nahi aaya / "Number ghalat"** → number country code ke sath, + aur 0 ke baghair: `923001234567`
- **Code expire** → ~2 minute mein link karo, warna naya code lo
- **"Logged out"** → phone se device hat gaya; `session` folder delete karke dobara pair karo
- **Download fail on server** → YouTube aksar server (datacenter) IPs ko block karta hai; Termux/ghar ke internet pe chalta hai. `pip install -U yt-dlp` se update rakho
- **Sticker nahi bana** → `ffmpeg` install karo (`pkg install ffmpeg`)
- **AI error** → `.env` mein `OPENROUTER_API_KEY` sahi daalo, OpenRouter account mein credit/free model check karo
- Test: `npm test` (mock tests) · `node test/live_api.js` (APIs live check)

---
Made with ⚡ by **AQDAS HACKER** · AQDAS MD v1.0 · Baileys 7.0.0-rc14


## 🌐 GitHub web page + Multi-number panel (GitHub Actions)

- Web page: https://teamhussain59-collab.github.io/AQDAS-MD/ — main bot ka live pairing code + "Open AQDAS MD Panel" button.
- Panel (cloudflared link, har run pe naya): koi bhi apna number daale → pairing code → bot uske number pe chalne lagta hai.
- Max numbers: unlimited — koi slot ginti nahi. Nayi pairing sirf tab mana hoti hai jab runner pe khali RAM `MIN_FREE_MB` (default 700 MB) se kam ho ya Node heap `MAX_HEAP_PCT` (default 85%) se upar; owner page pe RAM aur "kitne aur numbers ki jagah" dikhta hai. (`MAX_SESSIONS` ab istemal nahi hota.) Har code pe 1 minute ka countdown, phir "Naya code lo". WhatsApp khud limit lagaye (429) to page batata hai.
- QR se link (hidden fallback): panel link ke aage `?qr=1`.
- Admin: panel link ke aage `/admin` (password = `ADMIN_PASSWORD` secret).
- Sessions encrypted (AES-256-GCM, `SESSION_KEY` secret) ho ke `sessions` branch pe save hote hain; har 6h run ke baad khud wapis.
- Logout: WhatsApp > Linked devices > Log out → bot hat jata hai, data delete.
- Baileys fix: `scripts/patch-baileys.mjs` (npm install ke baad) — WhatsApp ki July 2026 pairing tabdeeli (Baileys PR #2765/#2872/#2602).
