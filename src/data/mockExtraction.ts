import type { ExtractionResult } from '../types'

/**
 * Mock extraction for a realistic Bühl-style Bebauungsplan.
 *
 * This is the hackathon safety net: the entire frontend is demo-able from this
 * object before any backend exists. The backend will later replace ONLY the
 * body of `runExtraction()` in src/data/runExtraction.ts — this shape is the
 * contract. Proposed defaults on the compliance screen are tuned so the demo
 * always shows exactly one deliberate FAIL (max height).
 */

// A small rectangular Baufenster (~20 m × 14 m) centred near Bühl.
// Centroid: lon 8.135, lat 48.695.  Already in EPSG:4326.
const CENTER = { lon: 8.135, lat: 48.695 }
const HALF_W = 0.000136 // ≈ 10 m east-west at this latitude
const HALF_H = 0.0000629 // ≈ 7 m north-south

export const mockExtraction: ExtractionResult = {
  plan: {
    name: "Bebauungsplan 'Obere Au', Stadt Bühl",
    planNumber: 'B-PLAN 2024-07',
    municipality: 'Stadt Bühl',
    crs: 'EPSG:25832',
    centroidWGS84: CENTER,
  },
  sourcePage: 1,
  constraints: [
    {
      key: 'max_height',
      labelDe: 'Firsthöhe (FH)',
      labelEn: 'Max ridge height',
      value: 9.0,
      unit: 'm',
      confidence: 'high',
      sourceBox: { page: 1, x: 0.6, y: 0.297, w: 0.32, h: 0.051 },
    },
    {
      key: 'roof_type',
      labelDe: 'Dachform',
      labelEn: 'Roof type',
      value: 'Satteldach',
      unit: '',
      confidence: 'high',
      sourceBox: { page: 1, x: 0.6, y: 0.376, w: 0.32, h: 0.051 },
    },
    {
      key: 'roof_pitch',
      labelDe: 'Dachneigung (DN)',
      labelEn: 'Roof pitch',
      value: '30–45',
      unit: '°',
      confidence: 'medium',
      sourceBox: { page: 1, x: 0.6, y: 0.452, w: 0.32, h: 0.051 },
    },
    {
      key: 'grz',
      labelDe: 'Grundflächenzahl (GRZ)',
      labelEn: 'Lot coverage ratio',
      value: 0.4,
      unit: '',
      confidence: 'high',
      sourceBox: { page: 1, x: 0.12, y: 0.704, w: 0.3, h: 0.04 },
    },
    {
      key: 'gfz',
      labelDe: 'Geschossflächenzahl (GFZ)',
      labelEn: 'Floor-area ratio',
      value: 0.8,
      unit: '',
      confidence: 'low',
      sourceBox: { page: 1, x: 0.12, y: 0.756, w: 0.3, h: 0.04 },
    },
    {
      key: 'floors',
      labelDe: 'Zahl der Vollgeschosse',
      labelEn: 'Number of full storeys',
      value: 'II',
      unit: '',
      confidence: 'medium',
      sourceBox: { page: 1, x: 0.12, y: 0.809, w: 0.3, h: 0.04 },
    },
  ],
  footprint: {
    type: 'Polygon',
    coordinates: [
      [
        [CENTER.lon - HALF_W, CENTER.lat - HALF_H],
        [CENTER.lon + HALF_W, CENTER.lat - HALF_H],
        [CENTER.lon + HALF_W, CENTER.lat + HALF_H],
        [CENTER.lon - HALF_W, CENTER.lat + HALF_H],
        [CENTER.lon - HALF_W, CENTER.lat - HALF_H],
      ],
    ],
  },
}
