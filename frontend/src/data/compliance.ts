import type { Constraint, ComplianceRow, Verdict } from '../types'

/**
 * Pure compliance engine. Given the human-reviewed constraints (the legal
 * "allowed" values) and the planner's proposed "what-if" values, produce one
 * verdict row per parameter. No React, no side effects — re-run on every edit.
 *
 * A constraint whose source confidence is 'low' is downgraded PASS→REVIEW: the
 * building may fit, but the legal value itself wasn't read reliably and a human
 * should verify it against the plan.
 */

function num(v: string | number): number | null {
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Parse a pitch range like "30–45", "30-45", or a single "38". */
function parseRange(v: string | number): { min: number; max: number } | null {
  const s = String(v).replace(/[°\s]/g, '')
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[–-]\s*(-?\d+(?:[.,]\d+)?)$/)
  if (m) {
    const a = num(m[1])
    const b = num(m[2])
    if (a !== null && b !== null) return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  const single = num(s)
  if (single !== null) return { min: single, max: single }
  return null
}

function fmt(v: string | number, unit?: string): string {
  const u = unit ? ` ${unit}` : ''
  return `${v}${u}`
}

function evaluateRow(c: Constraint, proposed: string | number): ComplianceRow {
  const unit = c.unit ?? ''
  let verdict: Verdict = 'PASS'
  let note: string | undefined

  switch (c.key) {
    case 'max_height':
    case 'grz':
    case 'gfz': {
      const allowed = num(c.value)
      const prop = num(proposed)
      if (allowed === null || prop === null) {
        verdict = 'REVIEW'
        note = 'Value not numeric — verify manually.'
        break
      }
      if (prop > allowed) {
        verdict = 'FAIL'
        const delta = +(prop - allowed).toFixed(2)
        note = `exceeds allowed ${fmt(allowed, unit)} by ${fmt(delta, unit)}`
      } else {
        verdict = 'PASS'
        const head = +(allowed - prop).toFixed(2)
        note = head > 0 ? `${fmt(head, unit)} headroom below limit` : 'at limit'
      }
      break
    }

    case 'roof_pitch': {
      const range = parseRange(c.value)
      const prop = num(proposed)
      if (!range || prop === null) {
        verdict = 'REVIEW'
        note = 'Pitch not comparable — verify manually.'
        break
      }
      if (prop < range.min) {
        verdict = 'FAIL'
        note = `below minimum ${range.min}° by ${+(range.min - prop).toFixed(1)}°`
      } else if (prop > range.max) {
        verdict = 'FAIL'
        note = `above maximum ${range.max}° by ${+(prop - range.max).toFixed(1)}°`
      } else {
        verdict = 'PASS'
        note = `within ${range.min}–${range.max}°`
      }
      break
    }

    case 'roof_type': {
      const a = String(c.value).trim().toLowerCase()
      const p = String(proposed).trim().toLowerCase()
      if (a === p) {
        verdict = 'PASS'
        note = `matches required ${c.value}`
      } else {
        verdict = 'FAIL'
        note = `proposed ${proposed} ≠ required ${c.value}`
      }
      break
    }

    case 'floors': {
      const a = String(c.value).trim().toLowerCase()
      const p = String(proposed).trim().toLowerCase()
      if (a === p) {
        verdict = 'PASS'
        note = `matches permitted ${c.value} storeys`
      } else {
        verdict = 'REVIEW'
        note = `proposed ${proposed} vs permitted ${c.value} — manual check`
      }
      break
    }
  }

  // Low-confidence legal value: a clean PASS still needs a human's eye.
  if (verdict === 'PASS' && c.confidence === 'low') {
    verdict = 'REVIEW'
    note = `source value low-confidence — verify ${c.labelDe} against plan`
  }

  return { key: c.key, allowed: c.value, proposed, verdict, note }
}

export function evaluateCompliance(
  constraints: Constraint[],
  proposed: Record<string, string | number>,
): ComplianceRow[] {
  return constraints.map((c) =>
    evaluateRow(c, proposed[c.key] ?? c.value),
  )
}

export interface ComplianceSummary {
  total: number
  pass: number
  fail: number
  review: number
  /** Overall: FAIL if any fail, else REVIEW if any review, else PASS. */
  overall: Verdict
}

export function summarise(rows: ComplianceRow[]): ComplianceSummary {
  const fail = rows.filter((r) => r.verdict === 'FAIL').length
  const review = rows.filter((r) => r.verdict === 'REVIEW').length
  const pass = rows.filter((r) => r.verdict === 'PASS').length
  const overall: Verdict = fail > 0 ? 'FAIL' : review > 0 ? 'REVIEW' : 'PASS'
  return { total: rows.length, pass, fail, review, overall }
}
