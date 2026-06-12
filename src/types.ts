import type { Polygon } from 'geojson'

/** Keys for every constraint PLANRAUM extracts from a Bebauungsplan. */
export type ConstraintKey =
  | 'max_height'
  | 'roof_type'
  | 'roof_pitch'
  | 'grz'
  | 'gfz'
  | 'floors'

export type Confidence = 'high' | 'medium' | 'low'

export type Verdict = 'PASS' | 'FAIL' | 'REVIEW'

export type RoofType = 'flach' | 'sattel' | 'walm' | 'pult' | 'unknown'

/** A single legally-binding constraint pulled from the plan. */
export interface Constraint {
  key: ConstraintKey
  /** German term as printed in the plan, e.g. "Firsthöhe (FH)". */
  labelDe: string
  /** Plain-language English label, e.g. "Max ridge height". */
  labelEn: string
  /** Extracted value — number for measurements, string for categoricals. */
  value: string | number
  unit?: 'm' | '°' | ''
  confidence: Confidence
  /** Normalised (0–1) bounding box of the source region in the plan image. */
  sourceBox?: { page: number; x: number; y: number; w: number; h: number }
}

/** The full structured result of reading one plan. */
export interface ExtractionResult {
  plan: {
    name: string
    planNumber?: string
    municipality: string
    crs: 'EPSG:25832'
    centroidWGS84: { lon: number; lat: number }
  }
  constraints: Constraint[]
  /** Baufenster (buildable footprint) — EPSG:4326 after conversion. */
  footprint: Polygon
  sourcePage?: number
}

/** One row of the live compliance check on the 3D screen. */
export interface ComplianceRow {
  key: ConstraintKey
  allowed: string | number
  proposed: string | number
  verdict: Verdict
  /** Plain-words gap, e.g. "exceeds allowed 9.0 m by 2.4 m". */
  note?: string
}
