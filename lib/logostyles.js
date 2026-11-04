// Logo styles (har ek apni command: .neon AQDAS HACKER). Engine: lib/logo.js
// font = media/fonts/<font>.ttf (sab SIL OFL), bg = rang ya gradient, fill = text ka rang/gradient
const S = {}
const add = (name, desc, spec) => { S[name] = { name, desc, upper: true, ...spec } }

// ---------- helpers (ek family ke styles) ----------
const neon = (name, desc, font, c, c2, bgfx = [['bricks', '#1c1c24', 0.55], 'vignette'], extra = {}) => add(name, desc, { font, bg: ['#050508', '#101018'], bgfx, fill: '#fffaff', glow: [{ color: c, sigma: 24, gain: 3 }, { color: c2 || c, sigma: 7, gain: 3 }], ...extra })
const metal = (name, desc, font, stops, edge, bg, extra = {}) => add(name, desc, { font, bg, bgType: 'radial', fill: stops, outline: { color: edge, w: 3 }, extrude: { color: edge, depth: 7 }, shadow: { color: '#000000', dx: 14, dy: 18, blur: 12 }, ...extra })
const block = (name, desc, font, fill, side, bg, extra = {}) => add(name, desc, { font, bg, fill, outline: { color: '#141414', w: 4 }, extrude: { color: side, depth: 16 }, shadow: { color: '#000000', dx: 24, dy: 24, blur: 10 }, ...extra })

// ---------- NEON ----------
add('neon', 'Pink neon light', { font: 'Monoton', bg: ['#07010f', '#14031f'], bgfx: [['bricks', '#2a1036', 0.6], 'vignette'], fill: '#ffe6fb', glow: [{ color: '#ff2bd6', sigma: 22, gain: 3 }, { color: '#ff5ce1', sigma: 6, gain: 3 }] })
neon('neonblue', 'Blue neon', 'Righteous', '#00b3ff', '#4fd8ff')
neon('neongreen', 'Green neon', 'Audiowide', '#16ff6a', '#7dffad')
neon('neonred', 'Red neon', 'BebasNeue', '#ff1a1a', '#ff6262', [['bricks', '#24100f', 0.6], 'vignette'])
neon('neonpurple', 'Purple neon', 'Orbitron', '#a63bff', '#cf8cff')
neon('neonyellow', 'Yellow neon', 'Bungee', '#ffd400', '#fff07a', [['grid', '#ffd400', 0.08], 'vignette'])
neon('neonsign', 'Neon sign (script)', 'Pacifico', '#ff3fa4', '#36e2ff', [['bricks', '#1e1e28', 0.6], 'vignette'], { upper: false, outline: { color: '#36e2ff', w: 3 } })
neon('neonlines', 'Neon multi-line', 'Monoton', '#00ffe1', '#ff00c8', [['grid', '#00ffe1', 0.1], 'vignette'])
add('cyberpunk', 'Cyberpunk 2077 vibe', { font: 'Orbitron', bg: ['#fcee0a', '#ffd000'], bgfx: [['stripes', '#000000', 0.08]], fill: '#0d0d0d', glitch: { off: 7, c1: '#00f0ff', c2: '#ff003c' }, shadow: { color: '#ff003c', dx: 12, dy: 10 } })
add('synthwave', '80s synthwave', { font: 'Monoton', bg: ['#14002b', '#3a0057', '#7a1f6e'], bgDir: 'v', bgfx: [['grid', '#ff4fd8', 0.35], ['glowspot', '#ff9a3d', 0.3]], fill: ['#fff3a0', '#ff9a3d', '#ff3d81'], glow: [{ color: '#ff2bd6', sigma: 18, gain: 2.5 }] })
add('vaporwave', 'Pastel vaporwave', { font: 'Righteous', bg: ['#ff9ad5', '#9ad8ff'], bgDir: 'd', bgfx: [['grid', '#ffffff', 0.35]], fill: ['#ffffff', '#fff0fb'], outline: { color: '#7a5cff', w: 4 }, shadow: { color: '#ff5ec4', dx: 16, dy: 16 } })

// ---------- FIRE / ELEMENTS ----------
add('fire', 'Aag wala text', { font: 'Anton', bg: ['#000000', '#1a0500'], bgType: 'radial', fill: ['#fff7a8', '#ffcc00', '#ff6a00', '#d61c00'], outline: { color: '#3a0a00', w: 3 }, glow: [{ color: ['#ff3c00', '#ffae00'], sigma: 28, gain: 3, spread: 6 }], shadow: { color: '#ff4500', dx: 0, dy: -22, blur: 26 }, bgfx: [['glowspot', '#ff4500', 0.35]] })
add('lava', 'Lava / magma', { font: 'Bangers', bg: ['#1a0000', '#3d0700'], bgfx: [['plasma', '#ff3300', 0.35], 'vignette'], fill: ['#ffd000', '#ff5a00', '#b30000'], outline: { color: '#200000', w: 6 }, glow: [{ color: '#ff2a00', sigma: 22, gain: 2.5 }] })
add('ice', 'Ice / frozen', { font: 'BlackOpsOne', bg: ['#dff6ff', '#8fd3ff'], bgType: 'radial', bgfx: [['stars', '#ffffff', 1]], fill: ['#ffffff', '#c9f1ff', '#7fd6ff'], outline: { color: '#1b6fa8', w: 4 }, outline2: { color: '#ffffff', w: 4 }, shadow: { color: '#0b4f7a', dx: 10, dy: 12, blur: 6 } })
add('water', 'Water / ocean', { font: 'TitanOne', bg: ['#003b5c', '#0086b3'], bgDir: 'v', bgfx: [['waves', '#ffffff', 0.22]], fill: ['#e0fbff', '#4fd1ff', '#0072bb'], outline: { color: '#ffffff', w: 5 }, shadow: { color: '#00243a', dx: 10, dy: 12, blur: 8 } })
add('thunder', 'Bijli (electric)', { font: 'BlackOpsOne', bg: ['#020617', '#0b1d4a', '#020617'], bgDir: 'v', bgfx: [['rain', '#7fb6ff', 0.25], ['glowspot', '#3d7bff', 0.35]], fill: ['#ffffff', '#bfe3ff', '#5fb0ff'], outline: { color: '#0a2a6b', w: 2 }, glow: [{ color: '#2d8bff', sigma: 24, gain: 3 }, { color: '#b38bff', sigma: 8, gain: 2 }] })
add('toxic', 'Toxic green', { font: 'Creepster', bg: ['#0a1400', '#132600'], bgType: 'radial', bgfx: [['dots', '#3cff00', 0.12]], fill: ['#eaff00', '#59ff00', '#00b300'], outline: { color: '#0a2600', w: 4 }, glow: [{ color: '#55ff00', sigma: 22, gain: 2.5 }] })
add('nature', 'Green leaf nature', { font: 'Lobster', upper: false, bg: ['#e8f7d4', '#a8d98a'], bgType: 'radial', fill: ['#7ccf3b', '#2f8f1f', '#1d5e12'], outline: { color: '#ffffff', w: 6 }, shadow: { color: '#1d4d10', dx: 8, dy: 10, blur: 6 } })
add('sunset', 'Sunset sky', { font: 'Pacifico', upper: false, bg: ['#ff5f6d', '#ffc371'], bgDir: 'v', bgfx: [['glowspot', '#fff3b0', 0.35]], fill: '#ffffff', shadow: { color: '#b23a48', dx: 10, dy: 12, blur: 4 } })
add('rainbow', 'Rainbow colors', { font: 'TitanOne', bg: '#ffffff', bgfx: [['dots', '#ffd6f0', 0.6]], fill: ['#ff0000', '#ff8a00', '#ffe600', '#14d100', '#00b3ff', '#6a00ff', '#d400ff'], fillDir: 'h', outline: { color: '#222222', w: 5 }, shadow: { color: '#000000', dx: 10, dy: 10, blur: 2 } })
add('aurora', 'Northern lights', { font: 'Righteous', bg: ['#000814', '#003d3a', '#2b0a5e'], bgDir: 'h', bgfx: [['stars', '#ffffff', 1]], fill: ['#7dffb2', '#3de0ff', '#c77dff'], fillDir: 'h', glow: [{ color: ['#00ff9d', '#7a5cff'], sigma: 22, gain: 2.5 }] })
add('desert', 'Desert sand', { font: 'Cinzel', bg: ['#f6d79a', '#d9a35a'], bgfx: [['noise', '#fff', 0.25]], fill: ['#8a4b16', '#5c2f0b'], outline: { color: '#fbe6b8', w: 3 }, shadow: { color: '#7a4a1e', dx: 10, dy: 12, blur: 8 } })
add('snow', 'Snowfall winter', { font: 'Bungee', bg: ['#1e3c72', '#2a5298'], bgfx: [['stars', '#ffffff', 1], ['glowspot', '#ffffff', 0.15]], fill: '#ffffff', outline: { color: '#9fd0ff', w: 3 }, glow: [{ color: '#ffffff', sigma: 16, gain: 1.6 }] })

// ---------- METAL / LUXURY ----------
metal('gold', 'Shiny gold 3D', 'TitanOne', ['#8a6412', '#ffe9a3', '#c9962b', '#fff3c4', '#9b7215'], '#4d3505', ['#262019', '#0b0b0b'], { bgfx: [['glowspot', '#d4a64a', 0.25]] })
add('luxury', 'Luxury gold serif', { font: 'Cinzel', bg: ['#0b0b0b', '#1d1a14'], bgType: 'radial', bgfx: [['frame', '#d4af37', 0.8]], fill: ['#b8860b', '#fff1b8', '#d4a017', '#fff6cc', '#a07610'], shadow: { color: '#000000', dx: 6, dy: 8, blur: 6 }, glow: [{ color: '#d4af37', sigma: 12, gain: 0.8 }] })
metal('silver', 'Silver chrome', 'Anton', ['#5f6670', '#ffffff', '#9aa3ad', '#f2f5f8', '#6c737c'], '#2b2f35', ['#3a3f47', '#0f1114'])
metal('chrome', 'Chrome mirror', 'Audiowide', ['#1c2a3a', '#ffffff', '#3d5a78', '#e8f1fa', '#20354a'], '#0e1620', ['#1a2533', '#05080c'], { glow: [{ color: '#7fb8ff', sigma: 14, gain: 1 }] })
metal('bronze', 'Bronze metal', 'BlackOpsOne', ['#5a3a1a', '#e7b07a', '#8c5a2b', '#f3c79a', '#5f3b17'], '#2a1608', ['#2a1d12', '#0b0805'])
metal('rosegold', 'Rose gold', 'Righteous', ['#b76e79', '#ffd8d2', '#d4918c', '#ffe9e4', '#a85d68'], '#5a2e33', ['#2b1d1f', '#0f0a0b'])
add('diamond', 'Diamond sparkle', { font: 'Cinzel', bg: ['#0a0f1e', '#000000'], bgType: 'radial', bgfx: [['stars', '#ffffff', 1]], fill: ['#ffffff', '#bff4ff', '#ffffff', '#d6c8ff', '#ffffff'], outline: { color: '#7fdcff', w: 2 }, glow: [{ color: '#a8e9ff', sigma: 16, gain: 2 }, { color: '#ffffff', sigma: 4, gain: 2 }] })
add('royal', 'Royal purple & gold', { font: 'Cinzel', bg: ['#3b0a57', '#12001f'], bgType: 'radial', bgfx: [['frame', '#e6c35c', 0.9], ['dots', '#e6c35c', 0.06]], fill: ['#fff3c4', '#e6c35c', '#b8860b'], outline: { color: '#2a0640', w: 3 }, shadow: { color: '#000000', dx: 8, dy: 10, blur: 6 } })
metal('king', 'King 3D gold', 'Shojumaru', ['#7a5410', '#ffe9a3', '#d6a531', '#fff7d6', '#8a6412'], '#3b2903', ['#4a0000', '#120000'], { extrude: { color: '#3b2903', depth: 12 } })
add('queen', 'Queen elegant', { font: 'GreatVibes', upper: false, bg: ['#ffe3ec', '#ffb6c9'], bgType: 'radial', fill: ['#c8102e', '#ff4f7b'], outline: { color: '#fff5f8', w: 4 }, shadow: { color: '#a3002c', dx: 6, dy: 8, blur: 8 } })

// ---------- GLITCH / TECH ----------
add('glitch', 'Glitch / hacker', { font: 'Audiowide', bg: ['#050505', '#0e0e14'], bgfx: [['scan', '#000000', 0.5], ['noise', '#fff', 0.2]], fill: '#f5f5f5', glitch: { off: 10, c1: '#ff1744', c2: '#00e5ff' }, slices: [[0.28, 34, 0.08], [0.62, -28, 0.06]] })
add('hackergreen', 'Hacker green terminal', { font: 'CourierPrime', bg: '#000000', bgfx: [['matrix', '#00ff41', 0.35], ['scan', '#000000', 0.5]], fill: '#39ff14', glow: [{ color: '#00ff41', sigma: 14, gain: 2.5 }] })
add('matrix', 'Matrix code', { font: 'Orbitron', bg: '#000000', bgfx: [['matrix', '#00ff41', 0.6], 'vignette'], fill: ['#d6ffd6', '#00ff41'], outline: { color: '#002b0b', w: 4 }, glow: [{ color: '#00ff41', sigma: 20, gain: 2.5 }] })
add('vhs', 'VHS retro tape', { font: 'Righteous', bg: ['#1a1033', '#0b0716'], bgfx: [['scan', '#000000', 0.55], ['noise', '#fff', 0.3]], fill: '#fdfdfd', glitch: { off: 6, c1: '#ff2e63', c2: '#08d9d6' }, slices: [[0.5, 22, 0.05]] })
add('error', 'System error', { font: 'RubikGlitch', bg: ['#1a0000', '#000000'], bgfx: [['scan', '#000000', 0.5]], fill: '#ff2a2a', glitch: { off: 5, c1: '#ffffff', c2: '#550000' }, glow: [{ color: '#ff0000', sigma: 16, gain: 2 }] })
add('cyber', 'Cyber blue tech', { font: 'Orbitron', bg: ['#000814', '#001d3d'], bgfx: [['grid', '#00b4d8', 0.22], ['glowspot', '#0077b6', 0.4]], fill: ['#ffffff', '#90e0ef', '#00b4d8'], outline: { color: '#03045e', w: 3 }, glow: [{ color: '#00b4d8', sigma: 18, gain: 2.2 }] })
add('mecha', 'Robot / mecha', { font: 'BlackOpsOne', bg: ['#2b2b2b', '#121212'], bgfx: [['hex', '#ff6a00', 0.08], 'vignette'], fill: ['#ffb000', '#ff6a00'], outline: { color: '#000000', w: 5 }, extrude: { color: '#4a2000', depth: 10 } })
add('terminal', 'Old terminal (amber)', { font: 'PressStart2P', bg: '#120a00', bgfx: [['scan', '#000000', 0.6], 'vignette'], fill: '#ffb000', glow: [{ color: '#ff8c00', sigma: 12, gain: 2.2 }] })
add('pixel', 'Pixel 8-bit', { font: 'PressStart2P', bg: ['#5c94fc', '#5c94fc'], bgfx: [['checker', '#ffffff', 0.06]], fill: '#ffffff', outline: { color: '#000000', w: 6 }, shadow: { color: '#000000', dx: 12, dy: 12 } })
add('arcade', 'Arcade game', { font: 'PressStart2P', bg: '#0b0018', bgfx: [['stars', '#ffffff', 1]], fill: ['#fff000', '#ff7a00', '#ff0055'], outline: { color: '#2b00ff', w: 5 }, extrude: { color: '#14005e', depth: 10 } })
add('gamer', 'Gamer RGB', { font: 'BlackOpsOne', bg: ['#0a0a0a', '#1a1a1a'], bgfx: [['hex', '#ffffff', 0.04], 'vignette'], fill: ['#ff0055', '#ffcc00', '#00ff88', '#00aaff', '#aa00ff'], fillDir: 'h', outline: { color: '#000000', w: 4 }, glow: [{ color: ['#ff0055', '#00aaff', '#aa00ff'], sigma: 20, gain: 2.2 }] })
add('retro', 'Retro 80s chrome', { font: 'BungeeShade', bg: ['#2b1055', '#7597de'], bgDir: 'v', bgfx: [['grid', '#ff6ec7', 0.25]], fill: ['#ffffff', '#ffd1f0', '#ff6ec7'], shadow: { color: '#1b0838', dx: 10, dy: 12 } })
add('outrun', 'Outrun sunset', { font: 'FasterOne', bg: ['#0d0221', '#261447', '#541388'], bgDir: 'v', bgfx: [['grid', '#2de2e6', 0.3]], fill: ['#f6f740', '#ff9e00'], outline: { color: '#0d0221', w: 3 }, glow: [{ color: '#ff3864', sigma: 18, gain: 2.5 }] })

// ---------- 3D / CARTOON / FUN ----------
block('3d', 'Bold 3D block', 'TitanOne', ['#ffffff', '#e8f6ff'], ['#3a2fd1', '#1b1b6a'], ['#ffcf3f', '#ff8a00'], { bgfx: [['rays', '#ffffff', 0.18]] })
block('3dred', '3D red block', 'Bungee', ['#ffe066', '#ffb800'], ['#b30000', '#4d0000'], ['#ff4d4d', '#c00000'], { bgfx: [['stripes', '#ffffff', 0.08]] })
block('3dblue', '3D sky block', 'BlackOpsOne', ['#ffef5a', '#ffc400'], ['#003c8f', '#001a40'], ['#4facfe', '#00f2fe'])
add('retro3d', 'Retro 3D shade', { font: 'BungeeShade', bg: ['#f9d423', '#ff4e50'], bgDir: 'v', bgfx: [['rays', '#ffffff', 0.15]], fill: '#2b2b2b', shadow: { color: '#ffffff', dx: 8, dy: 8 } })
add('cartoon', 'Cartoon', { font: 'Bangers', bg: ['#00c6ff', '#0072ff'], bgfx: [['rays', '#ffffff', 0.2]], fill: ['#fff700', '#ffb300'], outline: { color: '#000000', w: 7 }, extrude: { color: '#000000', depth: 10 } })
add('comic', 'Comic book', { font: 'Bangers', bg: ['#ffef00', '#ffb000'], bgType: 'radial', bgfx: [['dots', '#ff3d00', 0.35]], fill: '#ffffff', outline: { color: '#000000', w: 8 }, outline2: { color: '#ff1744', w: 6 }, shadow: { color: '#000000', dx: 14, dy: 14 } })
add('bubble', 'Bubble pastel', { font: 'TitanOne', bg: ['#e0c3fc', '#8ec5fc'], bgDir: 'd', bgfx: [['circles', '#ffffff', 0.12]], fill: ['#ffffff', '#ffe3f6'], outline: { color: '#ff7eb9', w: 8 }, shadow: { color: '#6a4c93', dx: 8, dy: 12, blur: 6 }, inner: { alpha: 0.5 } })
add('candy', 'Candy sweet', { font: 'Pacifico', upper: false, bg: ['#fff0f6', '#ffd6e8'], bgfx: [['stripes', '#ff8fb8', 0.18]], fill: ['#ff4fa3', '#ff8fc6'], outline: { color: '#ffffff', w: 8 }, shadow: { color: '#c2185b', dx: 8, dy: 10, blur: 4 } })
add('toy', 'Toy / kids', { font: 'TitanOne', bg: ['#fffbe0', '#ffe9a8'], bgfx: [['dots', '#ffcc00', 0.25]], fill: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'], fillDir: 'h', outline: { color: '#ffffff', w: 8 }, extrude: { color: '#5a3b00', depth: 9 } })
add('cutout', 'Sticker cutout', { font: 'Bangers', bg: ['#2d3436', '#636e72'], fill: ['#fd79a8', '#e84393'], outline: { color: '#ffffff', w: 14 }, shadow: { color: '#000000', dx: 10, dy: 14, blur: 12 } })
add('pop', 'Pop art', { font: 'Bungee', bg: '#00e5ff', bgfx: [['dots', '#ff00aa', 0.35]], fill: '#ffeb3b', outline: { color: '#000000', w: 6 }, shadow: { color: '#ff00aa', dx: 16, dy: 16 } })
add('party', 'Party confetti', { font: 'Bangers', bg: ['#8e2de2', '#4a00e0'], bgfx: [['matrix', '#ffd700', 0.2], ['stars', '#ff6ad5', 1]], fill: ['#ffd700', '#ff6ad5', '#00f5d4'], fillDir: 'h', outline: { color: '#1a0040', w: 6 }, shadow: { color: '#000000', dx: 10, dy: 10, blur: 4 } })
add('birthday', 'Happy birthday', { font: 'Lobster', upper: false, bg: ['#ffecd2', '#fcb69f'], bgfx: [['dots', '#ff6f91', 0.18], ['stars', '#ffffff', 1]], fill: ['#ff6f91', '#d65db1', '#845ec2'], fillDir: 'h', outline: { color: '#ffffff', w: 6 }, shadow: { color: '#845ec2', dx: 6, dy: 8, blur: 6 } })
add('love', 'Love / romantic', { font: 'GreatVibes', upper: false, bg: ['#3a0010', '#8b0030'], bgType: 'radial', bgfx: [['glowspot', '#ff4d6d', 0.35]], fill: ['#ffffff', '#ffd6e0'], glow: [{ color: '#ff1f5a', sigma: 18, gain: 2.5 }] })
add('valentine', 'Valentine pink', { font: 'Pacifico', upper: false, bg: ['#ff9a9e', '#fecfef'], bgfx: [['circles', '#ffffff', 0.15]], fill: '#e0004d', outline: { color: '#ffffff', w: 6 }, glow: [{ color: '#ff4d88', sigma: 16, gain: 1.6 }] })
add('barbie', 'Barbie pink', { font: 'Pacifico', upper: false, bg: ['#ff69b4', '#ff1493'], bgfx: [['stars', '#ffffff', 1]], fill: '#ffffff', outline: { color: '#c2006b', w: 4 }, shadow: { color: '#8a004c', dx: 8, dy: 10, blur: 4 } })
add('blackpink', 'Blackpink style', { font: 'BebasNeue', bg: '#0b0b0b', fill: '#f7a7c3', glow: [{ color: '#ff6fa8', sigma: 10, gain: 1.2 }] })
add('wedding', 'Wedding script', { font: 'GreatVibes', upper: false, bg: ['#fffaf0', '#f3e5c8'], bgType: 'radial', bgfx: [['frame', '#c9a227', 0.8]], fill: ['#a67c00', '#e6c35c', '#a67c00'], shadow: { color: '#8a6d1e', dx: 3, dy: 4, blur: 4 } })

// ---------- GRAFFITI / STREET ----------
add('graffiti', 'Wall graffiti', { font: 'Sedgwick', bg: ['#7a2e1d', '#5a2015'], bgfx: [['bricks', '#c9b6a6', 0.55], ['noise', '#fff', 0.25], 'vignette'], fill: ['#00ffd0', '#7cff00', '#ffee00'], fillDir: 'h', outline: { color: '#111111', w: 7 }, outline2: { color: '#ffffff', w: 6 }, shadow: { color: '#000000', dx: 12, dy: 14, blur: 3 } })
add('spray', 'Spray paint drip', { font: 'RubikWetPaint', bg: ['#cfd3d6', '#9ea4a8'], bgfx: [['noise', '#fff', 0.35], 'vignette'], fill: ['#ff2d95', '#7a00ff'], fillDir: 'h', shadow: { color: '#000000', dx: 8, dy: 8, blur: 6 } })
add('street', 'Street wall', { font: 'Sedgwick', bg: ['#4b4b4b', '#2e2e2e'], bgfx: [['noise', '#fff', 0.4], ['scratch', '#ffffff', 1], 'vignette'], fill: ['#ff6a00', '#ffd000'], fillDir: 'd', outline: { color: '#000000', w: 8 }, outline2: { color: '#00c2ff', w: 5 } })

// ---------- SPACE ----------
add('galaxy', 'Galaxy / space', { font: 'Orbitron', bg: ['#2b0a5e', '#0a0730', '#000000'], bgType: 'radial', bgfx: [['stars', '#ffffff', 1]], fill: ['#ff7ce5', '#9d7bff', '#4ee0ff'], fillDir: 'h', glow: [{ color: '#b48cff', sigma: 20, gain: 2 }], outline: { color: '#ffffff', w: 2 } })
add('nebula', 'Nebula cloud', { font: 'Righteous', bg: ['#ff006e', '#3a0ca3', '#000000'], bgType: 'radial', bgfx: [['plasma', '#7209b7', 0.35], ['stars', '#ffffff', 1]], fill: '#ffffff', glow: [{ color: '#ff4ecd', sigma: 22, gain: 2.5 }] })
add('cosmic', 'Cosmic gold space', { font: 'Cinzel', bg: ['#000000', '#0b1340'], bgType: 'radial', bgfx: [['stars', '#ffffff', 1], ['circles', '#4a6cff', 0.08]], fill: ['#fff4c2', '#ffcf5c'], glow: [{ color: '#ffbb00', sigma: 18, gain: 1.8 }] })
add('space', 'Space station', { font: 'Audiowide', bg: ['#000000', '#0a0f2c'], bgfx: [['stars', '#ffffff', 1]], fill: ['#ffffff', '#cfd8ff'], outline: { color: '#2b3a8a', w: 3 }, glow: [{ color: '#4f6bff', sigma: 20, gain: 2 }] })
add('ufo', 'Alien UFO', { font: 'Nosifer', bg: ['#001a00', '#000000'], bgType: 'radial', bgfx: [['stars', '#b3ff00', 1], ['glowspot', '#39ff14', 0.25]], fill: ['#d4ff00', '#39ff14'], glow: [{ color: '#39ff14', sigma: 20, gain: 2.5 }] })

// ---------- HORROR ----------
add('horror', 'Horror red', { font: 'Creepster', bg: ['#120000', '#000000'], bgType: 'radial', bgfx: [['noise', '#fff', 0.2], 'vignette'], fill: ['#ff3b3b', '#9a0000'], outline: { color: '#1a0000', w: 3 }, glow: [{ color: '#ff0000', sigma: 12, gain: 1.1 }], shadow: { color: '#000000', dx: 6, dy: 10, blur: 4 } })
add('blood', 'Blood drip', { font: 'Nosifer', bg: ['#e8e2d8', '#bdb4a6'], bgfx: [['noise', '#fff', 0.25], 'vignette'], fill: ['#b30000', '#5c0000'], shadow: { color: '#3d0000', dx: 4, dy: 6, blur: 4 } })
add('ghost', 'Ghost white', { font: 'Creepster', bg: ['#0b1026', '#000000'], bgType: 'radial', bgfx: [['glowspot', '#5a6fa8', 0.25]], fill: ['#ffffff', '#cfd8ff'], glow: [{ color: '#ffffff', sigma: 26, gain: 2 }, { color: '#9fb4ff', sigma: 8, gain: 1.5 }] })
add('halloween', 'Halloween', { font: 'Creepster', bg: ['#1a0533', '#000000'], bgType: 'radial', bgfx: [['glowspot', '#ff6a00', 0.3]], fill: ['#ffb000', '#ff5e00'], outline: { color: '#2b0a3d', w: 6 }, glow: [{ color: '#ff6a00', sigma: 18, gain: 2 }] })
add('dracula', 'Dracula gothic', { font: 'Unifraktur', upper: false, bg: ['#2b0000', '#000000'], bgType: 'radial', fill: ['#ff4d4d', '#8b0000'], outline: { color: '#000000', w: 3 }, glow: [{ color: '#b30000', sigma: 18, gain: 1.8 }] })

// ---------- CLASSIC / TEXTURE ----------
add('gothic', 'Gothic blackletter', { font: 'Unifraktur', upper: false, bg: ['#d8cbb0', '#b9a785'], bgfx: [['noise', '#fff', 0.3], 'vignette'], fill: '#1a1410', shadow: { color: '#5a4a35', dx: 4, dy: 5, blur: 3 } })
add('medieval', 'Medieval gold', { font: 'Unifraktur', upper: false, bg: ['#2b1a0e', '#120a05'], bgType: 'radial', fill: ['#fff1b8', '#d4a017', '#8a6412'], outline: { color: '#000000', w: 3 }, shadow: { color: '#000000', dx: 6, dy: 8, blur: 6 } })
add('vintage', 'Vintage sepia', { font: 'Lobster', upper: false, bg: ['#f4e4c1', '#d8c094'], bgfx: [['noise', '#fff', 0.3], 'vignette'], fill: '#5b3a1a', outline: { color: '#f8efd9', w: 5 }, shadow: { color: '#3a2410', dx: 7, dy: 7 } })
add('typewriter', 'Typewriter paper', { font: 'CourierPrime', upper: false, bg: ['#fbf7ee', '#efe6d2'], bgfx: [['noise', '#fff', 0.2], ['waves', '#9bb4d6', 0.15]], fill: '#222222' })
add('chalk', 'Chalkboard', { font: 'Sedgwick', upper: false, bg: ['#2f4f3a', '#1d3324'], bgfx: [['noise', '#fff', 0.35], ['frame', '#8b5a2b', 1]], fill: '#f2f2f2', post: ['noise=c0s=18:allf=t'] })
add('wood', 'Wood sign', { font: 'Righteous', bg: ['#8b5a2b', '#5c3a1a'], bgDir: 'v', bgfx: [['waves', '#3d230e', 0.35], ['noise', '#fff', 0.2]], fill: ['#fff1d6', '#f0d3a0'], outline: { color: '#3d230e', w: 4 }, extrude: { color: '#2a1608', depth: 6 } })
add('signature', 'Signature script', { font: 'GreatVibes', upper: false, bg: '#ffffff', fill: '#14213d', maxSize: 270 })
add('elegant', 'Elegant black & gold', { font: 'GreatVibes', upper: false, bg: ['#141414', '#000000'], bgType: 'radial', fill: ['#fff1b8', '#d4a017'], glow: [{ color: '#d4a017', sigma: 10, gain: 0.8 }] })
add('minimal', 'Minimal clean', { font: 'BebasNeue', bg: '#ffffff', fill: '#111111' })
add('outline', 'Hollow outline', { font: 'Anton', bg: ['#111827', '#1f2937'], fill: '#111827', fillType: 'linear', outline: { color: '#ffffff', w: 5 } })
add('double', 'Double outline', { font: 'Bungee', bg: '#ffd166', fill: '#ef476f', outline: { color: '#ffffff', w: 6 }, outline2: { color: '#073b4c', w: 6 } })
add('shadow', 'Long shadow', { font: 'Anton', bg: '#ff6b6b', fill: '#ffffff', extrude: { color: '#c44d4d', depth: 40, dx: 1, dy: 1 } })

// ---------- ASIAN / ANIME ----------
add('anime', 'Anime title', { font: 'Shojumaru', bg: ['#ff9a8b', '#ff6a88', '#ff99ac'], bgfx: [['rays', '#ffffff', 0.18]], fill: ['#ffffff', '#fff3f8'], outline: { color: '#2b2d42', w: 6 }, extrude: { color: '#2b2d42', depth: 8 } })
add('samurai', 'Samurai red sun', { font: 'Shojumaru', bg: '#f4ead5', bgfx: [['glowspot', '#d90429', 0.9]], fill: '#111111', outline: { color: '#f4ead5', w: 4 } })
add('ninja', 'Ninja dark', { font: 'Shojumaru', bg: ['#1b1b1b', '#000000'], bgType: 'radial', fill: ['#ffffff', '#c9c9c9'], outline: { color: '#b00020', w: 4 }, shadow: { color: '#b00020', dx: 10, dy: 10, blur: 8 } })
add('sakura', 'Sakura pink', { font: 'Shojumaru', bg: ['#ffe4ec', '#ffc2d4'], bgfx: [['circles', '#ff8fab', 0.15]], fill: ['#ff4d8d', '#ff85a1'], outline: { color: '#ffffff', w: 6 }, shadow: { color: '#c9184a', dx: 6, dy: 8, blur: 6 } })

// ---------- SPORT / ARMY ----------
add('army', 'Army camo', { font: 'BlackOpsOne', bg: ['#4b5320', '#2f3517'], bgfx: [['plasma', '#1e2410', 0.4], ['noise', '#fff', 0.2]], fill: ['#e8e0c0', '#c2b280'], outline: { color: '#1e2410', w: 4 }, shadow: { color: '#000000', dx: 8, dy: 8, blur: 4 } })
add('military', 'Military stencil', { font: 'BlackOpsOne', bg: ['#2f2f2f', '#1a1a1a'], bgfx: [['stripes', '#ffcc00', 0.12], 'vignette'], fill: '#ffcc00', outline: { color: '#000000', w: 4 } })
add('police', 'Police lights', { font: 'Anton', bg: ['#0033ff', '#000000', '#ff0022'], bgDir: 'h', fill: '#ffffff', outline: { color: '#000000', w: 5 }, glow: [{ color: ['#3d6bff', '#ff2d4a'], sigma: 22, gain: 2.5 }] })
add('racing', 'Racing speed', { font: 'FasterOne', bg: ['#111111', '#2a2a2a'], bgfx: [['checker', '#ffffff', 0.08], ['stripes', '#ff0000', 0.1]], fill: ['#ff3d00', '#ffd600'], fillDir: 'h', shadow: { color: '#000000', dx: 10, dy: 8 } })
add('sport', 'Sport jersey', { font: 'Anton', bg: ['#0a3d91', '#041d4d'], bgfx: [['hex', '#ffffff', 0.05]], fill: '#ffffff', outline: { color: '#e63946', w: 6 }, outline2: { color: '#ffffff', w: 4 }, shadow: { color: '#000000', dx: 10, dy: 12, blur: 6 } })
add('pakistan', 'Pakistan green & white', { font: 'TitanOne', bg: ['#01411c', '#00220e'], bgfx: [['stars', '#ffffff', 1]], fill: '#ffffff', outline: { color: '#01411c', w: 5 }, outline2: { color: '#ffffff', w: 4 }, shadow: { color: '#000000', dx: 8, dy: 10, blur: 6 } })
add('islamic', 'Islamic green gold', { font: 'Cinzel', bg: ['#0b3d2e', '#04150f'], bgType: 'radial', bgfx: [['hex', '#d4af37', 0.08], ['frame', '#d4af37', 0.8]], fill: ['#fff1b8', '#d4a017'], shadow: { color: '#000000', dx: 6, dy: 8, blur: 6 }, glow: [{ color: '#d4af37', sigma: 10, gain: 0.7 }] })

export const STYLES = S
