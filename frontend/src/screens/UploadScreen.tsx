import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlan } from '../state/PlanContext'
import { mockExtraction } from '../data/mockExtraction'
import {
  ACCEPT_ATTR,
  formatBytes,
  isAcceptedFile,
  parsePlanNumber,
} from '../data/file'
import { renderPdfThumbnail } from '../data/pdfThumbnail'

interface UploadScreenProps {
  /** A real file is staged → run extraction. */
  onExtract: () => void
  /** Demo safety net → straight to Review with mock data. */
  onUseExample: () => void
}

const EXAMPLE_IMG = '/data/example-plan.svg'

export default function UploadScreen({
  onExtract,
  onUseExample,
}: UploadScreenProps) {
  const { file, setFile, setPlanImageUrl, loadResult } = usePlan()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [thumbState, setThumbState] = useState<'idle' | 'loading' | 'placeholder'>(
    'idle',
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => revokeObjectUrl, [revokeObjectUrl])

  const acceptFile = useCallback(
    async (f: File) => {
      setError(null)
      if (!isAcceptedFile(f)) {
        setError(
          `"${f.name}" isn't a supported plan. Use a PDF, PNG, JPG or TIFF export.`,
        )
        return
      }
      setFile(f)
      setThumb(null)
      revokeObjectUrl()

      const isPdf = f.name.toLowerCase().endsWith('.pdf')
      const isTiff = /\.(tif|tiff)$/i.test(f.name)

      if (isPdf) {
        setThumbState('loading')
        const url = await renderPdfThumbnail(f)
        if (url) {
          setThumb(url)
          setThumbState('idle')
          setPlanImageUrl(url)
        } else {
          setThumbState('placeholder')
          setPlanImageUrl(null)
        }
      } else if (isTiff) {
        // Browsers can't reliably display TIFF — keep a styled placeholder.
        setThumbState('placeholder')
        setPlanImageUrl(null)
      } else {
        const url = URL.createObjectURL(f)
        objectUrlRef.current = url
        setThumb(url)
        setThumbState('idle')
        setPlanImageUrl(url)
      }
    },
    [revokeObjectUrl, setFile, setPlanImageUrl],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) void acceptFile(f)
    },
    [acceptFile],
  )

  function useExample() {
    loadResult(mockExtraction, { planImageUrl: EXAMPLE_IMG })
    onUseExample()
  }

  const planNumber = file ? parsePlanNumber(file.name) : undefined

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* Drop zone */}
      <section className="sheet flex flex-col">
        <div className="border-b border-ink px-4 py-3">
          <span className="eyebrow">Step 01 — Upload Bebauungsplan</span>
          <h2 className="mt-1 font-display text-base font-bold uppercase tracking-[0.1em]">
            Add a plan to read
          </h2>
        </div>

        <div className="p-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a plan file here or click to browse"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={[
              'drafting-grid-faint relative flex min-h-[340px] cursor-pointer flex-col items-center justify-center gap-4 border-2 border-dashed p-8 text-center transition-colors',
              dragging
                ? 'border-survey-teal bg-survey-teal/[0.06]'
                : 'border-ink/40 bg-plan-paper hover:border-ink/70',
            ].join(' ')}
          >
            {/* Corner ticks — like a plan sheet registration mark */}
            <CornerTicks />

            <svg viewBox="0 0 48 48" className="h-12 w-12 text-ink/50" aria-hidden>
              <rect
                x="10"
                y="6"
                width="28"
                height="36"
                className="fill-white stroke-current"
                strokeWidth={1.5}
              />
              <path
                d="M24 16 v14 M18 22 l6 -6 l6 6"
                className="stroke-survey-teal"
                strokeWidth={2}
                fill="none"
                strokeLinecap="square"
              />
            </svg>
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Drop plan here
              </p>
              <p className="mt-1 font-body text-xs text-ink/55">
                or click to browse · PDF, PNG, JPG, TIFF
              </p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void acceptFile(f)
                e.target.value = ''
              }}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 border border-parcel-red bg-parcel-red/[0.06] px-3 py-2 font-mono text-xs text-parcel-red"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-grid-line pt-3">
            <p className="font-body text-xs text-ink/50">
              No plan handy? Walk the demo with a real Bühl-style sheet.
            </p>
            <button
              type="button"
              onClick={useExample}
              className="font-display text-[0.65rem] uppercase tracking-[0.14em] text-survey-teal underline decoration-survey-teal/40 underline-offset-4 hover:decoration-survey-teal"
            >
              Use example plan →
            </button>
          </div>
        </div>
      </section>

      {/* File card */}
      <section className="sheet flex flex-col">
        <div className="border-b border-ink px-4 py-3">
          <span className="eyebrow">Staged document</span>
          <h2 className="mt-1 font-display text-base font-bold uppercase tracking-[0.1em]">
            {file ? 'Ready to read' : 'Nothing staged'}
          </h2>
        </div>

        {!file ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="h-16 w-12 border border-dashed border-grid-line" aria-hidden />
            <p className="font-body text-xs text-ink/45">
              Your uploaded plan will preview here.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="flex gap-4 p-4">
              {/* Thumbnail */}
              <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden border border-ink bg-plan-paper">
                {thumbState === 'loading' ? (
                  <span className="font-mono text-[0.6rem] text-ink/45">
                    rendering…
                  </span>
                ) : thumb ? (
                  <img
                    src={thumb}
                    alt={`Preview of ${file.name}`}
                    className="h-full w-full object-cover object-top"
                    onError={() => {
                      setThumb(null)
                      setThumbState('placeholder')
                    }}
                  />
                ) : (
                  <PlaceholderThumb ext={file.name.split('.').pop() ?? ''} />
                )}
              </div>

              {/* Meta */}
              <dl className="flex min-w-0 flex-col gap-2">
                <Meta label="Filename" value={file.name} mono break />
                <Meta label="Size" value={formatBytes(file.size)} mono />
                <Meta
                  label="Plan no."
                  value={planNumber ?? 'not detected'}
                  mono
                  muted={!planNumber}
                />
                <Meta
                  label="Type"
                  value={(file.name.split('.').pop() ?? '').toUpperCase()}
                  mono
                />
              </dl>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink px-4 py-4">
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setThumb(null)
                  setThumbState('idle')
                  setPlanImageUrl(null)
                  revokeObjectUrl()
                }}
                className="border border-ink bg-white px-3 py-2 font-display text-[0.62rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-plan-paper"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={onExtract}
                className="border border-ink bg-survey-teal px-5 py-2 font-display text-[0.65rem] uppercase tracking-[0.14em] text-white transition-colors hover:bg-ink"
              >
                Read this plan →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Meta({
  label,
  value,
  mono,
  muted,
  break: brk,
}: {
  label: string
  value: string
  mono?: boolean
  muted?: boolean
  break?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow">{label}</dt>
      <dd
        className={[
          mono ? 'font-mono' : 'font-body',
          'text-xs',
          muted ? 'text-ink/40' : 'text-ink',
          brk ? 'break-all' : 'truncate',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function PlaceholderThumb({ ext }: { ext: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 32 40" className="h-12 w-10 text-ink/40" aria-hidden>
        <rect
          x="3"
          y="2"
          width="26"
          height="36"
          className="fill-white stroke-current"
          strokeWidth={1.4}
        />
        <line x1="8" y1="12" x2="24" y2="12" className="stroke-current" strokeWidth={1} />
        <line x1="8" y1="18" x2="24" y2="18" className="stroke-current" strokeWidth={1} />
        <line x1="8" y1="24" x2="18" y2="24" className="stroke-current" strokeWidth={1} />
      </svg>
      <span className="font-mono text-[0.55rem] uppercase text-ink/45">
        .{ext}
      </span>
    </div>
  )
}

function CornerTicks() {
  const base = 'absolute h-3 w-3 border-ink/40'
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t`} aria-hidden />
      <span className={`${base} right-2 top-2 border-r border-t`} aria-hidden />
      <span className={`${base} bottom-2 left-2 border-b border-l`} aria-hidden />
      <span className={`${base} bottom-2 right-2 border-b border-r`} aria-hidden />
    </>
  )
}
