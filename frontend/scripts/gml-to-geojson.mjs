#!/usr/bin/env node
/**
 * One-off: convert ONE CityGML LoD2 tile (Bühl's existing buildings) into a
 * simplified GeoJSON FeatureCollection for the 3D backdrop (§4.1).
 *
 * Per building it takes the GroundSurface polygon as the footprint and
 * `measuredHeight` (or max−min Z of its vertices) as a `height` property, then
 * reprojects EPSG:25832 → EPSG:4326. Parsing CityGML perfectly is NOT the goal;
 * footprint + height per building is enough for grey extrusions.
 *
 * Usage:
 *   node scripts/gml-to-geojson.mjs <input.gml> [output.geojson] [--bbox minLon,minLat,maxLon,maxLat]
 *
 * Default output: public/data/city.geojson
 * If a tile produces a file over ~10 MB, pass --bbox to crop around the plan.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'
import proj4 from 'proj4'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

proj4.defs(
  'EPSG:25832',
  '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
)
const toWGS84 = (x, y) => proj4('EPSG:25832', 'EPSG:4326', [x, y])

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bbox') args.bbox = argv[++i]
    else args._.push(argv[i])
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const inputPath = args._[0]
if (!inputPath) {
  console.error(
    'Usage: node scripts/gml-to-geojson.mjs <input.gml> [output.geojson] [--bbox minLon,minLat,maxLon,maxLat]',
  )
  process.exit(1)
}
const outputPath = resolve(ROOT, args._[1] || 'public/data/city.geojson')
const bbox = args.bbox ? args.bbox.split(',').map(Number) : null

console.log(`Reading ${inputPath} …`)
const xml = readFileSync(inputPath, 'utf8')

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // collapse bldg:, gml:, core: → plain tags
})
const doc = parser.parse(xml)

/** Walk the parsed tree collecting every node whose (namespace-stripped) tag
 *  matches `name`. Robust to CityGML's deep, variant nesting. */
function collect(node, name, out = []) {
  if (node == null || typeof node !== 'object') return out
  for (const [key, val] of Object.entries(node)) {
    if (key === name) {
      if (Array.isArray(val)) out.push(...val)
      else out.push(val)
    }
    if (Array.isArray(val)) val.forEach((v) => collect(v, name, out))
    else if (typeof val === 'object') collect(val, name, out)
  }
  return out
}

function firstText(node) {
  if (node == null) return undefined
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (typeof node === 'object') return node['#text'] != null ? String(node['#text']) : undefined
  return undefined
}

/** Parse a gml:posList string ("x y z x y z …") into [[x,y,z], …]. */
function parsePosList(text, dim = 3) {
  const nums = String(text).trim().split(/\s+/).map(Number)
  const pts = []
  for (let i = 0; i + dim - 1 < nums.length; i += dim) {
    pts.push([nums[i], nums[i + 1], dim > 2 ? nums[i + 2] : 0])
  }
  return pts
}

/** Pull every posList under a node (handles posList or pos elements). */
function ringsFromSurface(surface) {
  const lists = collect(surface, 'posList').map((n) => firstText(n)).filter(Boolean)
  const rings = lists.map((t) => parsePosList(t))
  if (rings.length) return rings
  // Fallback: individual <pos> elements.
  const poss = collect(surface, 'pos').map((n) => firstText(n)).filter(Boolean)
  if (poss.length) {
    const pts = poss.map((t) => {
      const [x, y, z] = String(t).trim().split(/\s+/).map(Number)
      return [x, y, z ?? 0]
    })
    return [pts]
  }
  return []
}

const buildings = collect(doc, 'Building')
console.log(`Found ${buildings.length} buildings.`)

const features = []
let skipped = 0

for (const b of buildings) {
  // Height: prefer measuredHeight, else max−min Z across all vertices.
  const measured = Number(firstText(collect(b, 'measuredHeight')[0]))
  // Ground surface footprint: prefer GroundSurface, else any lowest surface.
  let groundRings = []
  const grounds = collect(b, 'GroundSurface')
  if (grounds.length) {
    groundRings = grounds.flatMap(ringsFromSurface)
  }
  if (!groundRings.length) {
    // Fallback: take the surface with the lowest average Z.
    const surfaces = collect(b, 'Polygon')
    let best = null
    let bestZ = Infinity
    for (const s of surfaces) {
      const rings = ringsFromSurface(s)
      if (!rings.length) continue
      const avgZ =
        rings[0].reduce((a, p) => a + (p[2] || 0), 0) / rings[0].length
      if (avgZ < bestZ) {
        bestZ = avgZ
        best = rings
      }
    }
    if (best) groundRings = best
  }
  if (!groundRings.length || !groundRings[0]?.length) {
    skipped++
    continue
  }

  const exterior = groundRings[0]
  // Height from Z-extent if measuredHeight absent.
  const allZ = collect(b, 'posList')
    .flatMap((n) => parsePosList(firstText(n)))
    .map((p) => p[2])
    .filter((z) => Number.isFinite(z))
  const zMin = allZ.length ? Math.min(...allZ) : 0
  const zMax = allZ.length ? Math.max(...allZ) : 0
  const height = Number.isFinite(measured) && measured > 0 ? measured : Math.max(zMax - zMin, 3)

  // Reproject ring to WGS84, ensure closure.
  const ring = exterior.map(([x, y]) => {
    const [lon, lat] = toWGS84(x, y)
    return [Number(lon.toFixed(7)), Number(lat.toFixed(7))]
  })
  const f = ring[0]
  const l = ring[ring.length - 1]
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  if (ring.length < 4) {
    skipped++
    continue
  }

  // Optional bbox crop around the plan centroid.
  if (bbox) {
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
    const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
    if (cx < bbox[0] || cx > bbox[2] || cy < bbox[1] || cy > bbox[3]) continue
  }

  features.push({
    type: 'Feature',
    properties: { height: Number(height.toFixed(1)) },
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
}

const fc = { type: 'FeatureCollection', features }
writeFileSync(outputPath, JSON.stringify(fc))
const mb = (statSync(outputPath).size / 1e6).toFixed(2)
console.log(
  `Wrote ${features.length} features (${skipped} skipped) → ${outputPath} (${mb} MB)`,
)
if (mb > 10) {
  console.warn(
    '⚠ Over ~10 MB. Re-run with --bbox minLon,minLat,maxLon,maxLat to crop around the plan area.',
  )
}
