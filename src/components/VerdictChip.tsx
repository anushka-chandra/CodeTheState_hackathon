import type { Verdict } from '../types'

const STYLES: Record<Verdict, string> = {
  PASS: 'border-survey-teal text-survey-teal bg-survey-teal/8',
  FAIL: 'border-parcel-red text-parcel-red bg-parcel-red/8',
  REVIEW: 'border-seal-amber text-seal-amber bg-seal-amber/10',
}

export default function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center border px-2 py-0.5',
        'font-display text-[0.62rem] font-bold uppercase tracking-[0.16em]',
        STYLES[verdict],
      ].join(' ')}
    >
      {verdict}
    </span>
  )
}
