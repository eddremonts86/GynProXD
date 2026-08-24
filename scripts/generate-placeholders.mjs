import fs from 'fs'
import path from 'path'

const repdbMap = JSON.parse(fs.readFileSync('src/data/repdb-images.json', 'utf8'))
const content = fs.readFileSync('src/data/exercises-generated.ts', 'utf8')
const ids = [...content.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map(m => m[1])
const names = [...content.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => m[1])
const idToName = Object.fromEntries(ids.map((id, i) => [id, names[i] || id]))

const missing = ids.filter(id => !repdbMap[id])
console.log(`Missing: ${missing.length} of ${ids.length}`)

const outDir = 'public/generated'
fs.mkdirSync(outDir, { recursive: true })

let generated = 0
for (const id of missing) {
  const name = idToName[id] || id
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="24" fill="#26231f" />
  <rect width="512" height="512" rx="24" fill="none" stroke="#3a3632" stroke-width="2"/>
  <circle cx="256" cy="180" r="72" fill="none" stroke="#d98e3f" stroke-width="2" opacity="0.9"/>
  <circle cx="256" cy="180" r="48" fill="#d98e3f" opacity="0.15"/>
  <text x="256" y="300" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" font-weight="600" fill="#f5ede4">${escapeXml(name)}</text>
  <text x="256" y="328" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="500" fill="#b8afa6" letter-spacing="1">${escapeXml(id)}</text>
  <text x="256" y="480" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="#3a3632">Forma • flat placeholder • RepDB free + generated</text>
</svg>`
  const outPath = path.join(outDir, `${id}.svg`)
  fs.writeFileSync(outPath, svg)
  generated++
}

console.log(`Generated ${generated} placeholders in ${outDir}/`)

// also create a webp version via simple copy? For now SVG is enough, app can use SVG.
// Update mapping to include generated
const genMap = {}
for (const id of missing) {
  genMap[id] = `/generated/${id}.svg`
}
const fullMap = { ...repdbMap, ...genMap }
fs.writeFileSync('src/data/images-generated.json', JSON.stringify(fullMap, null, 2))
console.log(`Wrote full map ${Object.keys(fullMap).length} to src/data/images-generated.json`)

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
