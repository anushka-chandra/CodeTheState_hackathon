import type { FeatureCollection, Polygon } from 'geojson'

export interface ReferenceComparison {
  refHeight: number
  refArea: number
  heightDelta: number
  areaDelta: number
  roofMatch: boolean
  refBuildingId: string | null
}

/**
 * Compare the proposed building against the nearest LOD2 reference building.
 * Returns delta metrics for height, area, and roof type.
 */
export function compareToReference(
  proposed: { footprint: Polygon; heightM: number; roofType: string },
  cityBuildings: FeatureCollection | null | undefined,
): ReferenceComparison | null {
  if (!cityBuildings?.features.length) return null

  // Find centroid of proposed footprint
  const ring = proposed.footprint.coordinates[0]
  if (!ring || ring.length < 4) return null
  let cx = 0, cy = 0
  const n = ring.length - 1
  for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] }
  cx /= n; cy /= n

  // Find nearest city building by centroid distance
  let bestIdx = -1
  let bestDist = Infinity
  for (let i = 0; i < cityBuildings.features.length; i++) {
    const f = cityBuildings.features[i]
    if (f.geometry.type !== 'Polygon') continue
    const fRing = (f.geometry as Polygon).coordinates[0]
    if (!fRing || fRing.length < 4) continue

    let fx = 0, fy = 0
    const fn = fRing.length - 1
    for (let j = 0; j < fn; j++) { fx += fRing[j][0]; fy += fRing[j][1] }
    fx /= fn; fy /= fn

    const d = (fx - cx) ** 2 + (fy - cy) ** 2
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }

  if (bestIdx < 0) return null

  const ref = cityBuildings.features[bestIdx]
  const refProps = ref.properties ?? {}
  const refHeight = typeof refProps.height === 'number' ? refProps.height : 8
  const refRing = (ref.geometry as Polygon).coordinates[0]
  const refArea = polygonAreaSqm(refRing)
  const proposedArea = polygonAreaSqm(ring)

  // Roof heuristic: flat if all heights are within 1m spread, else pitched
  const refRoofFlat = isRoofFlat(refProps)
  const proposedFlat = proposed.roofType === 'flach'
  const roofMatch = refRoofFlat === proposedFlat

  return {
    refHeight,
    refArea,
    heightDelta: proposed.heightM - refHeight,
    areaDelta: proposedArea - refArea,
    roofMatch,
    refBuildingId: refProps.id ?? `ref-${bestIdx}`,
  }
}

function isRoofFlat(props: Record<string, unknown>): boolean {
  // If roofType code is available, check for flat variants
  const code = String(props.roofType ?? props.roofCode ?? '')
  if (code === '1000' || code.toLowerCase().includes('flach')) return true
  if (code === '3100' || code === '3200') return false // pitched codes
  // Default heuristic: assume pitched unless explicitly flat
  return false
}

function polygonAreaSqm(ring: number[][]): number {
  if (ring.length < 4) return 0
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
