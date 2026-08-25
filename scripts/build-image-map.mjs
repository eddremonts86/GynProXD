/**
 * Rebuilds src/data/images-generated.json from the RepDB illustrations that
 * actually exist in public/repdb. Movements without artwork are deliberately
 * absent: the app renders a typographic tile for them rather than a fabricated
 * illustration, so the map stays a record of real assets only.
 */
import fs from 'node:fs'

const repdbMap = JSON.parse(fs.readFileSync('src/data/repdb-images.json', 'utf8'))
const source = fs.readFileSync('src/data/exercises-generated.ts', 'utf8')
const ids = [...source.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((m) => m[1])

const map = {}
let missingFiles = 0
for (const id of ids) {
  const rel = repdbMap[id]
  if (!rel) continue
  if (!fs.existsSync(`public${rel}`)) {
    missingFiles += 1
    continue
  }
  map[id] = rel
}

fs.writeFileSync('src/data/images-generated.json', `${JSON.stringify(map, null, 2)}\n`)

console.log(`${ids.length} movements`)
console.log(`${Object.keys(map).length} with artwork, ${ids.length - Object.keys(map).length} typographic`)
if (missingFiles > 0) console.log(`${missingFiles} mapped files were missing on disk and were dropped`)
