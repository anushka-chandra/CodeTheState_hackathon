import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * PLANRAUM XPlanung WFS proxy — Vercel serverless function.
 *
 * Proxies XPlanung WFS GetFeature requests to the configured BW service,
 * auto-detecting the most precise available feature type.
 *
 * Always returns HTTP 200 with a GeoJSON FeatureCollection (possibly empty)
 * so failures never crash the frontend.
 */

const DEFAULT_WFS =
  'https://www.geoportal-raumordnung-bw.de/ows/services/org.1.e1abbdc5-f886-406b-b3f7-64fe9152d024_wfs'

/** Feature types in precision order — first that returns geometry wins. */
const FEATURE_TYPES = [
  'xplan:BP_UeberbaubareGrundstuecksFlaeche',
  'xplan:BP_BaugebietsTeilFlaeche',
  'xplan:BP_Bereich',
  'xplan:BP_Plan',
]

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')

  try {
    if (req.method !== 'POST') {
      res.status(200).json(EMPTY_FC)
      return
    }

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
    const bbox = String(body.bbox ?? '')
    const wfsUrl = String(
      body.wfsUrl ?? process.env.XPLAN_WFS_URL ?? DEFAULT_WFS,
    )

    if (!bbox) {
      res.status(200).json(EMPTY_FC)
      return
    }

    for (const typeName of FEATURE_TYPES) {
      try {
        const params = new URLSearchParams({
          SERVICE: 'WFS',
          VERSION: '2.0.0',
          REQUEST: 'GetFeature',
          TYPENAMES: typeName,
          COUNT: '50',
          OUTPUTFORMAT: 'application/geo+json',
          BBOX: bbox,
        })

        const wfsRes = await fetch(`${wfsUrl}?${params}`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (!wfsRes.ok) continue

        const ct = wfsRes.headers.get('content-type') ?? ''
        if (!ct.includes('json')) continue

        const fc = (await wfsRes.json()) as {
          type?: string
          features?: { geometry?: unknown }[]
        }
        if (fc?.type !== 'FeatureCollection' || !fc.features?.length) continue

        const withGeom = fc.features.filter(
          (f: { geometry?: unknown }) => f.geometry != null,
        )
        if (withGeom.length > 0) {
          res
            .status(200)
            .json({ type: 'FeatureCollection', features: withGeom })
          return
        }
      } catch {
        /* try next feature type */
      }
    }

    res.status(200).json(EMPTY_FC)
  } catch {
    res.status(200).json(EMPTY_FC)
  }
}
