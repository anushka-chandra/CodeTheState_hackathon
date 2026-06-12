import { useEffect, useState } from 'react'
import type { FeatureCollection } from 'geojson'

/**
 * Fetch the preloaded LoD2 city backdrop once at startup. The file is produced
 * offline by scripts/gml-to-geojson.mjs. If it's missing the viewer simply
 * renders without a backdrop — never a crash (§4.1).
 */
export function useCityBuildings(): FeatureCollection | null {
  const [data, setData] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/city.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json || json.type !== 'FeatureCollection') return
        setData(json as FeatureCollection)
      })
      .catch(() => {
        /* no backdrop — fine */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return data
}
