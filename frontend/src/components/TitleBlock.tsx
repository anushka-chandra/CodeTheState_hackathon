import { useI18n } from '../i18n/I18nContext'
import LanguageSwitcher from './LanguageSwitcher'

/**
 * The application title block — styled like the stamped header of a German
 * technical plan drawing (Planköpfe). Tiny uppercase eyebrow fields with
 * monospaced values beneath, a hard double-rule, and the product wordmark.
 */
export default function TitleBlock() {
  const { t } = useI18n()
  return (
    <header className="border-b border-ink bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
        {/* Wordmark + language switch */}
        <div className="flex items-end gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink"
            aria-hidden
          >
            {/* Tiny plan-house glyph */}
            <svg viewBox="0 0 32 32" className="h-6 w-6">
              <rect x="8" y="14" width="16" height="11" className="fill-parcel-red" />
              <path
                d="M7 14 L16 7 L25 14"
                className="fill-none stroke-survey-teal"
                strokeWidth={1.6}
              />
            </svg>
          </div>
          <div className="leading-none">
            <h1 className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-ink">
              Planraum
            </h1>
            <p className="mt-1 font-body text-[0.7rem] text-ink/60">
              {t('app.tagline')}
            </p>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Title-block fields */}
        <dl className="hidden items-end gap-8 md:flex">
          <Field label={t('title.sheet')} value="B-PLAN / 01" />
          <Field label={t('title.standard')} value="BauNVO · LOD2" />
          <Field label={t('title.crs')} value="EPSG:25832" />
          <Field label={t('title.status')} value={t('title.statusValue')} />
        </dl>
      </div>
    </header>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-l border-grid-line pl-3">
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-xs text-ink">{value}</span>
    </div>
  )
}
