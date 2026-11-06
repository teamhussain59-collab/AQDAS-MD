import dotenv from 'dotenv'
dotenv.config({ quiet: true })

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v).trim()))
const list = (v, d) => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : d)
const digits = v => String(v || '').replace(/[^0-9]/g, '')

const config = {
  // Bot Maker: jis number ka apna brand ho (settings.brand) us ke liye naam / owner / channel wahi
  _brand: () => null,
  setBrandSource (fn) { this._brand = fn },
  get botName () { return this._brand()?.botName || process.env.BOT_NAME || 'AQDAS MD' },
  get ownerName () { return this._brand()?.ownerName || process.env.OWNER_NAME || 'AQDAS HACKER' },
  get channel () { const b = this._brand(); return b ? (b.channel || '') : (process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029Vb9FRVV8F2pDezlyrD0q') },
  get mainChannel () { return process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029Vb9FRVV8F2pDezlyrD0q' },
  ownerNumbers: list(process.env.OWNER_NUMBER, []).map(digits).filter(Boolean),
  prefix: process.env.PREFIX || '.',
  mode: (process.env.MODE || 'public').toLowerCase(),
  pairNumber: digits(process.env.PAIR_NUMBER),
  web: bool(process.env.WEB, !!process.env.PORT),
  port: Number(process.env.PORT || 3000),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionId: process.env.SESSION_ID || '',
  sessionDir: process.env.SESSION_DIR || './session',
  dataDir: process.env.DATA_DIR || './data',
  openrouterKey: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  keepAliveUrl: process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || process.env.KOYEB_PUBLIC_DOMAIN && ('https://' + process.env.KOYEB_PUBLIC_DOMAIN) || '',
  ytdlp: process.env.YTDLP_PATH || 'yt-dlp',
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  maxDownloadMB: Number(process.env.MAX_DOWNLOAD_MB || 100),
  rchApiUrl: process.env.RCH_API_URL || 'https://api.omegatech.app/api/Fun/Rch',
  defaults: {
    autoReact: bool(process.env.AUTO_REACT, true),
    reactEmojis: list(process.env.AUTO_REACT_EMOJIS, ['❤️', '🔥', '😂', '😍', '👍', '💯', '😎', '🥰', '🤖', '⚡']),
    reactScope: (process.env.AUTO_REACT_SCOPE || 'all').toLowerCase(),
    autoRead: bool(process.env.AUTO_READ, false),
    autoStatusView: bool(process.env.AUTO_STATUS_VIEW, true),
    autoStatusReact: bool(process.env.AUTO_STATUS_REACT, false),
    statusEmojis: list(process.env.STATUS_REACT_EMOJIS, ['😊', '😇', '🙂', '😘', '😍', '😌', '😢', '🥺', '😳']),
    alwaysOnline: bool(process.env.ALWAYS_ONLINE, false),
    autoTyping: bool(process.env.AUTO_TYPING, false),
    menuSong: bool(process.env.MENU_SONG, true),
    setDpOnFirstConnect: bool(process.env.SET_DP_ON_FIRST_CONNECT, true)
  },
  get packname () { return this._brand()?.botName || process.env.STICKER_PACK || 'AQDAS MD' },
  get author () { return this._brand()?.ownerName || process.env.STICKER_AUTHOR || 'AQDAS HACKER' }
}

export default config
