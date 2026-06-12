import { useMemo } from 'react'
import { usePlan } from '../state/PlanContext'
import { useI18n } from '../i18n/I18nContext'
import { evaluateCompliance, summarise } from '../data/compliance'
import { roofTypeFromLabel } from '../data/roof'
import { useCityBuildings } from '../data/useCityBuildings'
import Viewer3D from '../viewer/Viewer3D'
import VerdictChip from '../components/VerdictChip'
import PlanStempel from '../components/PlanStempel'
import type { ComplianceRow, Constraint } from '../types'

const ROOF_OPTIONS = ['Satteldach', 'Walmdach', 'Flachdach', 'Pultdach', 'Zeltdach']

function toNum(v: string | number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

export default function ComplianceScreen() {
  const { result, constraints, proposed, updateProposed } = usePlan()
  const { t, lang } = useI18n()
  const cityBuildings = useCityBuildings()

  const rows = useMemo(
    () => evaluateCompliance(constraints, proposed, lang),
    [constraints, proposed, lang],
  )
  const summary = useMemo(() => summarise(rows), [rows])

  if (!result) return null

  const proposedBuilding = {
    footprint: result.footprint,
    heightM: toNum(proposed['max_height'] ?? 9, 9),
    roofType: roofTypeFromLabel(proposed['roof_type'] ?? 'unknown'),
    roofPitchDeg: toNum(proposed['roof_pitch'] ?? 38, 38),
    compliant: summary.fail === 0,
  }

  const byKey: Record<string, ComplianceRow> = {}
  rows.forEach((r) => (byKey[r.key] = r))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
      {/* LEFT — 3D viewer slot (~65%) */}
      <section className="sheet flex min-h-[420px] flex-col lg:min-h-[70vh]">
        <div className="flex items-center justify-between border-b border-ink px-4 py-3">
          <div>
            <span className="eyebrow">{t('compliance.view')}</span>
            <h2 className="mt-1 font-display text-base font-bold uppercase tracking-[0.1em]">
              {result.plan.municipality}
            </h2>
          </div>
          <div className="flex items-center gap-3 font-mono text-[0.6rem] text-ink/55">
            <Legend color="#C2362B" label={t('compliance.legendProposed')} />
            <Legend color="#8d8d8d" label={t('compliance.legendExisting')} />
          </div>
        </div>
        <div className="flex-1">
          <Viewer3D
            center={result.plan.centroidWGS84}
            cityBuildings={cityBuildings ?? undefined}
            proposed={proposedBuilding}
          />
        </div>
        <div className="border-t border-grid-line px-4 py-2 font-mono text-[0.6rem] text-ink/45">
          {t('compliance.centroidWord')} {result.plan.centroidWGS84.lon.toFixed(4)},{' '}
          {result.plan.centroidWGS84.lat.toFixed(4)} · {t('compliance.sourceWord')}{' '}
          {result.plan.crs}
        </div>
      </section>

      {/* RIGHT — compliance report (~35%) */}
      <section className="sheet flex flex-col">
        <div className="flex items-center justify-between border-b border-ink px-4 py-3">
          <div>
            <span className="eyebrow">{t('compliance.report')}</span>
            <h2 className="mt-1 font-display text-base font-bold uppercase tracking-[0.1em]">
              {t('compliance.baunvo')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="border border-ink bg-white px-3 py-1.5 font-display text-[0.6rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-plan-paper"
          >
            {t('compliance.export')}
          </button>
        </div>

        {/* Plan-Stempel */}
        <div className="border-b border-grid-line bg-plan-paper/40 py-3">
          <PlanStempel
            verdict={summary.overall}
            violated={summary.fail}
            total={summary.total}
          />
        </div>

        {/* Overall verdict banner */}
        <div
          className={[
            'flex items-center justify-between gap-2 border-b px-4 py-2.5',
            summary.fail > 0
              ? 'border-parcel-red/40 bg-parcel-red/[0.06] text-parcel-red'
              : summary.review > 0
                ? 'border-seal-amber/40 bg-seal-amber/[0.06] text-seal-amber'
                : 'border-survey-teal/40 bg-survey-teal/[0.06] text-survey-teal',
          ].join(' ')}
        >
          <span className="font-display text-[0.7rem] font-bold uppercase tracking-[0.14em]">
            {summary.fail > 0
              ? t('compliance.violated', {
                  fail: summary.fail,
                  total: summary.total,
                })
              : summary.review > 0
                ? t(
                    summary.review === 1
                      ? 'compliance.needReviewOne'
                      : 'compliance.needReviewMany',
                    { n: summary.review },
                  )
                : t('compliance.allSatisfied')}
          </span>
          <span className="font-mono text-[0.65rem]">
            {summary.pass}✓ · {summary.review}? · {summary.fail}✗
          </span>
        </div>

        {/* Per-parameter rows */}
        <ul className="divide-y divide-grid-line">
          {constraints.map((c) => (
            <ComplianceRowItem
              key={c.key}
              constraint={c}
              row={byKey[c.key]}
              proposed={proposed[c.key] ?? c.value}
              onProposed={(v) => updateProposed(c.key, v)}
              t={t}
            />
          ))}
        </ul>

        <p className="mt-auto border-t border-grid-line px-4 py-3 font-body text-[0.7rem] text-ink/45">
          {t('compliance.editHint')}
        </p>
      </section>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

function ComplianceRowItem({
  constraint: c,
  row,
  proposed,
  onProposed,
  t,
}: {
  constraint: Constraint
  row: ComplianceRow | undefined
  proposed: string | number
  onProposed: (v: string | number) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  if (!row) return null
  const isNumber = typeof c.value === 'number' || c.key === 'roof_pitch'
  const fail = row.verdict === 'FAIL'

  return (
    <li
      className={[
        'px-4 py-3',
        fail ? 'bg-parcel-red/[0.04]' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-body text-sm font-semibold">
            {c.labelDe}
          </span>
          <span className="font-body text-[0.7rem] text-ink/50">{c.labelEn}</span>
        </div>
        <VerdictChip verdict={row.verdict} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {/* Allowed (read-only) */}
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{t('compliance.allowed')}</span>
          <div className="flex items-stretch border border-grid-line bg-plan-paper/40">
            <span className="w-full px-2 py-1.5 text-right font-mono text-sm text-ink/70">
              {c.value}
            </span>
            {c.unit ? (
              <span className="flex items-center border-l border-grid-line px-2 font-mono text-xs text-ink/45">
                {c.unit}
              </span>
            ) : null}
          </div>
        </div>

        {/* Proposed (editable) */}
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{t('compliance.proposed')}</span>
          <div
            className={[
              'flex items-stretch border',
              fail ? 'border-parcel-red' : 'border-ink',
            ].join(' ')}
          >
            {c.key === 'roof_type' ? (
              <select
                value={String(proposed)}
                onChange={(e) => onProposed(e.target.value)}
                className="w-full bg-white px-2 py-1.5 font-mono text-sm focus:bg-survey-teal/5"
                aria-label={`Proposed ${c.labelEn}`}
              >
                {ROOF_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {!ROOF_OPTIONS.includes(String(proposed)) && (
                  <option value={String(proposed)}>{String(proposed)}</option>
                )}
              </select>
            ) : (
              <input
                type={isNumber ? 'number' : 'text'}
                inputMode={isNumber ? 'decimal' : 'text'}
                step={isNumber ? '0.1' : undefined}
                value={String(proposed)}
                onChange={(e) =>
                  onProposed(
                    isNumber && e.target.value !== ''
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
                className="w-full bg-white px-2 py-1.5 text-right font-mono text-sm focus:bg-survey-teal/5"
                aria-label={`Proposed ${c.labelEn}`}
              />
            )}
            {c.unit ? (
              <span className="flex items-center border-l border-current/20 bg-plan-paper px-2 font-mono text-xs text-ink/55">
                {c.unit}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Plain-words note (deltas for FAIL) */}
      {row.note && (
        <p
          className={[
            'mt-1.5 font-mono text-[0.68rem]',
            fail
              ? 'text-parcel-red'
              : row.verdict === 'REVIEW'
                ? 'text-seal-amber'
                : 'text-ink/45',
          ].join(' ')}
        >
          {fail ? '✗ ' : row.verdict === 'REVIEW' ? '? ' : '✓ '}
          {row.note}
        </p>
      )}
    </li>
  )
}
