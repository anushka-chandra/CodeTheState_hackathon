import { useEffect, useState } from 'react'
import type { Polygon } from 'geojson'

/**
 * Fetch the nearest cadastral parcel from the BW ALKIS WFS around a centroid.
 * Returns the parcel polygon (EPSG:4326), its computed area in sqm, and status.
 */
export function useCadastralParcel(center: { lon: number; lat: number } | undefined) {
  const [parcel, setParcel] = useState<Polygon | null>(null)
  const [parcelArea, setParcelArea] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lon = center?.lon
  const lat = center?.lat

  useEffect(() => {
    if (lon == null || lat == null) return
    // Only query inside Baden-Württemberg
    if (lat < 47.4 || lat > 49.9 || lon < 7.4 || lon > 10.6) return

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const buf = 0.001
        const params = new URLSearchParams({
          SERVICE: 'WFS',
          VERSION: '2.0.0',
          REQUEST: 'GetFeature',
          TYPENAMES: 'cp:CadastralParcel',
          BBOX: `${lat - buf},${lon - buf},${lat + buf},${lon + buf},EPSG:4326`,
          SRSNAME: 'EPSG:4326',
          COUNT: '20',
        })

        const url = `https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_INSP_BW_Flst_ALKIS?${params}`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`WFS ${res.status}`)

        const xml = await res.text()
        const parcels = parseParcels(xml)

        if (parcels.length === 0) {
          setParcel(null)
          setParcelArea(null)
          setLoading(false)
          return
        }

        // Find nearest parcel to centroid
        let best = parcels[0]
        let bestDist = centroidDistance(best, lon, lat)
        for (let i = 1; i < parcels.length; i++) {
          const d = centroidDistance(parcels[i], lon, lat)
          if (d < bestDist) { bestDist = d; best = parcels[i] }
        }

        setParcel(best)
        setParcelArea(polygonAreaSqm(best))
        setLoading(false)
      } catch (e: unknown) {
        if (controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Parcel fetch failed')
        setLoading(false)
      }
    })()

    return () => { controller.abort() }
  }, [lon, lat])

  return { parcel, parcelArea, loading, error }
}

/** Parse GML posList elements from WFS response into Polygon arrays. */
function parseParcels(xml: string): Polygon[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const results: Polygon[] = []

  // Look for gml:posList within CadastralParcel members
  const members = doc.querySelectorAll('member, featureMember')
  if (members.length === 0) {
    // Try namespace-aware approach
    const posLists = doc.getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'posList')
    if (posLists.length === 0) {
      // Also try gml 3.1
      const posLists31 = doc.getElementsByTagNameNS('http://www.opengis.net/gml', 'posList')
      for (let i = 0; i < posLists31.length; i++) {
        const poly = posListToPolygon(posLists31[i].textContent)
        if (poly) results.push(poly)
      }
    } else {
      for (let i = 0; i < posLists.length; i++) {
        const poly = posListToPolygon(posLists[i].textContent)
        if (poly) results.push(poly)
      }
    }
    return results
  }

  for (let i = 0; i < members.length; i++) {
    const posLists = members[i].getElementsByTagNameNS('http://www.opengis.net/gml/3.2', 'posList')
    const posListsFallback = posLists.length > 0
      ? posLists
      : members[i].getElementsByTagNameNS('http://www.opengis.net/gml', 'posList')
    for (let j = 0; j < posListsFallback.length; j++) {
      const poly = posListToPolygon(posListsFallback[j].textContent)
      if (poly) { results.push(poly); break } // one polygon per member
    }
  }

  return results
}

/** Convert a GML posList string (lat lon pairs or lon lat pairs) to a Polygon. */
function posListToPolygon(text: string | null): Polygon | null {
  if (!text) return null
  const nums = text.trim().split(/\s+/).map(Number)
  if (nums.length < 6) return null

  // Determine coordinate order: EPSG:4326 in GML is typically lat,lon
  // Check if first value looks like latitude (roughly 47-50 for BW)
  const ring: [number, number][] = []
  const isLatLon = nums[0] > 40 && nums[0] < 60

  for (let i = 0; i < nums.length - 1; i += 2) {
    if (isLatLon) {
      ring.push([nums[i + 1], nums[i]]) // lon, lat
    } else {
      ring.push([nums[i], nums[i + 1]])
    }
  }

  if (ring.length < 4) return null
  // Ensure closed ring
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]])
  }

  return { type: 'Polygon', coordinates: [ring] }
}

/** Compute centroid of a polygon and return distance to a point. */
function centroidDistance(poly: Polygon, lon: number, lat: number): number {
  const ring = poly.coordinates[0]
  let cx = 0, cy = 0
  for (const [x, y] of ring) { cx += x; cy += y }
  cx /= ring.length; cy /= ring.length
  return (cx - lon) ** 2 + (cy - lat) ** 2
}

/** Compute polygon area in sqm using the shoelace formula with metre projection. */
function polygonAreaSqm(poly: Polygon): number {
  const ring = poly.coordinates[0]
  if (ring.length < 4) return 0

  // Project to metres around centroid
  let cLat = 0
  for (const [, y] of ring) cLat += y
  cLat /= ring.length

  const mPerDegLon = 111320 * Math.cos((cLat * Math.PI) / 180)
  const mPerDegLat = 110540

  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * mPerDegLon
    const y1 = ring[i][1] * mPerDegLat
    const x2 = ring[i + 1][0] * mPerDegLon
    const y2 = ring[i + 1][1] * mPerDegLat
    area += x1 * y2 - x2 * y1
  }

  return Math.abs(area) / 2
}

/**
 * Scale a polygon toward its centroid by a factor.
 * factor < 1 shrinks, factor > 1 grows.
 */
export function scalePolygon(poly: Polygon, factor: number): Polygon {
  const ring = poly.coordinates[0]
  let cx = 0, cy = 0
  // Use all points except closing duplicate
  const n = ring.length - 1
  for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] }
  cx /= n; cy /= n

  const scaled = ring.map(([x, y]) => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ])

  return { type: 'Polygon', coordinates: [scaled] }
}
