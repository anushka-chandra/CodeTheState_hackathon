import { useI18n } from '../i18n/I18nContext'
import { LANGS, type Lang } from '../i18n/translations'

/**
 * Segmented EN | DE language toggle, styled like the rest of the plan UI
 * (1px ink border, zero radius, Archivo caps). Sits in the toolbar next to the
 * wordmark. Clicking a segment switches the whole app's language live.
 */
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()

  return (
    <div
      className="flex self-center border border-ink"
      role="group"
      aria-label={t('lang.label')}
    >
      {LANGS.map((l: Lang) => {
        const active = l === lang
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={active}
            className={[
              'px-2 py-1 font-display text-[0.6rem] font-semibold uppercase tracking-[0.14em] transition-colors',
              active
                ? 'bg-survey-teal text-white'
                : 'bg-white text-ink/55 hover:bg-plan-paper hover:text-ink',
              l === 'en' ? 'border-r border-ink' : '',
            ].join(' ')}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}
