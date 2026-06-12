import { useEffect, useState } from 'react'
import type { FeatureCollection, Feature, Polygon } from 'geojson'

/**
 * Fetch city building footprints around a centroid for 3D backdrop rendering.
 *
 * 1. PRIMARY: BW INSPIRE WFS LOD2 — real CityGML 3D building data from
 *    Landesamt für Geoinformation und Landentwicklung Baden-Württemberg.
 *    Open data, no API key required.
 *
 * 2. FALLBACK: Overpass API — OSM building footprints with estimated heights.
 *
 * Returns a GeoJSON FeatureCollection with `height` property per feature.
 */
export function useCityBuildings(
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
      let fc: FeatureCollection | null = null

      // Try BW WFS first if centroid is inside Baden-Württemberg.
      if (isInsideBW(lat, lon)) {
        try {
          fc = await fetchBWWFS(lon, lat, signal)
          if (fc && fc.features.length > 0) {
            // eslint-disable-next-line no-console
            console.info(`[CityBuildings] BW WFS LOD2: ${fc.features.length} buildings`)
          } else {
            fc = null
          }
        } catch {
          if (signal.aborted) return
          fc = null
        }
      }

      // Fallback: Overpass API.
      if (!fc) {
        try {
          fc = await fetchOverpass(lon, lat, signal)
          if (fc) {
            // eslint-disable-next-line no-console
            console.info(`[CityBuildings] Overpass: ${fc.features.length} buildings`)
          }
        } catch {
          if (signal.aborted) return
        }
      }

      if (!signal.aborted && fc && fc.features.length > 0) {
        setData(fc)
      }
    })()

    return () => { controller.abort() }
  }, [lon, lat])

  return data
}

/** Quick geo-fence: is the centroid roughly inside Baden-Württemberg? */
function isInsideBW(lat: number, lon: number): boolean {
  return lat >= 47.4 && lat <= 49.9 && lon >= 7.4 && lon <= 10.6
}

// ── BW INSPIRE WFS LOD2 ─────────────────────────────────────────────────────

const BW_WFS = 'https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_INSP_BW_Gebauede_3D_LoD2'

/**
 * Convert WGS84 lon/lat to approximate EPSG:25832 easting/northing.
 * Good enough for building a BBOX — exact projection not needed.
 */
function toEPSG25832(lon: number, lat: number): [number, number] {
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180
  const lon0Rad = (9 * Math.PI) / 180 // UTM zone 32N central meridian
  const k0 = 0.9996
  const a = 6378137
  const e2 = 0.00669437999014

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2)
  const T = Math.tan(latRad) ** 2
  const C = (e2 / (1 - e2)) * Math.cos(latRad) ** 2
  const A = Math.cos(latRad) * (lonRad - lon0Rad)
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256) * Math.sin(4 * latRad))

  const easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6) + 500000
  const northing = k0 * (M + N * Math.tan(latRad) * ((A ** 2) / 2 + ((5 - T + 9 * C) * A ** 4) / 24))
  return [easting, northing]
}

async function fetchBWWFS(lon: number, lat: number, signal: AbortSignal): Promise<FeatureCollection | null> {
  const [e, n] = toEPSG25832(lon, lat)
  const radius = 300 // metres
  const bbox = `${e - radius},${n - radius},${e + radius},${n + radius},urn:ogc:def:crs:EPSG::25832`

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    REQUEST: 'GetFeature',
    VERSION: '2.0.0',
    TYPENAMES: 'bldg:Building',
    COUNT: '200',
    BBOX: bbox,
    SRSNAME: 'urn:ogc:def:crs:EPSG::4326',
  })

  const res = await fetch(`${BW_WFS}?${params}`, { signal })
  if (!res.ok) return null

  const xml = await res.text()
  return parseCityGMLToGeoJSON(xml)
}

/** Parse CityGML WFS response into GeoJSON FeatureCollection. */
function parseCityGMLToGeoJSON(xml: string): FeatureCollection {
  const features: Feature<Polygon>[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const buildings = doc.getElementsByTagNameNS(
    'http://www.opengis.net/citygml/building/2.0',
    'Building',
  )

  for (let i = 0; i < buildings.length; i++) {
    const bldg = buildings[i]

    // Get measured height.
    const heightEl = bldg.getElementsByTagNameNS(
      'http://www.opengis.net/citygml/building/2.0',
      'measuredHeight',
    )[0]
    const height = heightEl ? parseFloat(heightEl.textContent ?? '') : 8

    // Get roof type code.
    const roofEl = bldg.getElementsByTagNameNS(
      'http://www.opengis.net/citygml/building/2.0',
      'roofType',
    )[0]
    const roofCode = roofEl?.textContent ?? ''

    // Find GroundSurface → posList for the footprint (LOD2).
    // Fallback: for LOD1-only buildings, pick the bottom face from lod1Solid
    // (the polygon where all z-values are at ground elevation).
    const groundSurfaces = bldg.getElementsByTagNameNS(
      'http://www.opengis.net/citygml/building/2.0',
      'GroundSurface',
    )

    let coords3d: number[] | undefined

    if (groundSurfaces.length > 0) {
      const posLists = groundSurfaces[0].getElementsByTagNameNS(
        'http://www.opengis.net/gml',
        'posList',
      )
      if (posLists.length > 0) {
        coords3d = posLists[0].textContent?.trim().split(/\s+/).map(Number)
      }
    }

    // LOD1 fallback: find the polygon with the most points at the lowest z.
    if (!coords3d || coords3d.length < 12) {
      const allPosLists = bldg.getElementsByTagNameNS(
        'http://www.opengis.net/gml',
        'posList',
      )
      let bestRing: number[] | undefined
      let bestMinZ = Infinity
      for (let p = 0; p < allPosLists.length; p++) {
        const raw = allPosLists[p].textContent?.trim().split(/\s+/).map(Number)
        if (!raw || raw.length < 12) continue
        // Check if all z-values are the same (ground or roof face)
        const zVals = new Set<number>()
        for (let k = 2; k < raw.length; k += 3) zVals.add(Math.round(raw[k] * 100))
        if (zVals.size === 1) {
          const z = raw[2]
          if (z < bestMinZ) { bestMinZ = z; bestRing = raw }
        }
      }
      coords3d = bestRing
    }

    if (!coords3d || coords3d.length < 12) continue // need at least 4 3D points

    // posList is lon,lat,z triples (BW WFS returns lon/lat order despite EPSG:4326).
    const ring: [number, number][] = []
    for (let j = 0; j < coords3d.length; j += 3) {
      ring.push([coords3d[j], coords3d[j + 1]])
    }

    if (ring.length < 4) continue

    features.push({
      type: 'Feature',
      properties: {
        height: Number.isFinite(height) ? height : 8,
        roofType: roofCode,
        source: 'BW_WFS_LOD2',
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
  }

  return { type: 'FeatureCollection', features }
}

// ── Overpass API (fallback) ──────────────────────────────────────────────────

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

async function fetchOverpass(lon: number, lat: number, signal: AbortSignal): Promise<FeatureCollection | null> {
  const delta = 0.003
  const south = lat - delta
  const north = lat + delta
  const west = lon - delta
  const east = lon + delta

  const query = `
[out:json][timeout:15];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  })
  if (!res.ok) return null

  const json = await res.json()
  if (!json?.elements) return null
  return osmToGeoJSON(json.elements)
}

function osmToGeoJSON(elements: OsmElement[]): FeatureCollection {
  const nodes = new Map<number, [number, number]>()
  const ways = new Map<number, OsmElement>()

  for (const el of elements) {
    if (el.type === 'node' && el.lon != null && el.lat != null) {
      nodes.set(el.id, [el.lon, el.lat])
    } else if (el.type === 'way' && el.nodes) {
      ways.set(el.id, el)
    }
  }

  const features: Feature<Polygon>[] = []

  for (const el of elements) {
    if (el.type === 'way' && el.tags?.building && el.nodes) {
      const ring = resolveRing(el.nodes, nodes)
      if (ring) features.push(osmFeature(ring, el.tags))
    } else if (el.type === 'relation' && el.tags?.building && el.members) {
      for (const m of el.members) {
        if (m.type === 'way' && m.role === 'outer') {
          const way = ways.get(m.ref)
          if (way?.nodes) {
            const ring = resolveRing(way.nodes, nodes)
            if (ring) features.push(osmFeature(ring, el.tags))
          }
        }
      }
    }
  }

  return { type: 'FeatureCollection', features }
}

function resolveRing(
  nodeIds: number[],
  nodes: Map<number, [number, number]>,
): [number, number][] | null {
  const coords: [number, number][] = []
  for (const id of nodeIds) {
    const c = nodes.get(id)
    if (!c) return null
    coords.push(c)
  }
  return coords.length >= 4 ? coords : null
}

function osmFeature(ring: [number, number][], tags?: Record<string, string>): Feature<Polygon> {
  const h = parseFloat(tags?.height ?? tags?.['building:levels'] ?? '')
  const height = Number.isFinite(h)
    ? tags?.['building:levels'] && !tags?.height ? h * 3 : h
    : 8
  return {
    type: 'Feature',
    properties: { height, source: 'OSM' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lon?: number
  lat?: number
  nodes?: number[]
  tags?: Record<string, string>
  members?: { type: string; ref: number; role: string }[]
}
