// har .js file ka syntax check
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
const files = []
const walk = d => { for (const f of fs.readdirSync(d)) { if (f === 'node_modules' || f.startsWith('.')) continue; const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') || p.endsWith('.cjs')) && files.push(p) } }
walk('.')
let bad = 0
for (const f of files) { try { execFileSync(process.execPath, ['--check', f]) } catch (e) { bad++; console.log('FAIL', f) } }
console.log(`${files.length - bad}/${files.length} files syntax OK`)
process.exit(bad ? 1 : 0)
