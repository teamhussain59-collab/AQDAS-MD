// API commands: free, bina key wali public APIs (random / info / animals / islamic / anime images)
import { getJSON, getText, getBuffer, ApiDown } from '../lib/http.js'
import { run, tmpFile, rm } from '../lib/utils.js'
import config from '../config.js'
import fs from 'fs'

const e = encodeURIComponent
const rnd = n => Math.floor(Math.random() * n)
const pick = a => a[rnd(a.length)]
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
const cut = (s, n = 700) => { s = strip(s); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const need = msg => { const err = new Error(msg); err.usage = true; throw err }
const img = (url, caption) => ({ img: url, caption })
const KITSU = { Accept: 'application/vnd.api+json' }

async function geo (city) {
  const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${e(city)}&count=1&language=en`)
  const g = j?.results?.[0]; if (!g) need(`"${city}" shehar nahi mila`)
  return g
}
const JOKE = cat => async () => { const j = await getJSON(`https://v2.jokeapi.dev/joke/${cat}?safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit`); return '😂 ' + (j.type === 'twopart' ? `${j.setup}\n\n${j.delivery}` : j.joke) }
const BREEDS = { husky: 'husky', pug: 'pug', labrador: 'labrador', beagle: 'beagle', poodle: 'poodle', bulldog: 'bulldog', chihuahua: 'chihuahua', rottweiler: 'rottweiler', shiba: 'shiba', corgi: 'corgi', dalmatian: 'dalmatian', doberman: 'doberman', retriever: 'retriever', pomeranian: 'pomeranian', boxer: 'boxer', akita: 'akita', samoyed: 'samoyed', malamute: 'malamute', pitbull: 'pitbull', germanshepherd: 'german/shepherd', shihtzu: 'shihtzu', maltese: 'maltese' }
const DUAS = [
  ['Khana khane se pehle', 'بِسْمِ اللّٰهِ وَعَلٰى بَرَكَةِ اللّٰهِ', 'Allah ke naam se aur Allah ki barkat par (Abu Dawud)'],
  ['Sone se pehle', 'اَللّٰهُمَّ بِاسْمِكَ اَمُوْتُ وَاَحْيٰى', 'Aye Allah, tere naam se marta aur jeeta hoon (Bukhari)'],
  ['Neend se uth kar', 'اَلْحَمْدُ لِلّٰهِ الَّذِىْ اَحْيَانَا بَعْدَ مَا اَمَاتَنَا وَاِلَيْهِ النُّشُوْرُ', 'Sab tareef Allah ki jis ne humein maut (neend) ke baad zinda kiya (Bukhari)'],
  ['Ghar se nikalte waqt', 'بِسْمِ اللّٰهِ تَوَكَّلْتُ عَلَى اللّٰهِ لَا حَوْلَ وَلَا قُوَّةَ اِلَّا بِاللّٰهِ', 'Allah ke naam se, Allah par bharosa, taqat sirf Allah se (Abu Dawud, Tirmidhi)'],
  ['Ilm mein izafa', 'رَّبِّ زِدْنِىْ عِلْمًا', 'Aye mere Rab, mere ilm mein izafa farma (Taha 20:114)'],
  ['Walidain ke liye', 'رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيٰنِىْ صَغِيْرًا', 'Aye Rab, un par reham farma jaise unhon ne mujhe bachpan mein pala (Bani Israel 17:24)'],
  ['Dunya aur akhirat ki bhalai', 'رَبَّنَآ اٰتِنَا فِى الدُّنْيَا حَسَنَةً وَّفِى الْاٰخِرَةِ حَسَنَةً وَّقِنَا عَذَابَ النَّارِ', 'Aye Rab, humein dunya aur akhirat mein bhalai de aur aag se bacha (Baqarah 2:201)'],
  ['Pareshani mein', 'حَسْبُنَا اللّٰهُ وَنِعْمَ الْوَكِيْلُ', 'Humein Allah kaafi hai aur woh behtareen kaarsaaz hai (Aal-e-Imran 3:173)'],
  ['Safar ki dua', 'سُبْحٰنَ الَّذِىْ سَخَّرَ لَنَا هٰذَا وَمَا كُنَّا لَهٗ مُقْرِنِيْنَ', 'Paak hai woh jis ne ise hamare taabe kiya (Zukhruf 43:13)'],
  ['Maafi ke liye', 'اَسْتَغْفِرُ اللّٰهَ رَبِّىْ مِنْ كُلِّ ذَنْبٍ وَّاَتُوْبُ اِلَيْهِ', 'Main Allah se har gunah ki maafi maangta hoon aur us ki taraf rujoo karta hoon']
]
const KALIMA = [
  ['Pehla Kalima — Tayyab', 'لَا اِلٰهَ اِلَّا اللّٰهُ مُحَمَّدٌ رَّسُوْلُ اللّٰهِ', 'Allah ke siwa koi mabood nahi, Muhammad ﷺ Allah ke Rasool hain'],
  ['Doosra Kalima — Shahadat', 'اَشْهَدُ اَنْ لَّا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ وَاَشْهَدُ اَنَّ مُحَمَّدًا عَبْدُهٗ وَرَسُوْلُهٗ', 'Main gawahi deta hoon ke Allah ke siwa koi mabood nahi, woh akela hai, us ka koi shareek nahi, aur Muhammad ﷺ us ke bande aur Rasool hain'],
  ['Teesra Kalima — Tamjeed', 'سُبْحَانَ اللّٰهِ وَالْحَمْدُ لِلّٰهِ وَلَا اِلٰهَ اِلَّا اللّٰهُ وَاللّٰهُ اَكْبَرُ وَلَا حَوْلَ وَلَا قُوَّةَ اِلَّا بِاللّٰهِ الْعَلِىِّ الْعَظِيْمِ', 'Allah paak hai, sab tareef Allah ki, Allah ke siwa koi mabood nahi, Allah sab se bara hai, taqat sirf Allah buland o azeem se hai'],
  ['Chautha Kalima — Tauheed', 'لَا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ يُحْيِىْ وَيُمِيْتُ وَهُوَ حَىٌّ لَّا يَمُوْتُ اَبَدًا اَبَدًا ذُو الْجَلَالِ وَالْاِكْرَامِ بِيَدِهِ الْخَيْرُ وَهُوَ عَلٰى كُلِّ شَىْءٍ قَدِيْرٌ', 'Allah ke siwa koi mabood nahi, woh akela hai... wohi zinda karta aur maarta hai, aur har cheez par qadir hai'],
  ['Paanchwan Kalima — Astaghfar', 'اَسْتَغْفِرُ اللّٰهَ رَبِّىْ مِنْ كُلِّ ذَنْبٍ اَذْنَبْتُهٗ عَمَدًا اَوْ خَطَاً سِرًّا اَوْ عَلَانِيَةً وَّاَتُوْبُ اِلَيْهِ مِنَ الذَّنْبِ الَّذِىْ اَعْلَمُ وَمِنَ الذَّنْبِ الَّذِىْ لَا اَعْلَمُ', 'Main apne Rab Allah se har gunah ki maafi maangta hoon jo jaan boojh kar ya bhool kar, chhup kar ya khule aam kiya'],
  ['Chhata Kalima — Radd-e-Kufr', 'اَللّٰهُمَّ اِنِّىْ اَعُوْذُ بِكَ مِنْ اَنْ اُشْرِكَ بِكَ شَيْئًا وَّاَنَا اَعْلَمُ بِهٖ وَاَسْتَغْفِرُكَ لِمَا لَا اَعْلَمُ بِهٖ', 'Aye Allah, main teri panah maangta hoon is baat se ke kisi ko tera shareek banaun jaante hue, aur maafi maangta hoon us se jo main nahi jaanta']
]
async function ayah (n) {
  const j = await getJSON(`https://api.alquran.cloud/v1/ayah/${n}/editions/quran-uthmani,ur.jalandhry,en.sahih`)
  const [ar, ur, en] = j.data
  return `📖 *${ar.surah.englishName}* (${ar.surah.number}:${ar.numberInSurah})\n\n${ar.text}\n\n🇵🇰 ${ur.text}\n\n🇬🇧 ${en.text}\n\n> AQDAS MD`
}
async function swatch (hex) {
  const out = tmpFile('jpg')
  try { await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x${hex}:s=512x512:d=1`, '-frames:v', '1', out], { timeout: 20000 }); return fs.readFileSync(out) } finally { rm(out) }
}

// name: [category, desc, usage, fn(ctx) -> string | { img, caption } | { buffer, caption }, alias]
export const API = {
  // ---------- RANDOM ----------
  advice: ['random', 'Achi naseehat (advice)', '[topic]', async ctx => { if (ctx.text) { const j = await getJSON(`https://api.adviceslip.com/advice/search/${e(ctx.text)}`); if (j?.slips?.length) return '💡 ' + pick(j.slips).advice } const j = await getJSON('https://api.adviceslip.com/advice?t=' + Date.now()); return '💡 ' + j.slip.advice }, ['naseehat']],
  catfact: ['random', 'Billi ka fact', '', async () => '🐱 ' + (await getJSON('https://catfact.ninja/fact')).fact],
  dogfact: ['random', 'Kutte ka fact', '', async () => '🐶 ' + (await getJSON('https://dogapi.dog/api/v2/facts')).data[0].attributes.body],
  uselessfact: ['random', 'Ajeeb magar sach fact', '', async () => '🤯 ' + (await getJSON('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en')).text, ['randomfact']],
  dadjoke: ['random', 'Dad joke', '', async () => '😂 ' + (await getJSON('https://icanhazdadjoke.com/')).joke],
  chuck: ['random', 'Chuck Norris joke', '', async () => '🥋 ' + (await getJSON('https://api.chucknorris.io/jokes/random')).value, ['chucknorris']],
  progjoke: ['random', 'Programming joke', '', JOKE('Programming'), ['codejoke']],
  pun: ['random', 'Pun (lafzi mazak)', '', JOKE('Pun')],
  spookyjoke: ['random', 'Spooky joke 👻', '', JOKE('Spooky')],
  kanye: ['random', 'Kanye West quote', '', async () => `🎤 "${(await getJSON('https://api.kanye.rest')).quote}"\n— Kanye West`],
  affirmation: ['random', 'Positive affirmation', '', async () => '🌟 ' + (await getJSON('https://www.affirmations.dev/')).affirmation],
  riddle: ['random', 'Paheli (jawab neeche chhupa)', '', async () => { const j = await getJSON('https://riddles-api.vercel.app/random'); return `🧩 *Paheli:* ${j.riddle}\n\nJawab:${'\n'.repeat(12)}👉 ${j.answer}` }, ['paheli']],
  trivia: ['random', 'Trivia sawal (jawab neeche)', '', async () => { const q = (await getJSON('https://opentdb.com/api.php?amount=1&type=multiple')).results[0]; const opts = [...q.incorrect_answers, q.correct_answer].map(strip).sort(); return `❓ *${strip(q.question)}*\n_${strip(q.category)}_\n\n${opts.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}\n\nJawab:${'\n'.repeat(12)}👉 ${strip(q.correct_answer)}` }],
  activity: ['random', 'Bore ho rahe ho? Kuch karne ko', '', async () => { const j = await getJSON('https://bored-api.appbrewery.com/random'); return `🎯 ${j.activity}\n_${j.type}${j.participants ? ' • ' + j.participants + ' log' : ''}_` }, ['boredom', 'karnekokuch']],
  excuse: ['random', 'Bahana (excuse) 😅', '', async () => '😅 ' + (await getJSON('https://excuser-three.vercel.app/v1/excuse'))[0].excuse],
  quote2: ['random', 'English quote', '', async () => { const j = await getJSON('https://dummyjson.com/quotes/random'); return `💬 "${j.quote}"\n— ${j.author}` }, ['englishquote']],
  todayquote: ['random', 'Aaj ka quote', '', async () => { const j = (await getJSON('https://zenquotes.io/api/today'))[0]; return `🗓️ "${j.q}"\n— ${j.a}` }, ['qotd']],
  fakeperson: ['random', 'Random fake person (naam, mulk)', '', async () => { const u = (await getJSON('https://randomuser.me/api/?inc=name,location,email,dob,picture&noinfo')).results[0]; return img(u.picture.large, `👤 ${u.name.first} ${u.name.last}\n🌍 ${u.location.city}, ${u.location.country}\n🎂 ${u.dob.age} saal\n📧 ${u.email}`) }, ['randomuser']],
  randomemoji: ['random', 'Random emoji + naam', '', async () => { const j = await getJSON('https://emojihub.yurace.pro/api/random'); return `${(j.htmlCode || []).map(c => String.fromCodePoint(parseInt(c.replace(/\D/g, '')))).join('')}  *${j.name}*\n_${j.category}_` }],
  onthisday: ['random', 'Aaj ke din tareekh mein', '', async () => { const d = new Date(); const j = await getJSON(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`); const ev = j.events.slice().sort(() => Math.random() - 0.5).slice(0, 5).sort((a, b) => a.year - b.year); return '📅 *Aaj ke din:*\n\n' + ev.map(x => `• *${x.year}:* ${cut(x.text, 200)}`).join('\n') }, ['history']],
  wikirandom: ['random', 'Random Wikipedia article', '', async () => { const j = await getJSON('https://en.wikipedia.org/api/rest_v1/page/random/summary'); return `📚 *${j.title}*\n\n${cut(j.extract, 600)}\n\n🔗 ${j.content_urls?.desktop?.page || ''}` }],
  // ---------- INFO ----------
  time: ['info', 'Kisi shehar ka waqt', '<city>', async ctx => { if (!ctx.text) need('Use: .time Lahore'); const g = await geo(ctx.text); const t = new Date().toLocaleString('en-GB', { timeZone: g.timezone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: true }); return `🕐 *${g.name}, ${g.country}*\n${t}\n🌐 ${g.timezone}` }, ['waqt', 'clock']],
  sun: ['info', 'Sunrise / sunset kisi shehar ka', '<city>', async ctx => { if (!ctx.text) need('Use: .sun Karachi'); const g = await geo(ctx.text); const j = await getJSON(`https://api.sunrise-sunset.org/json?lat=${g.latitude}&lng=${g.longitude}&formatted=0`); const f = s => new Date(s).toLocaleTimeString('en-GB', { timeZone: g.timezone, hour: '2-digit', minute: '2-digit', hour12: true }); return `🌅 *${g.name}*\nSunrise: ${f(j.results.sunrise)}\nSunset: ${f(j.results.sunset)}\nDin: ${Math.round(j.results.day_length / 360) / 10} ghante` }, ['sunrise', 'suntime']],
  iss: ['info', 'ISS space station abhi kahan hai', '', async () => { const j = await getJSON('https://api.wheretheiss.at/v1/satellites/25544'); return `🛰️ *ISS abhi yahan hai*\nLat: ${j.latitude.toFixed(2)}, Lon: ${j.longitude.toFixed(2)}\nUnchai: ${Math.round(j.altitude)} km\nRaftar: ${Math.round(j.velocity)} km/h\n🗺️ https://maps.google.com/?q=${j.latitude},${j.longitude}` }],
  astronauts: ['info', 'Abhi space mein kaun hai', '', async () => { const j = await getJSON('http://api.open-notify.org/astros.json'); return `👨‍🚀 *Abhi space mein ${j.number} log:*\n\n` + j.people.map(p => `• ${p.name} (${p.craft})`).join('\n') }, ['spacepeople']],
  university: ['info', 'University dhoondo', '<naam>', async ctx => { if (!ctx.text) need('Use: .university Lahore'); const j = await getJSON(`http://universities.hipolabs.com/search?name=${e(ctx.text)}`); if (!j?.length) need('Koi university nahi mili'); return '🎓 ' + j.slice(0, 8).map(u => `*${u.name}* (${u.country})\n${(u.web_pages || [])[0] || ''}`).join('\n\n') }, ['uni']],
  synonym: ['info', 'Ham-maani alfaaz (English)', '<word>', async ctx => { if (!ctx.text) need('Use: .synonym happy'); const j = await getJSON(`https://api.datamuse.com/words?rel_syn=${e(ctx.text)}&max=15`); if (!j.length) need('Kuch nahi mila'); return `📗 *${ctx.text}* ke synonyms:\n${j.map(w => w.word).join(', ')}` }, ['synonyms']],
  antonym: ['info', 'Ulat maani alfaaz (English)', '<word>', async ctx => { if (!ctx.text) need('Use: .antonym happy'); const j = await getJSON(`https://api.datamuse.com/words?rel_ant=${e(ctx.text)}&max=15`); if (!j.length) need('Kuch nahi mila'); return `📕 *${ctx.text}* ke antonyms:\n${j.map(w => w.word).join(', ')}` }, ['antonyms', 'opposite']],
  rhyme: ['info', 'Ham-qafiya alfaaz (English)', '<word>', async ctx => { if (!ctx.text) need('Use: .rhyme love'); const j = await getJSON(`https://api.datamuse.com/words?rel_rhy=${e(ctx.text)}&max=20`); if (!j.length) need('Kuch nahi mila'); return `🎵 *${ctx.text}* se milte alfaaz:\n${j.map(w => w.word).join(', ')}` }, ['rhymes']],
  book: ['info', 'Kitaab dhoondo', '<naam>', async ctx => { if (!ctx.text) need('Use: .book atomic habits'); const d = (await getJSON(`https://openlibrary.org/search.json?q=${e(ctx.text)}&limit=1`)).docs?.[0]; if (!d) need('Kitaab nahi mili'); const t = `📚 *${d.title}*\n✍️ ${(d.author_name || []).join(', ')}\n📅 ${d.first_publish_year || '?'}\n🔗 https://openlibrary.org${d.key}`; return d.cover_i ? img(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, t) : t }, ['books']],
  movie: ['info', 'Film ki maloomat (IMDb)', '<naam>', async ctx => { if (!ctx.text) need('Use: .movie inception'); const m = ((await getJSON(`https://v3.sg.media-imdb.com/suggestion/x/${e(ctx.text.trim().toLowerCase())}.json`)).d || []).find(x => x.qid === 'movie' || x.qid === 'tvMovie' || x.qid === 'tvSeries'); if (!m) need('Film nahi mili'); const t = `🎬 *${m.l}* (${m.y || '?'})
🎭 ${m.qid === 'tvSeries' ? 'TV series' : 'Movie'}
⭐ ${m.s || ''}
🔗 https://www.imdb.com/title/${m.id}/`; return m.i?.imageUrl ? img(m.i.imageUrl.replace('._V1_.jpg', '._V1_SX600.jpg'), t) : t }, ['film', 'imdb']],
  tvshow: ['info', 'TV show / drama ki maloomat', '<naam>', async ctx => { if (!ctx.text) need('Use: .tvshow friends'); const s = await getJSON(`https://api.tvmaze.com/singlesearch/shows?q=${e(ctx.text)}`); if (!s) need('Show nahi mila'); const t = `📺 *${s.name}*\n⭐ ${s.rating?.average || '?'} • ${(s.genres || []).join(', ')}\n📅 ${s.premiered || '?'} • ${s.status}\n\n${cut(s.summary, 500)}`; return s.image?.original ? img(s.image.original, t) : t }, ['series', 'drama']],
  appinfo: ['info', 'App store app ki maloomat', '<naam>', async ctx => { if (!ctx.text) need('Use: .appinfo whatsapp'); const a = (await getJSON(`https://itunes.apple.com/search?term=${e(ctx.text)}&entity=software&limit=1`)).results?.[0]; if (!a) need('App nahi mili'); return img(a.artworkUrl512 || a.artworkUrl100, `📱 *${a.trackName}*\n👨‍💻 ${a.sellerName}\n⭐ ${(a.averageUserRating || 0).toFixed(1)} (${a.userRatingCount || 0})\n💾 ${Math.round((a.fileSizeBytes || 0) / 1048576)} MB • ${a.formattedPrice}\n\n${cut(a.description, 400)}`) }, ['app']],
  songinfo: ['info', 'Gaane ki maloomat (sirf info)', '<naam>', async ctx => { if (!ctx.text) need('Use: .songinfo shape of you'); const s = (await getJSON(`https://itunes.apple.com/search?term=${e(ctx.text)}&entity=song&limit=1`)).results?.[0]; if (!s) need('Gaana nahi mila'); return img(String(s.artworkUrl100).replace('100x100', '600x600'), `🎵 *${s.trackName}*\n🎤 ${s.artistName}\n💿 ${s.collectionName}\n📅 ${String(s.releaseDate).slice(0, 10)} • ${s.primaryGenreName}\n⏱️ ${Math.floor(s.trackTimeMillis / 60000)}:${String(Math.floor(s.trackTimeMillis / 1000) % 60).padStart(2, '0')}`) }, ['trackinfo']],
  animeinfo: ['info', 'Anime ki maloomat', '<naam>', async ctx => { if (!ctx.text) need('Use: .animeinfo naruto'); const a = (await getJSON(`https://kitsu.io/api/edge/anime?filter%5Btext%5D=${e(ctx.text)}&page%5Blimit%5D=1`, { headers: KITSU })).data?.[0]?.attributes; if (!a) need('Anime nahi mila'); const t = `🌸 *${a.canonicalTitle}*${a.titles?.ja_jp ? ' (' + a.titles.ja_jp + ')' : ''}\n⭐ ${a.averageRating || '?'}% • ${a.episodeCount || '?'} episodes • ${a.status}\n📅 ${a.startDate || '?'}${a.ageRating ? ' • ' + a.ageRating : ''}\n\n${cut(a.synopsis, 500)}`; return a.posterImage?.medium ? img(a.posterImage.medium, t) : t }, ['animesearch']],
  manga: ['info', 'Manga ki maloomat', '<naam>', async ctx => { if (!ctx.text) need('Use: .manga one piece'); const a = (await getJSON(`https://kitsu.io/api/edge/manga?filter%5Btext%5D=${e(ctx.text)}&page%5Blimit%5D=1`, { headers: KITSU })).data?.[0]?.attributes; if (!a) need('Manga nahi mila'); const t = `📖 *${a.canonicalTitle}*\n⭐ ${a.averageRating || '?'}% • ${a.chapterCount || '?'} chapters • ${a.status}\n\n${cut(a.synopsis, 500)}`; return a.posterImage?.medium ? img(a.posterImage.medium, t) : t }, ['mangainfo']],
  pokemon: ['info', 'Pokemon ki maloomat', '<naam>', async ctx => { if (!ctx.text) need('Use: .pokemon pikachu'); const p = await getJSON(`https://pokeapi.co/api/v2/pokemon/${e(ctx.text.toLowerCase().trim())}`); if (!p) need('Pokemon nahi mila'); return img(p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default, `⚡ *${p.name.toUpperCase()}* #${p.id}\nType: ${p.types.map(t => t.type.name).join(', ')}\nHeight: ${p.height / 10} m • Weight: ${p.weight / 10} kg\n${p.stats.map(s => `${s.stat.name}: ${s.base_stat}`).join(' | ')}`) }, ['pokedex']],
  npm: ['info', 'NPM package info', '<package>', async ctx => { if (!ctx.text) need('Use: .npm axios'); const p = await getJSON(`https://registry.npmjs.org/${e(ctx.text.trim().toLowerCase()).replace('%40', '@')}/latest`); if (!p) need('Package nahi mila'); return `📦 *${p.name}* v${p.version}\n${p.description || ''}\n📜 ${p.license || '?'}\n🔗 https://www.npmjs.com/package/${p.name}` }],
  pypi: ['info', 'Python (PyPI) package info', '<package>', async ctx => { if (!ctx.text) need('Use: .pypi requests'); const p = await getJSON(`https://pypi.org/pypi/${e(ctx.text.trim())}/json`); if (!p) need('Package nahi mila'); return `🐍 *${p.info.name}* v${p.info.version}\n${p.info.summary || ''}\n🔗 ${p.info.package_url}` }],
  crypto: ['info', 'Crypto ki qeemat (USD + PKR)', '<coin>', async ctx => { const id = { btc: 'bitcoin', eth: 'ethereum', doge: 'dogecoin', bnb: 'binancecoin', sol: 'solana', xrp: 'ripple', ton: 'the-open-network', usdt: 'tether', ada: 'cardano', trx: 'tron', ltc: 'litecoin', shib: 'shiba-inu' }[(ctx.args[0] || 'btc').toLowerCase()] || (ctx.args[0] || 'bitcoin').toLowerCase(); const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${e(id)}&vs_currencies=usd,pkr&include_24hr_change=true`); const c = j?.[id]; if (!c) need('Coin nahi mila (jaise: .crypto btc / eth / doge)'); const ch = c.usd_24h_change || 0; return `💰 *${id.toUpperCase()}*\n💵 $${c.usd.toLocaleString('en-US')}\n🇵🇰 Rs ${Math.round(c.pkr).toLocaleString('en-US')}\n${ch >= 0 ? '📈' : '📉'} 24h: ${ch.toFixed(2)}%` }, ['coin', 'btc']],
  ip: ['info', 'IP address ki maloomat', '<ip>', async ctx => { const ip = (ctx.args[0] || '').trim(); if (!/^[0-9a-f.:]{3,45}$/i.test(ip)) need('Use: .ip 8.8.8.8'); const j = await getJSON(`https://ipwho.is/${e(ip)}`); if (!j?.success) need('IP sahi nahi'); return `🌐 *${j.ip}*\n📍 ${j.city}, ${j.region}, ${j.country} ${j.flag?.emoji || ''}\n🏢 ${j.connection?.isp || '?'}\n🕐 ${j.timezone?.id || ''}` }, ['iplookup']],
  agify: ['info', 'Naam se umar ka andaza', '<naam>', async ctx => { if (!ctx.text) need('Use: .agify Ali'); const j = await getJSON(`https://api.agify.io?name=${e(ctx.args[0])}`); return `🎂 "${j.name}" naam walon ki aam umar: *${j.age ?? '?'}* saal\n_(${j.count} logon ka data, sirf mazak)_` }, ['guessage']],
  genderize: ['info', 'Naam se gender ka andaza', '<naam>', async ctx => { if (!ctx.text) need('Use: .genderize Sara'); const j = await getJSON(`https://api.genderize.io?name=${e(ctx.args[0])}`); return `🚻 "${j.name}": *${j.gender || '?'}* (${Math.round((j.probability || 0) * 100)}%)` }, ['guessgender']],
  nationalize: ['info', 'Naam kis mulk ka lagta hai', '<naam>', async ctx => { if (!ctx.text) need('Use: .nationalize Hussain'); const j = await getJSON(`https://api.nationalize.io?name=${e(ctx.args[0])}`); if (!j.country?.length) need('Pata nahi chala'); const dn = new Intl.DisplayNames(['en'], { type: 'region' }); return `🌍 "${j.name}" naam:\n` + j.country.slice(0, 5).map(c => `• ${dn.of(c.country_id)}: ${Math.round(c.probability * 100)}%`).join('\n') }, ['guesscountry']],
  recipe: ['info', 'Khane ki recipe', '<dish>', async ctx => { const m = ctx.text ? (await getJSON(`https://www.themealdb.com/api/json/v1/1/search.php?s=${e(ctx.text)}`)).meals?.[0] : (await getJSON('https://www.themealdb.com/api/json/v1/1/random.php')).meals?.[0]; if (!m) need('Recipe nahi mili (English naam try karo: biryani, chicken karahi)'); const ing = []; for (let i = 1; i <= 20; i++) if (m['strIngredient' + i]) ing.push(`• ${m['strMeasure' + i] || ''} ${m['strIngredient' + i]}`.trim()); return img(m.strMealThumb, `🍳 *${m.strMeal}* (${m.strArea})\n\n*Ajza:*\n${ing.join('\n')}\n\n*Tarika:*\n${cut(m.strInstructions, 1500)}`) }, ['meal', 'khana']],
  color: ['info', 'Rang ka naam + sample', '<#hex>', async ctx => { const hex = (ctx.args[0] || Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')).replace('#', '').toLowerCase(); if (!/^[0-9a-f]{6}$/.test(hex)) need('Use: .color #ff8800'); let name = ''; try { name = (await getJSON(`https://www.thecolorapi.com/id?hex=${hex}`))?.name?.value || '' } catch {} const n = parseInt(hex, 16); return { buffer: await swatch(hex), caption: `🎨 *#${hex.toUpperCase()}*${name ? ' — ' + name : ''}\nRGB(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` } }, ['colour', 'hexcolor']],
  flag: ['info', 'Mulk ka jhanda', '<country>', async ctx => { if (!ctx.text) need('Use: .flag pakistan'); let cc = ctx.text.trim().toLowerCase(); if (!/^[a-z]{2}$/.test(cc)) { const codes = await getJSON('https://flagcdn.com/en/codes.json'); const hit = Object.entries(codes || {}).find(([, n]) => n.toLowerCase() === cc) || Object.entries(codes || {}).find(([, n]) => n.toLowerCase().startsWith(cc)); if (!hit) need('Mulk nahi mila (English naam ya 2 letter code: pk)'); cc = hit[0] } return img(`https://flagcdn.com/w640/${cc}.png`, `🏳️ ${cc.toUpperCase()}`) }, ['jhanda']],
  // ---------- ANIMALS ----------
  cat: ['animals', 'Random billi 🐱', '', async () => img((await getJSON('https://api.thecatapi.com/v1/images/search'))[0].url, '🐱 Meow!'), ['billi', 'kitty']],
  dog: ['animals', 'Random kutta 🐶', '', async () => img((await getJSON('https://dog.ceo/api/breeds/image/random')).message, '🐶 Woof!'), ['doggo', 'puppy']],
  fox: ['animals', 'Random lomri 🦊', '', async () => img((await getJSON('https://randomfox.ca/floof/')).image, '🦊 Lomri!'), ['lomri']],
  duck: ['animals', 'Random batakh 🦆', '', async () => img(String((await getJSON('https://random-d.uk/api/v2/random')).url).replace(/^http:/, 'https:'), '🦆 Quack!'), ['batakh']],
  capybara: ['animals', 'Random capybara', '', async () => img((await getJSON('https://api.capy.lol/v1/capybara?json=true')).data.url, '🦫 Capybara!'), ['capy']],
  catsay: ['animals', 'Billi tumhari baat bole', '<text>', async ctx => { if (!ctx.text) need('Use: .catsay Assalam o Alaikum'); return img(`https://cataas.com/cat/says/${e(ctx.text.slice(0, 60))}?fontSize=48&fontColor=white`, '🐱💬') }, ['catsays']],
  // ---------- ISLAMIC ----------
  ayah: ['islamic', 'Random ayat (Arabi + Urdu + English)', '', async () => ayah(1 + rnd(6236)), ['randomayat']],
  ayahday: ['islamic', 'Aaj ki ayat (har din nayi)', '', async () => { const d = Math.floor(Date.now() / 86400000); return ayah(1 + (d * 2654435761 % 6236 + 6236) % 6236) }, ['dailyayat', 'ayatoftheday']],
  hadith: ['islamic', 'Random hadith (Sahih Bukhari, Urdu + English)', '[number]', async ctx => { const n = Math.min(7563, Math.max(1, parseInt(ctx.args[0]) || 1 + rnd(7563))); const [en, ur] = await Promise.all([getJSON(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari/${n}.json`), getJSON(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/urd-bukhari/${n}.json`).catch(() => null)]); const h = en?.hadiths?.[0]; if (!h?.text) need('Hadith nahi mili, doosra number try karo'); return `📜 *Sahih Bukhari ${n}*\n\n${ur?.hadiths?.[0]?.text ? '🇵🇰 ' + cut(ur.hadiths[0].text, 900) + '\n\n' : ''}🇬🇧 ${cut(h.text, 900)}\n\n> AQDAS MD` }, ['hadees']],
  asmaulhusna: ['islamic', 'Allah ke 99 naam (ek ya random)', '[1-99]', async ctx => { const n = Math.min(99, Math.max(1, parseInt(ctx.args[0]) || 1 + rnd(99))); const a = (await getJSON(`https://api.aladhan.com/v1/asmaAlHusna/${n}`)).data[0]; return `✨ *${a.number}. ${a.name}*\n${a.transliteration}\n${a.en.meaning}` }, ['asma', '99names']],
  hijri: ['islamic', 'Aaj ki Hijri tareekh', '', async () => { const d = new Date(); const j = (await getJSON(`https://api.aladhan.com/v1/gToH/${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`)).data.hijri; return `🌙 *${j.day} ${j.month.en} ${j.year} AH*\n${j.month.ar} • ${j.weekday.ar}\n(chaand ke hisaab se 1 din aage peeche ho sakta hai)` }, ['islamicdate']],
  qibla: ['islamic', 'Qibla direction kisi shehar se', '<city>', async ctx => { if (!ctx.text) need('Use: .qibla Lahore'); const g = await geo(ctx.text); const q = (await getJSON(`https://api.aladhan.com/v1/qibla/${g.latitude}/${g.longitude}`)).data; return `🕋 *${g.name} se Qibla*\nNorth se ${q.direction.toFixed(1)}° (clockwise)\n🧭 Compass ko ${Math.round(q.direction)}° pe rakho` }],
  surahinfo: ['islamic', 'Surah ki maloomat', '<1-114>', async ctx => { const n = parseInt(ctx.args[0]); if (!(n >= 1 && n <= 114)) need('Use: .surahinfo 36'); const s = (await getJSON(`https://api.alquran.cloud/v1/surah/${n}`)).data; return `📖 *${s.number}. ${s.englishName}* (${s.name})\nMaani: ${s.englishNameTranslation}\nAyaat: ${s.numberOfAyahs}\nNazil: ${s.revelationType === 'Meccan' ? 'Makki' : 'Madani'}\n\nPoori parhne ke liye: .quran ${n}` }],
  dua: ['islamic', 'Roz ki duain (Arabi + tarjuma)', '[1-10]', async ctx => { const n = parseInt(ctx.args[0]); const d = DUAS[(n >= 1 && n <= DUAS.length) ? n - 1 : rnd(DUAS.length)]; return `🤲 *${d[0]}*\n\n${d[1]}\n\n${d[2]}\n\n_.dua 1-${DUAS.length}_` }, ['duain']],
  kalima: ['islamic', '6 Kalimay', '[1-6]', async ctx => { const n = parseInt(ctx.args[0]); const list = (n >= 1 && n <= 6) ? [KALIMA[n - 1]] : KALIMA; return list.map(k => `☪️ *${k[0]}*\n${k[1]}\n_${k[2]}_`).join('\n\n') }, ['kalimay']],
  // ---------- ANIME IMAGES (SFW) ----------
  neko: ['anime', 'Anime neko girl (SFW)', '', async () => img((await getJSON('https://nekos.best/api/v2/neko')).results[0].url, '🐱 Neko')],
  waifuimg: ['anime', 'Anime waifu (SFW)', '', async () => img((await getJSON('https://nekos.best/api/v2/waifu')).results[0].url, '🌸 Waifu'), ['waifu']],
  husbando: ['anime', 'Anime husbando (SFW)', '', async () => img((await getJSON('https://nekos.best/api/v2/husbando')).results[0].url, '🗡️ Husbando')],
  kitsune: ['anime', 'Anime kitsune / fox girl (SFW)', '', async () => img((await getJSON('https://nekos.best/api/v2/kitsune')).results[0].url, '🦊 Kitsune')]
}
for (const [b, path] of Object.entries(BREEDS)) API[b] = ['animals', `Random ${b} kutta 🐕`, '', async () => img((await getJSON(`https://dog.ceo/api/breed/${path}/images/random`)).message, `🐕 ${b[0].toUpperCase() + b.slice(1)}`)]

export async function runApi (name, ctx) {
  const out = await API[name][3](ctx)
  if (typeof out === 'string') return ctx.reply(out.slice(0, 4000))
  if (out?.buffer) return ctx.reply({ image: out.buffer, caption: out.caption || '' })
  if (out?.img) {
    let buf
    try { buf = await getBuffer(out.img) } catch (e) { return ctx.reply((out.caption || '') + '\n\n🔗 ' + out.img) }
    return ctx.reply({ image: buf, caption: (out.caption || '') + '\n\n> AQDAS MD' })
  }
  throw new ApiDown('Khali jawab')
}

export default Object.entries(API).map(([name, [category, desc, usage, , alias]]) => ({
  name, alias: alias || [], category, usage, desc,
  async run (ctx) {
    try { await runApi(name, ctx) } catch (err) {
      if (err.usage) return ctx.reply('ℹ️ ' + err.message)
      return ctx.reply('⚠️ ' + (err instanceof ApiDown ? err.message : 'Abhi data nahi mila, thori dair baad try karo.'))
    }
  }
}))
