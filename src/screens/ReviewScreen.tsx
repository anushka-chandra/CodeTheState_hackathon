import { useMemo, useState } from 'react'
import { usePlan } from '../state/PlanContext'
import ConfidenceChip from '../components/ConfidenceChip'
import PlanViewer from '../components/PlanViewer'
import type { Constraint, ConstraintKey } from '../types'

const ROOF_OPTIONS = [
  'Satteldach',
  'Walmdach',
  'Flachdach',
  'Pultdach',
  'Zeltdach',
  'Mansarddach',
]

interface ReviewScreenProps {
  onContinue: () => void
}

export default function ReviewScreen({ onContinue }: ReviewScreenProps) {
  const {
    result,
    constraints,
    confirmed,
    planImageUrl,
    updateConstraintValue,
    setConfirmed,
  } = usePlan()

  // Which source region is highlighted, and a tick to re-trigger the flash.
  const [focusedKey, setFocusedKey] = useState<ConstraintKey | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  function focusRegion(key: ConstraintKey) {
    setFocusedKey(key)
    setFocusTick((t) => t + 1)
  }

  // Map original (extracted) values to detect human edits.
  const originals = useMemo(() => {
    const map: Record<string, string | number> = {}
    result?.constraints.forEach((c) => (map[c.key] = c.value))
    return map
  }, [result])

  if (!result) return null

  function isEdited(c: Constraint) {
    return String(c.value) !== String(originals[c.key])
  }
  // A low-confidence row must be edited or explicitly confirmed (§3.3).
  function isResolved(c: Constraint) {
    if (c.confidence !== 'low') return true
    return isEdited(c) || confirmed[c.key] === true
  }

  const lowRows = constraints.filter((c) => c.confidence === 'low')
  const unresolved = constraints.filter((c) => !isResolved(c))
  const canContinue = unresolved.length === 0

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* LEFT — plan document with highlighted source regions */}
      <section className="sheet flex min-h-[420px] flex-col lg:min-h-[72vh]">
        <PaneHeader eyebrow="Source document" title={result.plan.name} />
        {planImageUrl ? (
          <PlanViewer
            imageUrl={planImageUrl}
            constraints={constraints}
            focusedKey={focusedKey}
            focusTick={focusTick}
            onFocus={focusRegion}
          />
        ) : (
          <div className="drafting-grid-faint flex flex-1 items-center justify-center bg-plan-paper p-8">
            <div className="flex max-w-xs flex-col items-center gap-3 text-center">
              <svg viewBox="0 0 48 48" className="h-12 w-12 text-ink/30">
                <rect
                  x="9"
                  y="5"
                  width="30"
                  height="38"
                  className="fill-white stroke-current"
                  strokeWidth={1.5}
                />
                <line x1="14" y1="14" x2="34" y2="14" className="stroke-current" strokeWidth={1} />
                <line x1="14" y1="20" x2="34" y2="20" className="stroke-current" strokeWidth={1} />
                <line x1="14" y1="26" x2="28" y2="26" className="stroke-current" strokeWidth={1} />
              </svg>
              <p className="font-body text-sm text-ink/55">
                No page preview for this upload — constraints are still editable
                on the right.
              </p>
              <p className="font-mono text-[0.65rem] text-ink/40">
                page {result.sourcePage ?? 1} · {result.plan.crs}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* RIGHT — editable constraint sheet */}
      <section className="sheet flex flex-col">
        <PaneHeader
          eyebrow="Human-in-the-loop · verify constraints"
          title="Extracted constraints"
        />

        {/* Column header row */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-ink bg-plan-paper/60 px-4 py-2">
          <span className="eyebrow">Parameter</span>
          <span className="eyebrow text-right">Value · Confidence · Confirm</span>
        </div>

        <ul className="divide-y divide-grid-line">
          {constraints.map((c) => (
            <ConstraintRow
              key={c.key}
              constraint={c}
              edited={isEdited(c)}
              resolved={isResolved(c)}
              confirmed={confirmed[c.key] === true}
              focused={focusedKey === c.key}
              canLocate={!!c.sourceBox && !!planImageUrl}
              onLocate={() => focusRegion(c.key)}
              onValue={(v) => updateConstraintValue(c.key, v)}
              onConfirm={(v) => setConfirmed(c.key, v)}
            />
          ))}
        </ul>

        {/* Footer — confirm gating */}
        <div className="mt-auto border-t border-ink bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-ink/60">
              {lowRows.length === 0 ? (
                <>No low-confidence values flagged.</>
              ) : canContinue ? (
                <span className="text-survey-teal">
                  ✓ All {lowRows.length} low-confidence values resolved.
                </span>
              ) : (
                <span className="text-parcel-red">
                  {unresolved.length} low-confidence value
                  {unresolved.length === 1 ? ' needs' : 's need'} review — edit
                  or confirm.
                </span>
              )}
            </p>
            <button
              type="button"
              disabled={!canContinue}
              onClick={onContinue}
              className={[
                'border px-5 py-2.5 font-display text-[0.7rem] uppercase tracking-[0.16em] transition-colors',
                canContinue
                  ? 'cursor-pointer border-ink bg-survey-teal text-white hover:bg-ink'
                  : 'cursor-not-allowed border-grid-line bg-plan-paper text-ink/35',
              ].join(' ')}
            >
              Confirm all &amp; continue →
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function PaneHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="border-b border-ink px-4 py-3">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-1 truncate font-display text-base font-bold uppercase tracking-[0.1em]">
        {title}
      </h2>
    </div>
  )
}

function ConstraintRow({
  constraint: c,
  edited,
  resolved,
  confirmed,
  focused,
  canLocate,
  onLocate,
  onValue,
  onConfirm,
}: {
  constraint: Constraint
  edited: boolean
  resolved: boolean
  confirmed: boolean
  focused: boolean
  canLocate: boolean
  onLocate: () => void
  onValue: (v: string | number) => void
  onConfirm: (v: boolean) => void
}) {
  const needsAttention = c.confidence === 'low' && !resolved
  const isNumber = typeof c.value === 'number'

  return (
    <li
      className={[
        'grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_auto]',
        focused ? 'bg-seal-amber/[0.07]' : needsAttention ? 'bg-parcel-red/[0.04]' : '',
      ].join(' ')}
    >
      {/* Parameter labels — click to locate the source region */}
      {canLocate ? (
        <button
          type="button"
          onClick={onLocate}
          className="group flex flex-col items-start gap-0.5 text-left"
          title="Locate on plan"
        >
          <span className="flex items-center gap-1.5 font-body text-sm font-semibold text-ink">
            {c.labelDe}
            <svg
              viewBox="0 0 16 16"
              className={[
                'h-3 w-3 transition-colors',
                focused ? 'text-seal-amber' : 'text-survey-teal/50 group-hover:text-survey-teal',
              ].join(' ')}
              aria-hidden
            >
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth={1.5} />
            </svg>
          </span>
          <span className="font-body text-xs text-ink/50">{c.labelEn}</span>
        </button>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="font-body text-sm font-semibold text-ink">
            {c.labelDe}
          </span>
          <span className="font-body text-xs text-ink/50">{c.labelEn}</span>
        </div>
      )}

      {/* Value + chip + confirm */}
      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        {/* Editable value */}
        <div className="flex items-stretch border border-ink">
          {c.key === 'roof_type' ? (
            <select
              value={String(c.value)}
              onChange={(e) => onValue(e.target.value)}
              className="w-36 bg-white px-2 py-1.5 font-mono text-sm text-ink focus:bg-survey-teal/5"
              aria-label={`${c.labelEn} value`}
            >
              {ROOF_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {!ROOF_OPTIONS.includes(String(c.value)) && (
                <option value={String(c.value)}>{String(c.value)}</option>
              )}
            </select>
          ) : (
            <input
              type={isNumber ? 'number' : 'text'}
              inputMode={isNumber ? 'decimal' : 'text'}
              step={isNumber ? '0.1' : undefined}
              value={String(c.value)}
              onChange={(e) =>
                onValue(
                  isNumber && e.target.value !== ''
                    ? Number(e.target.value)
                    : e.target.value,
                )
              }
              className="w-24 bg-white px-2 py-1.5 text-right font-mono text-sm text-ink focus:bg-survey-teal/5"
              aria-label={`${c.labelEn} value`}
            />
          )}
          {c.unit ? (
            <span className="flex items-center border-l border-ink bg-plan-paper px-2 font-mono text-xs text-ink/60">
              {c.unit}
            </span>
          ) : null}
        </div>

        <ConfidenceChip confidence={c.confidence} />

        {/* Confirm toggle */}
        <button
          type="button"
          onClick={() => onConfirm(!confirmed)}
          aria-pressed={confirmed}
          title={confirmed ? 'Confirmed by reviewer' : 'Mark as confirmed'}
          className={[
            'flex h-7 w-7 items-center justify-center border transition-colors',
            confirmed
              ? 'border-survey-teal bg-survey-teal text-white'
              : edited
                ? 'border-survey-teal bg-survey-teal/10 text-survey-teal'
                : 'border-ink bg-white text-transparent hover:bg-plan-paper',
          ].join(' ')}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path
              d="M3 8.5 L6.5 12 L13 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="square"
            />
          </svg>
        </button>
      </div>
    </li>
  )
}
