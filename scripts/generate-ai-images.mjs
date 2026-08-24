/**
 * Generate flat 512px WebP for missing exercises via fal.ai
 * Usage: FAL_KEY=xxx node scripts/generate-ai-images.mjs [--limit 10] [--dry]
 * Requires: fal.ai API key, `npm i -g fal-ai-mcp-server` or direct API
 * Style: RepDB flat, 512px, solid warm background #FAF9F6 / #26231f, Noir Warm, consistent line
 */

import fs from 'fs'
import path from 'path'

const DRY = process.argv.includes('--dry')
const limitIdx = process.argv.indexOf('--limit')
const LIMIT = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : 10

const yuhonasIds = [...fs.readFileSync('src/data/exercises-generated.ts', 'utf8').matchAll(/"id"\s*:\s*"([^"]+)"/g)].map(m => m[1])
const repdbMap = JSON.parse(fs.readFileSync('src/data/repdb-images.json', 'utf8'))
const missing = yuhonasIds.filter(id => !repdbMap[id])

console.log(`Missing: ${missing.length}, will generate: ${Math.min(LIMIT, missing.length)} (dry=${DRY})`)

const outDir = 'public/generated'
fs.mkdirSync(outDir, { recursive: true })

// Prompt template - Noir Warm flat
function promptFor(id, name) {
  const clean = name || id.replace(/_/g, ' ')
  return `Flat vector illustration of a person performing ${clean}, side view, minimal line art, 512x512, solid warm background #FAF9F6, consistent with RepDB flat style, Noir Warm editorial, no text, no watermark, high detail, studio lighting`
}

for (let i = 0; i < Math.min(LIMIT, missing.length); i++) {
  const id = missing[i]
  const name = id.replace(/_/g, ' ')
  const prompt = promptFor(id, name)
  const outPath = path.join(outDir, `${id}.webp`)
  console.log(`[${i + 1}/${LIMIT}] ${id} -> ${outPath}`)
  console.log(`  prompt: ${prompt.slice(0, 80)}...`)
  if (DRY) {
    console.log('  dry run, skip')
    continue
  }
  // Real generation would be:
  // const res = await fetch('https://queue.fal.run/fal-ai/nano-banana-2', {
  //   method: 'POST',
  //   headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ prompt, image_size: 'square', num_images: 1 })
  // })
  // const data = await res.json()
  // download data.images[0].url to outPath
  console.log('  (set FAL_KEY and implement fetch to generate)')
}

console.log('Done. To generate all, run with --limit 489 (cost ~ $0.02 per image with nano-banana-2)')
console.log('After generation, run: node scripts/generate-placeholders.mjs --regen-map (to update mapping)')
