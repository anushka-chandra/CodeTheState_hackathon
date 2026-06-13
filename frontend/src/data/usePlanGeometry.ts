import { useEffect, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import { toEPSG25832 } from './useCityBuildings'

/**
 * Fetch XPlanung plan boundary / Baufenster polygons from the BW landesweit WFS.
 *
 * Tries feature types in precision order (best → least precise):
 *   1. BP_UeberbaubareGrundstuecksFlaeche  (Baufenster)
 *   2. BP_BaugebietsTeilFlaeche            (Baugebiet)
 *   3. BP_Bereich                          (plan sub-area)
 *   4. BP_Plan                             (Geltungsbereich)
 *
 * Returns the first type that yields features with geometry.
 * On any error returns null → caller falls back to geometric heuristic.
 *
 * Calls the WFS directly (open data, no key required) using the same
 * AbortController pattern as useCityBuildings. The api/xplan.ts proxy is
 * available for Vercel production or municipal WFS endpoints with CORS issues.
 */

const XPLAN_WFS =
  'https://www.geoportal-raumordnung-bw.de/ows/services/org.1.e1abbdc5-f886-406b-b3f7-64fe9152d024_wfs'

const FEATURE_TYPES = [
  'xplan:BP_UeberbaubareGrundstuecksFlaeche',
  'xplan:BP_BaugebietsTeilFlaeche',
  'xplan:BP_Bereich',
  'xplan:BP_Plan',
]

const RADIUS_M = 600

export function usePlanGeometry(
  center: { lon: number; lat: number } | undefined,
): FeatureCollection | null {
  const [data, setData] = useState<FeatureCollection | null>(null)
  const lon = center?.lon
  const lat = center?.lat

  useEffect(() => {
    if (lon == null || lat == null) return
    const controller = new AbortController()
    const { signal } = controller

    ;(async () => {
      try {
        const [e, n] = toEPSG25832(lon, lat)
        const bbox = `${e - RADIUS_M},${n - RADIUS_M},${e + RADIUS_M},${n + RADIUS_M},urn:ogc:def:crs:EPSG::25832`

        for (const typeName of FEATURE_TYPES) {
          if (signal.aborted) return
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

            const res = await fetch(`${XPLAN_WFS}?${params}`, { signal })
            if (!res.ok) continue

            const ct = res.headers.get('content-type') ?? ''
            if (!ct.includes('json')) continue

            const fc = (await res.json()) as FeatureCollection
            if (fc?.type !== 'FeatureCollection' || !fc.features?.length)
              continue

            const withGeom = fc.features.filter((f) => f.geometry != null)
            if (withGeom.length > 0) {
              const result: FeatureCollection = {
                type: 'FeatureCollection',
                features: withGeom,
              }
              // eslint-disable-next-line no-console
              console.info(
                `[PlanGeometry] ${typeName}: ${withGeom.length} features`,
              )
              if (!signal.aborted) setData(result)
              return
            }
          } catch {
            if (signal.aborted) return
            // Try next feature type
          }
        }
        // No features from any type → null triggers fallback
      } catch {
        // Total failure → null triggers fallback
      }
    })()

    return () => {
      controller.abort()
    }
  }, [lon, lat])

  return data
}
