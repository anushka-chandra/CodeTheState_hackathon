import { useEffect, useState } from 'react'
import { usePlan } from '../state/PlanContext'
import { useI18n } from '../i18n/I18nContext'
import { EXTRACT_STAGES, runExtraction } from '../data/runExtraction'

interface ExtractScreenProps {
  onDone: () => void
  /** If extraction is somehow reached with no file, bounce back to Upload. */
  onAbort: () => void
}

type StageStatus = 'pending' | 'active' | 'done'

export default function ExtractScreen({ onDone, onAbort }: ExtractScreenProps) {
  const { file, loadResult } = usePlan()
  const { t } = useI18n()
  // -1 = not started; index of the currently active stage otherwise.
  const [active, setActive] = useState(-1)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // No started-once guard: under StrictMode the first run is aborted by the
    // cleanup below, and this effect re-runs fresh. The AbortController makes
    // the aborted run resolve to AbortError (ignored), so exactly one run
    // completes. In production the effect runs once.
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    runExtraction(file, {
      signal: controller.signal,
      onStage: (_stage, index) => setActive(index),
    })
      .then(({ result, cached }) => {
        setActive(EXTRACT_STAGES.length) // all done
        timer = setTimeout(() => {
          // On fallback, show the full bundled example (image + data) so the
          // highlighted regions line up with the cached notice.
          if (cached) {
            loadResult(result, { cached: true, planImageUrl: '/data/example-plan.svg' })
          } else {
            loadResult(result, { cached: false })
          }
          onDone()
        }, 450)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setFailed(true)
      })

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function statusOf(i: number): StageStatus {
    if (i < active) return 'done'
    if (i === active) return 'active'
    return 'pending'
  }

  const done = active >= EXTRACT_STAGES.length

  return (
    <div className="mx-auto max-w-2xl">
      <section className="sheet">
        <div className="border-b border-ink px-5 py-4">
          <span className="eyebrow">{t('extract.eyebrow')}</span>
          <h2 className="mt-1 font-display text-lg font-bold uppercase tracking-[0.1em]">
            {failed
              ? t('extract.stalled')
              : done
                ? t('extract.complete')
                : t('extract.reading')}
          </h2>
          {file && (
            <p className="mt-1 truncate font-mono text-[0.7rem] text-ink/50">
              {file.name}
            </p>
          )}
        </div>

        {failed ? (
          <div className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="max-w-sm font-body text-sm text-ink/70">
              {t('extract.failBody')}
            </p>
            <button
              type="button"
              onClick={onAbort}
              className="border border-ink bg-survey-teal px-5 py-2.5 font-display text-[0.7rem] uppercase tracking-[0.16em] text-white transition-colors hover:bg-ink"
            >
              ← {t('extract.backToUpload')}
            </button>
          </div>
        ) : (
          <ol className="divide-y divide-grid-line">
            {EXTRACT_STAGES.map((stage, i) => {
              const status = statusOf(i)
              return (
                <li
                  key={stage.key}
                  className={[
                    'flex items-center gap-4 px-5 py-4 transition-colors',
                    status === 'active' ? 'bg-survey-teal/[0.05]' : '',
                  ].join(' ')}
                >
                  <StageMark status={status} />
                  <span
                    className={[
                      'flex-1 font-body text-sm',
                      status === 'done'
                        ? 'text-ink/55'
                        : status === 'active'
                          ? 'font-semibold text-ink'
                          : 'text-ink/35',
                    ].join(' ')}
                  >
                    {t(`stage.${stage.key}`)}
                  </span>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
                    {status === 'done'
                      ? t('extract.stageDone')
                      : status === 'active'
                        ? t('extract.stageReading')
                        : t('extract.stageQueued')}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {!failed && (
          <div className="border-t border-ink px-5 py-3">
            <ProgressBar
              value={Math.min(active < 0 ? 0 : active, EXTRACT_STAGES.length)}
              max={EXTRACT_STAGES.length}
            />
          </div>
        )}
      </section>

      <p className="mt-3 text-center font-body text-[0.7rem] text-ink/40">
        {t('extract.footPre')}
        <span className="font-mono">runExtraction()</span>
        {t('extract.footPost')}
      </p>
    </div>
  )
}

function StageMark({ status }: { status: StageStatus }) {
  if (status === 'done') {
    return (
      <span className="flex h-6 w-6 items-center justify-center border border-survey-teal bg-survey-teal text-white">
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
          <path
            d="M3 8.5 L6.5 12 L13 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="square"
          />
        </svg>
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center border border-survey-teal"
        aria-hidden
      >
        <span className="h-2.5 w-2.5 animate-pulse bg-survey-teal" />
      </span>
    )
  }
  return <span className="h-6 w-6 border border-grid-line" aria-hidden />
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 bg-grid-line/50">
        <div
          className="h-full bg-survey-teal transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-[0.65rem] text-ink/55">
        {pct}%
      </span>
    </div>
  )
}
