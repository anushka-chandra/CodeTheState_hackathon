import type { Confidence } from '../types'

const STYLES: Record<Confidence, { box: string; label: string }> = {
  high: {
    box: 'border-survey-teal text-survey-teal bg-survey-teal/8',
    label: 'High',
  },
  medium: {
    box: 'border-seal-amber text-seal-amber bg-seal-amber/10',
    label: 'Medium',
  },
  low: {
    box: 'border-parcel-red text-parcel-red bg-parcel-red/8',
    label: 'Low',
  },
}

export default function ConfidenceChip({
  confidence,
  title,
}: {
  confidence: Confidence
  title?: string
}) {
  const s = STYLES[confidence]
  return (
    <span
      title={title ?? `AI confidence: ${s.label.toLowerCase()}`}
      className={[
        'inline-flex items-center gap-1.5 border px-2 py-0.5',
        'font-display text-[0.6rem] uppercase tracking-[0.14em]',
        s.box,
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 bg-current" aria-hidden />
      {s.label}
    </span>
  )
}
