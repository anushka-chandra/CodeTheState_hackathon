import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type {
  Confidence,
  Constraint,
  ConstraintKey,
  ExtractionResult,
  PlanZone,
} from '../frontend/src/types'

/**
 * PLANRAUM extraction — Vercel serverless function.
 *
 * Receives the plan as base64 page images, asks a vision model (via the
 * OpenAI-compatible gateway) to read the German Bebauungsplan, and returns a
 * normalised ExtractionResult. The contract lives in frontend/src/types.ts;
 * we import it (type-only) so there is one source of truth.
 *
 * Secrets come ONLY from env vars (OPENAI_API_KEY / OPENAI_BASE_URL /
 * OPENAI_MODEL) — never the client bundle, never logged.
 */

// ── Defaults (used only to keep the 3D viewer valid; the demo's value is the
//    extracted constraints, not exact geocoding the model can't infer). ──────
const DEFAULT_CENTER = { lon: 8.135, lat: 48.695 } // Bühl
const MAX_PAGES = 3

const ALLOWED_KEYS: ConstraintKey[] = [
  'max_height',
  'roof_type',
  'roof_pitch',
  'grz',
  'gfz',
  'floors',
  'bauweise',
  'bezugspunkt',
]

const NUMERIC_KEYS = new Set<ConstraintKey>(['max_height', 'grz', 'gfz'])

const DE_LABELS: Record<ConstraintKey, string> = {
  max_height: 'Firsthöhe (FH)',
  roof_type: 'Dachform',
  roof_pitch: 'Dachneigung (DN)',
  grz: 'Grundflächenzahl (GRZ)',
  gfz: 'Geschossflächenzahl (GFZ)',
  floors: 'Zahl der Vollgeschosse',
  bauweise: 'Bauweise',
  bezugspunkt: 'Bezugspunkt',
}
const EN_LABELS: Record<ConstraintKey, string> = {
  max_height: 'Max ridge height',
  roof_type: 'Roof type',
  roof_pitch: 'Roof pitch',
  grz: 'Lot coverage ratio (GRZ)',
  gfz: 'Floor-area ratio (GFZ)',
  floors: 'Number of full storeys',
  bauweise: 'Building method',
  bezugspunkt: 'Height reference point',
}

/** Map any string the model used (German term, enum token, English label) to a
 *  ConstraintKey — vision models sometimes swap `key` and `labelEn`. */
function coerceKey(...candidates: unknown[]): ConstraintKey | null {
  for (const c of candidates) {
    const s = String(c ?? '').trim().toLowerCase()
    if (!s) continue
    if ((ALLOWED_KEYS as string[]).includes(s)) return s as ConstraintKey
    if (/first|gebäudeh|geb\.h|max.?height|höhe|trauf/.test(s)) return 'max_height'
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

/** Prefer a human label, but reject enum tokens the model may have put there. */
function pickLabel(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return fallback
  if ((ALLOWED_KEYS as string[]).includes(s.toLowerCase())) return fallback
  return s
}

function sanitizeBaseUrl(raw: string | undefined): string {
  return (raw || 'https://api.openai.com/v1')
    .trim()
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .replace(/\/$/, '')
}

const SCHEMA_HINT = `{
  "plan": {
    "name": string,                 // plan title, e.g. "Bebauungsplan 'Obere Au'"
    "planNumber": string|null,      // plan number if printed
    "municipality": string          // city/Gemeinde
  },
  "zones": [                        // one entry per Nutzungsschablone/zone
    {
      "id": string,                 // short stable id, e.g. "wa1"
      "name": string,               // zone label, e.g. "WA 1"
      "constraints": [
        {
          "key": "max_height"|"roof_type"|"roof_pitch"|"grz"|"gfz"|"floors"|"bauweise"|"bezugspunkt",
          "labelDe": string,        // German term as printed, e.g. "Firsthöhe (FH)"
          "labelEn": string,        // short English label, e.g. "Max ridge height"
          "value": string|number,   // numeric for max_height/grz/gfz; string otherwise
          "unit": "m"|"°"|"",       // measurement unit or empty string
          "confidence": "high"|"medium"|"low"
        }
      ]
    }
  ]
}`

const PROMPT = `You are reading a German Bebauungsplan (municipal zoning plan). Extract the binding building constraints:
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
${SCHEMA_HINT}

Rules:
- The "key" field MUST be exactly one of these tokens: max_height, roof_type, roof_pitch, grz, gfz, floors, bauweise, bezugspunkt. Never put the German word in "key" — that belongs in "labelDe".
- Use honest confidence: "high" only if the value is clearly printed; "medium" if legible but ambiguous; "low" if inferred/guessed.
- Omit a constraint entirely if it is not present in the plan (do not invent values).
- Keep numeric values as numbers (e.g. 9.0, not "9,0 m"). Roof pitch ranges may stay as a string like "30-45".
- Always include at least one zone.`

// ── Normalisation: make the model output a valid ExtractionResult ───────────
function toConfidence(v: unknown): Confidence {
  return v === 'high' || v === 'low' ? v : 'medium'
}

function toUnit(v: unknown): Constraint['unit'] {
  return v === 'm' || v === '°' ? v : ''
}

function normaliseValue(key: ConstraintKey, raw: unknown): string | number {
  if (typeof raw === 'number') return raw
  const s = String(raw ?? '').trim()
  if (NUMERIC_KEYS.has(key)) {
    const n = Number(s.replace(',', '.').replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return s
}

function normaliseConstraint(raw: any): Constraint | null {
  const key = coerceKey(raw?.key, raw?.labelEn, raw?.labelDe)
  if (!key) return null
  if (raw?.value == null || String(raw.value).trim() === '') return null
  return {
    key,
    labelDe: pickLabel(raw.labelDe, DE_LABELS[key]),
    labelEn: pickLabel(raw.labelEn, EN_LABELS[key]),
    value: normaliseValue(key, raw.value),
    unit: toUnit(raw.unit),
    confidence: toConfidence(raw.confidence),
  }
}

function defaultFootprint(center: { lon: number; lat: number }) {
  const hw = 0.000136
  const hh = 0.0000629
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [center.lon - hw, center.lat - hh],
        [center.lon + hw, center.lat - hh],
        [center.lon + hw, center.lat + hh],
        [center.lon - hw, center.lat + hh],
        [center.lon - hw, center.lat - hh],
      ],
    ],
  }
}

function normalise(raw: any): ExtractionResult {
  const center =
    raw?.plan?.centroidWGS84 &&
    Number.isFinite(raw.plan.centroidWGS84.lon) &&
    Number.isFinite(raw.plan.centroidWGS84.lat)
      ? { lon: raw.plan.centroidWGS84.lon, lat: raw.plan.centroidWGS84.lat }
      : DEFAULT_CENTER

  const footprint = raw?.footprint?.coordinates
    ? raw.footprint
    : defaultFootprint(center)

  // Zones: from model, else wrap top-level constraints into one zone.
  let rawZones: any[] = Array.isArray(raw?.zones) ? raw.zones : []
  if (rawZones.length === 0 && Array.isArray(raw?.constraints)) {
    rawZones = [{ id: 'zone-1', name: 'Plangebiet', constraints: raw.constraints }]
  }

  const zones: PlanZone[] = rawZones
    .map((z: any, i: number) => {
      const seen = new Set<string>()
      const constraints = ((Array.isArray(z?.constraints) ? z.constraints : [])
        .map(normaliseConstraint)
        .filter(Boolean) as Constraint[]).filter((c) => {
        if (seen.has(c.key)) return false // keep first per key
        seen.add(c.key)
        return true
      })
      return {
        id: String(z?.id ?? `zone-${i + 1}`),
        name: String(z?.name ?? `Zone ${i + 1}`),
        constraints,
        footprint: z?.footprint?.coordinates ? z.footprint : undefined,
      }
    })
    .filter((z: PlanZone) => z.constraints.length > 0)

  if (zones.length === 0) {
    // Nothing usable extracted — treat as a failure so the caller falls back.
    throw new Error('No constraints extracted')
  }

  return {
    plan: {
      name: String(raw?.plan?.name ?? 'Bebauungsplan'),
      planNumber: raw?.plan?.planNumber ? String(raw.plan.planNumber) : undefined,
      municipality: String(raw?.plan?.municipality ?? ''),
      crs: 'EPSG:25832',
      centroidWGS84: center,
    },
    constraints: zones[0].constraints,
    footprint: zones[0].footprint ?? footprint,
    zones,
    sourcePage: 1,
  }
}

function stripFences(text: string): string {
  let t = text.trim()
  // Remove ```json ... ``` or ``` ... ``` fences if present.
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) t = fence[1].trim()
  // If there's leading prose, grab the first {...} block.
  if (!t.startsWith('{')) {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start !== -1 && end > start) t = t.slice(start, end + 1)
  }
  return t
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Server not configured' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const images: string[] = Array.isArray(body?.images)
      ? body.images.filter((s: unknown) => typeof s === 'string').slice(0, MAX_PAGES)
      : []
    if (images.length === 0) {
      res.status(400).json({ error: 'No page images provided' })
      return
    }

    const client = new OpenAI({
      apiKey,
      baseURL: sanitizeBaseUrl(process.env.OPENAI_BASE_URL),
    })
    const model =
      process.env.OPENAI_MODEL || 'stackit-qwen-qwen3-vl-235b-a22b-instruct-fp8'

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            ...images.map((url) => ({
              type: 'image_url' as const,
              image_url: { url },
            })),
          ],
        },
      ],
    })

    const content = completion.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(stripFences(content))
    const result = normalise(parsed)

    res.status(200).json(result)
  } catch (err) {
    // Do not leak details (which could include prompt/keys). Generic message;
    // the frontend treats any non-200 as a signal to show the cached example.
    res.status(502).json({ error: 'Extraction failed' })
  }
}
