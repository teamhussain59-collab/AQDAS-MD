// Voice changer: voice note / audio pe reply -> ffmpeg effect -> wapas voice note (ogg/opus, ptt)
// Sirf woh filters jo runner ke static ffmpeg 7.0.2 mein hain (aur ffmpeg 5.1 mein bhi) — test/voice.js har ek chalata hai.
import fs from 'fs'
import config from '../config.js'
import { run, tmpFile, rm } from './utils.js'

const SR = 44100
const pitch = (k, keepTempo = true) => `asetrate=${Math.round(SR * k)},aresample=${SR}` + (keepTempo ? `,atempo=${(1 / k).toFixed(4)}` : '')
const LIMIT = 'alimiter=limit=0.89:level=disabled'

export const VOICES = {
  bass: { desc: 'Heavy bass boost', af: `bass=g=14:f=110:w=0.6,volume=-3dB,${LIMIT}` },
  deep: { desc: 'Bhaari / deep awaz', af: pitch(0.75) },
  chipmunk: { desc: 'Chipmunk (patli tez awaz)', alias: ['squirrel'], af: pitch(1.6) },
  tupai: { desc: 'Tupai (tez + oonchi)', af: pitch(1.45, false) },
  girl: { desc: 'Larki jaisi awaz', alias: ['female'], af: `${pitch(1.28)},equalizer=f=250:t=q:w=1:g=-4` },
  demon: { desc: 'Demon / jin', af: `${pitch(0.6)},aecho=0.8:0.7:40|80:0.35|0.25,bass=g=6,${LIMIT}` },
  robot: { desc: 'Robot awaz', af: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75,volume=9dB," + LIMIT },
  alien: { desc: 'Alien', af: `${pitch(1.2)},flanger=delay=2:depth=4:speed=2,vibrato=f=9:d=0.35` },
  whisper: { desc: 'Sargoshi (whisper)', af: "afftfilt=real='hypot(re,im)*cos((random(0)*2-1)*2*3.14)':imag='hypot(re,im)*sin((random(1)*2-1)*2*3.14)':win_size=128:overlap=0.8,volume=3dB," + LIMIT },
  echo: { desc: 'Echo (goonj)', af: 'aecho=0.8:0.88:120|240:0.45|0.28' },
  reverb: { desc: 'Hall reverb', alias: ['hall'], af: 'aecho=0.8:0.9:40|67|98|131:0.4|0.32|0.25|0.18' },
  reverse: { desc: 'Ulta (voice pe reply) — ya text ulta', af: 'areverse' },
  fast: { desc: 'Tez (same pitch)', af: 'atempo=1.5' },
  slow: { desc: 'Aahista (same pitch)', af: 'atempo=0.72' },
  slowed: { desc: 'Slowed + reverb', af: `${pitch(0.85, false)},aecho=0.8:0.85:60|95:0.3|0.22` },
  nightcore: { desc: 'Nightcore (tez + oonchi)', af: pitch(1.25, false) },
  fat: { desc: 'Mota / fat awaz', af: `${pitch(0.85, false)},bass=g=8:f=150,${LIMIT}` },
  smooth: { desc: 'Smooth / soft', af: `highpass=f=90,lowpass=f=4200,acompressor=threshold=0.1:ratio=3:attack=10:release=200:makeup=4,aecho=0.6:0.5:25:0.15,volume=6dB,${LIMIT}` },
  earrape: { desc: 'Earrape (volume capped)', af: `acrusher=bits=8:mode=log:aa=1:level_in=3,volume=8dB,${LIMIT}` },
  blown: { desc: 'Phata speaker (blown)', af: `acrusher=level_in=4:level_out=0.8:bits=5:mode=lin:aa=0,lowpass=f=5000,volume=4dB,${LIMIT}` },
  radio: { desc: 'Purana radio', alias: ['oldradio'], af: `highpass=f=400,lowpass=f=3200,acrusher=bits=10:mode=log:aa=1,volume=4dB,${LIMIT}` },
  vibrato: { desc: 'Vibrato (larazti awaz)', af: 'vibrato=f=6:d=0.6' },
  tremolo: { desc: 'Tremolo', af: 'tremolo=f=8:d=0.7' },
  chorus: { desc: 'Chorus (kai awazein)', af: 'chorus=0.6:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3' },
  flanger: { desc: 'Flanger (jet)', af: 'flanger=delay=4:depth=6:speed=0.5' },
  phaser: { desc: 'Phaser', af: `aphaser=type=t:speed=1:decay=0.6,volume=7dB,${LIMIT}` }
}
export const MAX_SECONDS = 300

export async function changeVoice (buf, style, { ffmpeg = config.ffmpeg || 'ffmpeg', timeout = 120000 } = {}) {
  const v = VOICES[style]
  if (!v) throw new Error('Ye voice style nahi hai: ' + style)
  if (!buf || buf.length < 200) throw new Error('Audio nahi mila')
  const inp = tmpFile('audio'), out = tmpFile('ogg')
  fs.writeFileSync(inp, buf)
  try {
    await run(ffmpeg, ['-y', '-v', 'error', '-i', inp, '-vn', '-t', String(MAX_SECONDS), '-af', `aresample=${SR},${v.af}`, '-c:a', 'libopus', '-b:a', '64k', '-ac', '1', '-ar', '48000', out], { timeout })
    const o = fs.readFileSync(out)
    if (o.length < 200) throw new Error('Awaz nahi bani (khali audio?)')
    return o
  } finally { rm(inp, out) }
}
