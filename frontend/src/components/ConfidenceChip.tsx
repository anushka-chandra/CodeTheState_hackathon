import { useI18n } from '../i18n/I18nContext'
import type { Confidence } from '../types'

const BOX: Record<Confidence, string> = {
  high: 'border-survey-teal text-survey-teal bg-survey-teal/8',
  medium: 'border-seal-amber text-seal-amber bg-seal-amber/10',
  low: 'border-parcel-red text-parcel-red bg-parcel-red/8',
}

export default function ConfidenceChip({
  confidence,
  title,
}: {
  confidence: Confidence
  title?: string
}) {
  const { t } = useI18n()
  const label = t(`confidence.${confidence}`)
  return (
    <span
      title={title ?? `${t('confidence.aiConfidence')}: ${label.toLowerCase()}`}
      className={[
        'inline-flex items-center gap-1.5 border px-2 py-0.5',
        'font-display text-[0.6rem] uppercase tracking-[0.14em]',
        BOX[confidence],
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 bg-current" aria-hidden />
      {label}
    </span>
  )
}
