import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Dev-only Vite plugin that handles /api/extract locally by forwarding to the
 * OpenAI-compatible gateway. This replaces the Vercel serverless function so
 * `npm run dev` works without `vercel dev`.
 */
function localExtractPlugin(): Plugin {
  let apiKey: string
  let baseUrl: string
  let model: string

  return {
    name: 'local-extract-api',
    configureServer(server) {
      // Load env vars from project root (same as envDir: '..')
      const env = loadEnv('development', '..', '')
      apiKey = env.OPENAI_API_KEY || ''
      baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      model = env.OPENAI_MODEL || 'stackit-qwen-qwen3-vl-235b-a22b-instruct-fp8'

      server.middlewares.use('/api/extract', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in .env' }))
          return
        }

        // Read request body
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = JSON.parse(Buffer.concat(chunks).toString())

        const images: string[] = Array.isArray(body?.images)
          ? body.images.filter((s: unknown) => typeof s === 'string').slice(0, 3)
          : []
        if (images.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No page images provided' }))
          return
        }

        try {
          // Call the vision model
          const apiRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              max_tokens: 4000,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: EXTRACT_PROMPT },
                    ...images.map((url: string) => ({
                      type: 'image_url',
                      image_url: { url },
                    })),
                  ],
                },
              ],
            }),
          })

          if (!apiRes.ok) {
            const errText = await apiRes.text()
            console.error('[extract] Gateway error:', apiRes.status, errText)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ detail: `Gateway ${apiRes.status}: ${errText.slice(0, 200)}` }))
            return
          }

          const completion = await apiRes.json() as any
          const content = completion.choices?.[0]?.message?.content ?? ''
          const parsed = JSON.parse(stripFences(content))
          const result = normalise(parsed)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error('[extract]', err?.message ?? err)
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ detail: `Extraction failed: ${err?.message ?? 'Unknown error'}` }))
        }
      })
    },
  }
}

// ── Extraction logic (mirrored from api/extract.ts for local dev) ──────────

const ALLOWED_KEYS = [
  'max_height', 'roof_type', 'roof_pitch', 'grz', 'gfz', 'floors', 'bauweise', 'bezugspunkt',
] as const
type ConstraintKey = (typeof ALLOWED_KEYS)[number]

const DE_LABELS: Record<ConstraintKey, string> = {
  max_height: 'Firsthöhe (FH)', roof_type: 'Dachform', roof_pitch: 'Dachneigung (DN)',
  grz: 'Grundflächenzahl (GRZ)', gfz: 'Geschossflächenzahl (GFZ)', floors: 'Zahl der Vollgeschosse',
  bauweise: 'Bauweise', bezugspunkt: 'Bezugspunkt',
}
const EN_LABELS: Record<ConstraintKey, string> = {
  max_height: 'Max ridge height', roof_type: 'Roof type', roof_pitch: 'Roof pitch',
  grz: 'Lot coverage ratio (GRZ)', gfz: 'Floor-area ratio (GFZ)', floors: 'Number of full storeys',
  bauweise: 'Building method', bezugspunkt: 'Height reference point',
}
const NUMERIC_KEYS = new Set(['max_height', 'grz', 'gfz'])

const EXTRACT_PROMPT = `You are reading a German Bebauungsplan (municipal zoning plan). Extract the binding building constraints:
- Firsthöhe / Gebäudehöhe (max height) -> key "max_height", unit "m"
- Dachform (roof type) -> key "roof_type"
- Dachneigung (roof pitch) -> key "roof_pitch", unit "°"
- GRZ (Grundflächenzahl) -> key "grz"
- GFZ (Geschossflächenzahl) -> key "gfz"
- Vollgeschosse (number of full storeys) -> key "floors"
- Bauweise (open/closed building method) -> key "bauweise"
- Bezugspunkt (height reference point) -> key "bezugspunkt" (only if explicitly stated)

If the plan has multiple zones / Nutzungsschablonen (e.g. WA 1, WA 2), return EACH zone separately with its own values in the "zones" array.

Respond ONLY with a single JSON object matching this schema (no prose, no markdown fences):
{
  "plan": { "name": string, "planNumber": string|null, "municipality": string },
  "zones": [{ "id": string, "name": string, "constraints": [{ "key": string, "labelDe": string, "labelEn": string, "value": string|number, "unit": "m"|"°"|"", "confidence": "high"|"medium"|"low" }] }]
}

Rules:
- The "key" field MUST be exactly one of these tokens: max_height, roof_type, roof_pitch, grz, gfz, floors, bauweise, bezugspunkt.
- Use honest confidence: "high" only if the value is clearly printed; "medium" if legible but ambiguous; "low" if inferred/guessed.
- Omit a constraint entirely if it is not present in the plan (do not invent values).
- Keep numeric values as numbers (e.g. 9.0, not "9,0 m"). Roof pitch ranges may stay as a string like "30-45".
- Always include at least one zone.`

const DEFAULT_CENTER = { lon: 8.135, lat: 48.695 }

function coerceKey(...candidates: unknown[]): ConstraintKey | null {
  for (const c of candidates) {
    const s = String(c ?? '').trim().toLowerCase()
    if (!s) continue
    if ((ALLOWED_KEYS as readonly string[]).includes(s)) return s as ConstraintKey
    if (/first|gebäudeh|max.?height|höhe|trauf/.test(s)) return 'max_height'
    if (/dachform|roof.?type/.test(s)) return 'roof_type'
    if (/dachneig|pitch|neigung/.test(s)) return 'roof_pitch'
    if (/\bgrz\b|grundfläch|lot.?coverage/.test(s)) return 'grz'
    if (/\bgfz\b|geschossfläch|floor.?area/.test(s)) return 'gfz'
    if (/vollgeschoss|geschoss|storey|stories|floors/.test(s)) return 'floors'
    if (/bauweise|building.?method/.test(s)) return 'bauweise'
    if (/bezugspunkt|reference.?point/.test(s)) return 'bezugspunkt'
  }
  return null
}

function pickLabel(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').trim()
  if (!s || (ALLOWED_KEYS as readonly string[]).includes(s.toLowerCase())) return fallback
  return s
}

function normaliseConstraint(raw: any) {
  const key = coerceKey(raw?.key, raw?.labelEn, raw?.labelDe)
  if (!key || raw?.value == null || String(raw.value).trim() === '') return null
  let value: string | number = String(raw.value).trim()
  if (NUMERIC_KEYS.has(key)) {
    const n = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) value = n
  } else if (typeof raw.value === 'number') {
    value = raw.value
  }
  return {
    key,
    labelDe: pickLabel(raw.labelDe, DE_LABELS[key]),
    labelEn: pickLabel(raw.labelEn, EN_LABELS[key]),
    value,
    unit: raw.unit === 'm' || raw.unit === '°' ? raw.unit : '',
    confidence: raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
  }
}

function defaultFootprint(center: { lon: number; lat: number }, grz = 0.4) {
  const buildingArea = Math.max(grz, 0.05) * 600
  const widthM = Math.sqrt(buildingArea * 1.3)
  const depthM = buildingArea / widthM
  const mPerDegLon = 111320 * Math.cos((center.lat * Math.PI) / 180)
  const hw = (widthM / 2) / mPerDegLon
  const hh = (depthM / 2) / 110540
  return {
    type: 'Polygon' as const,
    coordinates: [[
      [center.lon - hw, center.lat - hh], [center.lon + hw, center.lat - hh],
      [center.lon + hw, center.lat + hh], [center.lon - hw, center.lat + hh],
      [center.lon - hw, center.lat - hh],
    ]],
  }
}

function normalise(raw: any) {
  const center = raw?.plan?.centroidWGS84?.lon != null && raw?.plan?.centroidWGS84?.lat != null
    ? { lon: raw.plan.centroidWGS84.lon, lat: raw.plan.centroidWGS84.lat }
    : DEFAULT_CENTER

  let rawZones: any[] = Array.isArray(raw?.zones) ? raw.zones : []
  if (rawZones.length === 0 && Array.isArray(raw?.constraints)) {
    rawZones = [{ id: 'zone-1', name: 'Plangebiet', constraints: raw.constraints }]
  }

  const zones = rawZones.map((z: any, i: number) => {
    const seen = new Set<string>()
    const constraints = (Array.isArray(z?.constraints) ? z.constraints : [])
      .map(normaliseConstraint).filter(Boolean)
      .filter((c: any) => { if (seen.has(c.key)) return false; seen.add(c.key); return true })
    return {
      id: String(z?.id ?? `zone-${i + 1}`),
      name: String(z?.name ?? `Zone ${i + 1}`),
      constraints,
      footprint: z?.footprint?.coordinates ? z.footprint : undefined,
    }
  }).filter((z: any) => z.constraints.length > 0)

  if (zones.length === 0) throw new Error('No constraints extracted')

  const grzC = zones[0].constraints.find((c: any) => c.key === 'grz')
  const grzVal = typeof grzC?.value === 'number' ? grzC.value : 0.4

  return {
    plan: {
      name: String(raw?.plan?.name ?? 'Bebauungsplan'),
      planNumber: raw?.plan?.planNumber ? String(raw.plan.planNumber) : undefined,
      municipality: String(raw?.plan?.municipality ?? ''),
      crs: 'EPSG:25832',
      centroidWGS84: center,
    },
    constraints: zones[0].constraints,
    footprint: zones[0].footprint ?? raw?.footprint?.coordinates ? raw.footprint : defaultFootprint(center, grzVal),
    zones,
    sourcePage: 1,
  }
}

function stripFences(text: string): string {
  let t = text.trim()
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) t = fence[1].trim()
  if (!t.startsWith('{')) {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start !== -1 && end > start) t = t.slice(start, end + 1)
  }
  return t
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localExtractPlugin()],
  envDir: '..',
})
