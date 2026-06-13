import { useEffect, useState } from 'react'
import type { FeatureCollection, Feature, LineString } from 'geojson'

/**
 * Fetch road centrelines from Overpass API for a bbox around `center`.
 * Returns a GeoJSON FeatureCollection of LineString features (lon/lat),
 * or null on empty/error. Uses `out geom` so geometry is returned inline.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export function useCityRoads(
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
        const delta = 0.003
        const south = lat - delta
        const north = lat + delta
        const west = lon - delta
        const east = lon + delta

        const query = `
[out:json][timeout:15];
way["highway"](${south},${west},${north},${east});
out geom;
`
        const res = await fetch(OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal,
        })
        if (!res.ok) return

        const json = await res.json()
        if (!json?.elements?.length) return

        const features: Feature<LineString>[] = []
        for (const el of json.elements) {
          if (el.type !== 'way' || !el.geometry?.length) continue
          const coords: [number, number][] = el.geometry.map(
            (g: { lon: number; lat: number }) => [g.lon, g.lat],
          )
          if (coords.length < 2) continue
          features.push({
            type: 'Feature',
            properties: { highway: el.tags?.highway ?? '' },
            geometry: { type: 'LineString', coordinates: coords },
          })
        }

        if (!signal.aborted && features.length > 0) {
          // eslint-disable-next-line no-console
          console.info(`[CityRoads] Overpass: ${features.length} roads`)
          setData({ type: 'FeatureCollection', features })
        }
      } catch {
        if (signal.aborted) return
      }
    })()

    return () => { controller.abort() }
  }, [lon, lat])

  return data
}
