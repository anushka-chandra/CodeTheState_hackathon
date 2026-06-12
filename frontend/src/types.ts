import type { Polygon } from 'geojson'

/** Keys for every constraint PLANRAUM extracts from a Bebauungsplan. */
export type ConstraintKey =
  | 'max_height'
  | 'roof_type'
  | 'roof_pitch'
  | 'grz'
  | 'gfz'
  | 'floors'
  | 'bauweise'
  | 'bezugspunkt'

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

/**
 * One zone of a plan — a Bebauungsplan often carries several
 * Nutzungsschablonen (e.g. WA 1, WA 2), each with its own binding values.
 */
export interface PlanZone {
  /** Stable id used for selection in the UI. */
  id: string
  /** Human label, e.g. "WA 1" or "Nutzungsschablone 1". */
  name: string
  /** This zone's binding constraints. */
  constraints: Constraint[]
  /** Optional buildable footprint for this zone (EPSG:4326). */
  footprint?: Polygon
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
  /**
   * The active zone's constraints. When `zones` has more than one entry this
   * mirrors the selected (default: first) zone, so single-zone consumers keep
   * working unchanged.
   */
  constraints: Constraint[]
  /** Baufenster (buildable footprint) — EPSG:4326 after conversion. */
  footprint: Polygon
  /**
   * Every zone the plan defines. Present (length ≥ 1) on live extractions;
   * when more than one, the Review screen lets the user pick which zone the
   * compliance check uses. Omitted/length-1 plans behave exactly as before.
   */
  zones?: PlanZone[]
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
