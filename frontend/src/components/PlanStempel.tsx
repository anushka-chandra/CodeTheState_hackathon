import type { Verdict } from '../types'

/**
 * The Plan-Stempel — the one theatrical flourish (§5). The overall compliance
 * result rendered as an official stamp block: double hairline border, uppercase
 * Archivo, a slight rotation, teal for PASS / red for FAIL / amber for REVIEW.
 */
export default function PlanStempel({
  verdict,
  violated,
  total,
}: {
  verdict: Verdict
  violated: number
  total: number
}) {
  const color =
    verdict === 'PASS'
      ? 'var(--color-survey-teal)'
      : verdict === 'FAIL'
        ? 'var(--color-parcel-red)'
        : 'var(--color-seal-amber)'

  const headline =
    verdict === 'PASS'
      ? 'Konform'
      : verdict === 'FAIL'
        ? 'Nicht konform'
        : 'Prüfung nötig'

  const sub =
    verdict === 'PASS'
      ? 'All constraints satisfied'
      : `${violated} of ${total} constraints violated`

  return (
    <div className="flex justify-center py-1">
      <div
        className="relative -rotate-[1.5deg] select-none px-6 py-3 text-center"
        style={{ color, border: `2px double ${color}` }}
      >
        <div
          className="pointer-events-none absolute inset-[3px] border"
          style={{ borderColor: color, opacity: 0.5 }}
          aria-hidden
        />
        <span className="block font-display text-[0.55rem] font-semibold uppercase tracking-[0.3em] opacity-70">
          Bebauungsplan · Prüfsiegel
        </span>
        <span className="mt-1 block font-display text-2xl font-extrabold uppercase tracking-[0.14em]">
          {headline}
        </span>
        <span className="mt-1 block font-mono text-[0.65rem] tracking-wide opacity-80">
          {sub}
        </span>
      </div>
    </div>
  )
}
