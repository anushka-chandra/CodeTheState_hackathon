import type { Polygon, Feature, FeatureCollection } from 'geojson'
import type { RoofType } from '../types'

/**
 * Number of stacked extrusion slices used to approximate the roof slope.
 * More slices = smoother roof at the cost of more draw calls.
 */
const ROOF_SLICES = 5

/**
 * Generate a multi-part GeoJSON FeatureCollection that represents a building
 * with walls + roof as separate fill-extrusion features.
 *
 * LOD2 approximation: MapLibre fill-extrusion only renders flat-topped
 * polygons. We approximate sloped roofs by stacking multiple progressively
 * inset extrusion slices from eave to ridge. Each slice is narrower than the
 * one below, creating a stepped-pyramid effect that reads as a pitched roof.
 *
 *   - Flachdach  (flat):       wall box + thin parapet slab
 *   - Satteldach (gabled):     wall + slices inset on the short sides only
 *   - Walmdach   (hipped):     wall + slices inset on all four sides
 *   - Pultdach   (mono-pitch): wall + slices shift toward one side
 */
export function buildProposedFeatures(
  footprint: Polygon,
  heightM: number,
  roofType: RoofType,
  roofPitchDeg: number,
  compliant: boolean,
  rotationDeg = 0,
): FeatureCollection {
  const ring = footprint.coordinates[0]
  if (!ring || ring.length < 4) {
    return rotateFC(singleBox(footprint, heightM, compliant), footprint, rotationDeg)
  }

  const bbox = getBBox(ring)

  if (roofType === 'flach') {
    return rotateFC(flatRoof(footprint, bbox, heightM, compliant), footprint, rotationDeg)
  }

  // Compute eave vs ridge heights from pitch.
  const spanM = Math.min(bbox.widthM, bbox.heightM)
  const pitchRad = (Math.min(roofPitchDeg, 60) * Math.PI) / 180
  const roofRise = (spanM / 2) * Math.tan(pitchRad)
  const clampedRise = Math.min(roofRise, heightM * 0.55)
  const eaveH = Math.max(heightM - clampedRise, heightM * 0.4)
  const ridgeH = heightM

  const features: Feature[] = []

  // Wall body: ground to eave.
  features.push(makeFeature(footprint, 0, eaveH, 'wall', compliant))

  // Roof slices: eave to ridge. Default to gable (Satteldach) for unknown.
  if (roofType === 'walm') {
    addHippedSlices(features, bbox, eaveH, ridgeH, compliant)
  } else if (roofType === 'pult') {
    addPultSlices(features, bbox, eaveH, ridgeH, compliant)
  } else {
    // sattel + unknown → gable (most common German roof shape)
    addGableSlices(features, bbox, eaveH, ridgeH, compliant)
  }

  return rotateFC({ type: 'FeatureCollection', features }, footprint, rotationDeg)
}

// ── Roof generators ──────────────────────────────────────────────────────────

/** Satteldach: inset only on the short sides, creating a ridge line. */
function addGableSlices(
  features: Feature[],
  bbox: BBox,
  eaveH: number,
  ridgeH: number,
  compliant: boolean,
) {
  for (let i = 0; i < ROOF_SLICES; i++) {
    const t0 = i / ROOF_SLICES
    const t1 = (i + 1) / ROOF_SLICES
    const base = eaveH + (ridgeH - eaveH) * t0
    const top = eaveH + (ridgeH - eaveH) * t1

    // Inset fraction on the short axis: 0 at eave, ~0.48 at ridge.
    const insetFrac = t1 * 0.48

    let poly: number[][]
    if (bbox.longAxisIsEW) {
      // Short axis is N-S → inset latitude.
      const dLat = (bbox.maxLat - bbox.minLat) * insetFrac
      poly = [
        [bbox.minLon, bbox.minLat + dLat],
        [bbox.maxLon, bbox.minLat + dLat],
        [bbox.maxLon, bbox.maxLat - dLat],
        [bbox.minLon, bbox.maxLat - dLat],
        [bbox.minLon, bbox.minLat + dLat],
      ]
    } else {
      // Short axis is E-W → inset longitude.
      const dLon = (bbox.maxLon - bbox.minLon) * insetFrac
      poly = [
        [bbox.minLon + dLon, bbox.minLat],
        [bbox.maxLon - dLon, bbox.minLat],
        [bbox.maxLon - dLon, bbox.maxLat],
        [bbox.minLon + dLon, bbox.maxLat],
        [bbox.minLon + dLon, bbox.minLat],
      ]
    }

    features.push(makeFeature(
      { type: 'Polygon', coordinates: [poly] },
      base, top, 'roof', compliant,
    ))
  }
}

/** Walmdach: inset uniformly on all four sides. */
function addHippedSlices(
  features: Feature[],
  bbox: BBox,
  eaveH: number,
  ridgeH: number,
  compliant: boolean,
) {
  for (let i = 0; i < ROOF_SLICES; i++) {
    const t0 = i / ROOF_SLICES
    const t1 = (i + 1) / ROOF_SLICES
    const base = eaveH + (ridgeH - eaveH) * t0
    const top = eaveH + (ridgeH - eaveH) * t1

    const insetFrac = t1 * 0.45
    const dLon = (bbox.maxLon - bbox.minLon) * insetFrac
    const dLat = (bbox.maxLat - bbox.minLat) * insetFrac

    const poly = [
      [bbox.minLon + dLon, bbox.minLat + dLat],
      [bbox.maxLon - dLon, bbox.minLat + dLat],
      [bbox.maxLon - dLon, bbox.maxLat - dLat],
      [bbox.minLon + dLon, bbox.maxLat - dLat],
      [bbox.minLon + dLon, bbox.minLat + dLat],
    ]

    features.push(makeFeature(
      { type: 'Polygon', coordinates: [poly] },
      base, top, 'roof', compliant,
    ))
  }
}

/** Pultdach: one side stays fixed, opposite insets progressively. */
function addPultSlices(
  features: Feature[],
  bbox: BBox,
  eaveH: number,
  ridgeH: number,
  compliant: boolean,
) {
  for (let i = 0; i < ROOF_SLICES; i++) {
    const t0 = i / ROOF_SLICES
    const t1 = (i + 1) / ROOF_SLICES
    const base = eaveH + (ridgeH - eaveH) * t0
    const top = eaveH + (ridgeH - eaveH) * t1

    const insetFrac = t1 * 0.9 // one side goes almost all the way

    let poly: number[][]
    if (bbox.longAxisIsEW) {
      // South side fixed, north side moves south.
      const dLat = (bbox.maxLat - bbox.minLat) * insetFrac
      poly = [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.minLat],
        [bbox.maxLon, bbox.maxLat - dLat],
        [bbox.minLon, bbox.maxLat - dLat],
        [bbox.minLon, bbox.minLat],
      ]
    } else {
      // West side fixed, east side moves west.
      const dLon = (bbox.maxLon - bbox.minLon) * insetFrac
      poly = [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon - dLon, bbox.minLat],
        [bbox.maxLon - dLon, bbox.maxLat],
        [bbox.minLon, bbox.maxLat],
        [bbox.minLon, bbox.minLat],
      ]
    }

    features.push(makeFeature(
      { type: 'Polygon', coordinates: [poly] },
      base, top, 'roof', compliant,
    ))
  }
}

/** Flat roof: box with a thin parapet slab on top. */
function flatRoof(
  footprint: Polygon,
  bbox: BBox,
  heightM: number,
  compliant: boolean,
): FeatureCollection {
  const features: Feature[] = [
    makeFeature(footprint, 0, heightM, 'wall', compliant),
  ]

  // Thin parapet edge (0.3 m).
  const parapetH = 0.3
  const insetLon = (bbox.maxLon - bbox.minLon) * 0.05
  const insetLat = (bbox.maxLat - bbox.minLat) * 0.05
  const inner = [
    [bbox.minLon + insetLon, bbox.minLat + insetLat],
    [bbox.maxLon - insetLon, bbox.minLat + insetLat],
    [bbox.maxLon - insetLon, bbox.maxLat - insetLat],
    [bbox.minLon + insetLon, bbox.maxLat - insetLat],
    [bbox.minLon + insetLon, bbox.minLat + insetLat],
  ]
  features.push(makeFeature(
    { type: 'Polygon', coordinates: [inner] },
    heightM, heightM + parapetH, 'roof', compliant,
  ))

  return { type: 'FeatureCollection', features }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function singleBox(footprint: Polygon, heightM: number, compliant: boolean): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [makeFeature(footprint, 0, Math.max(heightM, 0.5), 'wall', compliant)],
  }
}

function makeFeature(
  geometry: Polygon,
  base: number,
  height: number,
  part: 'wall' | 'roof',
  compliant: boolean,
): Feature {
  return {
    type: 'Feature',
    properties: { part, height, base, compliant },
    geometry,
  }
}

interface BBox {
  minLon: number; maxLon: number
  minLat: number; maxLat: number
  widthM: number; heightM: number
  longAxisIsEW: boolean
}

/** Rotate every polygon vertex of a FeatureCollection about the footprint
 *  centroid by `deg` degrees, in local metres (so walls + roof stay rigid). */
function rotateFC(fc: FeatureCollection, footprint: Polygon, deg: number): FeatureCollection {
  if (!deg) return fc
  const ring = footprint.coordinates[0]
  let cx = 0, cy = 0
  const n = ring.length - 1
  for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] }
  cx /= n; cy /= n
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const mPerDegLon = 111320 * Math.cos((cy * Math.PI) / 180)
  const mPerDegLat = 110540
  const rot = ([x, y]: number[]): number[] => {
    const dx = (x - cx) * mPerDegLon
    const dy = (y - cy) * mPerDegLat
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    return [cx + rx / mPerDegLon, cy + ry / mPerDegLat]
  }
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) =>
      f.geometry.type === 'Polygon'
        ? { ...f, geometry: { type: 'Polygon', coordinates: f.geometry.coordinates.map((r) => r.map(rot)) } }
        : f,
    ),
  }
}

function getBBox(ring: number[][]): BBox {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const centerLat = (minLat + maxLat) / 2
  const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)
  const mPerDegLat = 110540
  const widthM = (maxLon - minLon) * mPerDegLon
  const heightM = (maxLat - minLat) * mPerDegLat
  return {
    minLon, maxLon, minLat, maxLat,
    widthM, heightM,
    longAxisIsEW: widthM >= heightM,
  }
}
