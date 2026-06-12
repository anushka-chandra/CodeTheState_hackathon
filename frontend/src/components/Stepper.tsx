import { useI18n } from '../i18n/I18nContext'

export type Step = 'upload' | 'extract' | 'review' | 'compliance'

export const STEPS: { key: Step; n: string }[] = [
  { key: 'upload', n: '01' },
  { key: 'extract', n: '02' },
  { key: 'review', n: '03' },
  { key: 'compliance', n: '04' },
]

interface StepperProps {
  current: Step
  /** Steps the user is allowed to jump back to (already-visited). */
  reachable: Set<Step>
  onNavigate: (step: Step) => void
}

export default function Stepper({ current, reachable, onNavigate }: StepperProps) {
  const { t } = useI18n()
  const currentIdx = STEPS.findIndex((s) => s.key === current)

  return (
    <nav aria-label="Workflow steps" className="w-full">
      {/* Full stepper — hidden below sm, replaced by dots */}
      <ol className="hidden items-stretch sm:flex">
        {STEPS.map((s, i) => {
          const state =
            i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo'
          const canClick = reachable.has(s.key) && s.key !== current
          return (
            <li key={s.key} className="flex flex-1 items-stretch">
              <button
                type="button"
                disabled={!canClick}
                onClick={() => canClick && onNavigate(s.key)}
                className={[
                  'group flex w-full items-center gap-3 border-y border-l border-ink px-4 py-3 text-left transition-colors',
                  i === STEPS.length - 1 ? 'border-r' : '',
                  state === 'active'
                    ? 'bg-survey-teal text-white'
                    : state === 'done'
                      ? 'bg-white text-ink hover:bg-plan-paper'
                      : 'bg-white text-ink/45',
                  canClick ? 'cursor-pointer' : 'cursor-default',
                ].join(' ')}
              >
                <span
                  className={[
                    'font-mono text-xs',
                    state === 'active' ? 'text-white/80' : 'text-ink/40',
                  ].join(' ')}
                >
                  {s.n}
                </span>
                <span className="flex flex-col">
                  <span
                    className={[
                      'font-display text-[0.7rem] uppercase tracking-[0.16em]',
                      state === 'todo' ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    {t(`step.${s.key}`)}
                  </span>
                  <span
                    className={[
                      'font-mono text-[0.6rem]',
                      state === 'active' ? 'text-white/70' : 'text-ink/35',
                    ].join(' ')}
                  >
                    {state === 'done'
                      ? t('step.complete')
                      : state === 'active'
                        ? t('step.inProgress')
                        : t('step.pending')}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Collapsed dots — below sm (quality floor: responsive to 380px) */}
      <ol className="flex items-center justify-center gap-3 sm:hidden">
        {STEPS.map((s, i) => {
          const state =
            i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo'
          return (
            <li key={s.key} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={[
                    'h-3 w-3 border border-ink',
                    state === 'active'
                      ? 'bg-survey-teal'
                      : state === 'done'
                        ? 'bg-ink'
                        : 'bg-white',
                  ].join(' ')}
                  aria-current={state === 'active' ? 'step' : undefined}
                />
                {state === 'active' && (
                  <span className="font-display text-[0.55rem] uppercase tracking-[0.12em]">
                    {t(`step.${s.key}`)}
                  </span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <span className="h-px w-4 bg-grid-line" aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
