import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useI18n } from '../i18n/I18nContext'
import type { Constraint, ConstraintKey } from '../types'

/** Plan dimensions assumed for fitting (example SVG is 1000×707). The image is
 *  letterboxed into the wrapper via object-contain so highlight maths only need
 *  the wrapper rectangle, which shares the image's aspect via padding-bottom. */
const ASPECT = 707 / 1000

interface PlanViewerProps {
  imageUrl: string
  constraints: Constraint[]
  focusedKey: ConstraintKey | null
  /** Bumped each time the human clicks a value, to re-trigger the flash. */
  focusTick: number
  onFocus: (key: ConstraintKey) => void
}

export default function PlanViewer({
  imageUrl,
  constraints,
  focusedKey,
  focusTick,
  onFocus,
}: PlanViewerProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  )

  const boxes = constraints.filter((c) => c.sourceBox)

  // Track container size for centring maths.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clampScale = (s: number) => Math.min(4, Math.max(1, s))

  const reset = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  // When a value is clicked, zoom to and centre its source box.
  useEffect(() => {
    if (!focusedKey || size.w === 0) return
    const c = constraints.find((x) => x.key === focusedKey)
    if (!c?.sourceBox) return
    const { x, y, w, h } = c.sourceBox
    const cx = x + w / 2
    const cy = y + h / 2
    const s = 2
    setScale(s)
    setTx(size.w / 2 - cx * size.w * s)
    setTy(size.h / 2 - cy * size.h * s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick])

  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, tx, ty }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    setTx(drag.current.tx + (e.clientX - drag.current.x))
    setTy(drag.current.ty + (e.clientY - drag.current.y))
  }
  function onPointerUp() {
    drag.current = null
  }

  function zoom(delta: number) {
    setScale((s) => {
      const next = clampScale(s + delta)
      if (next === 1) {
        setTx(0)
        setTy(0)
      }
      return next
    })
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Stage */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-plan-paper"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: scale > 1 ? (drag.current ? 'grabbing' : 'grab') : 'default' }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: '100%',
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
          {/* Aspect-locked wrapper so % boxes line up with the image */}
          <div className="relative w-full" style={{ paddingBottom: `${ASPECT * 100}%` }}>
            <img
              src={imageUrl}
              alt="Bebauungsplan source document"
              className="absolute inset-0 h-full w-full select-none object-contain"
              draggable={false}
            />
            {boxes.map((c) => {
              const b = c.sourceBox!
              const isFocused = focusedKey === c.key
              return (
                <button
                  type="button"
                  key={c.key}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFocus(c.key)
                  }}
                  title={`${c.labelDe}: ${c.value}${c.unit ? ' ' + c.unit : ''}`}
                  className={[
                    'absolute border transition-colors',
                    isFocused
                      ? 'border-seal-amber'
                      : 'border-survey-teal/70 hover:border-survey-teal',
                  ].join(' ')}
                  style={{
                    left: `${b.x * 100}%`,
                    top: `${b.y * 100}%`,
                    width: `${b.w * 100}%`,
                    height: `${b.h * 100}%`,
                    backgroundColor: isFocused
                      ? undefined
                      : 'color-mix(in srgb, var(--color-survey-teal) 8%, transparent)',
                  }}
                >
                  {isFocused && (
                    <span
                      key={focusTick}
                      className="box-flash absolute inset-0"
                      aria-hidden
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center justify-between border-t border-grid-line bg-white px-3 py-2">
        <span className="font-mono text-[0.6rem] text-ink/45">
          {t(
            boxes.length === 1 ? 'planViewer.regionsOne' : 'planViewer.regionsMany',
            { n: boxes.length },
          )}
        </span>
        <div className="flex items-center gap-1">
          <ZoomBtn
            label="−"
            ariaLabel={t('planViewer.zoomOut')}
            onClick={() => zoom(-0.5)}
            disabled={scale <= 1}
          />
          <span className="w-12 text-center font-mono text-[0.65rem] text-ink/60">
            {Math.round(scale * 100)}%
          </span>
          <ZoomBtn
            label="+"
            ariaLabel={t('planViewer.zoomIn')}
            onClick={() => zoom(0.5)}
            disabled={scale >= 4}
          />
          <button
            type="button"
            onClick={reset}
            className="ml-1 border border-ink bg-white px-2 py-1 font-display text-[0.55rem] uppercase tracking-[0.12em] text-ink transition-colors hover:bg-plan-paper"
          >
            {t('planViewer.reset')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ZoomBtn({
  label,
  ariaLabel,
  onClick,
  disabled,
}: {
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex h-7 w-7 items-center justify-center border font-mono text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed border-grid-line text-ink/30'
          : 'border-ink bg-white text-ink hover:bg-plan-paper',
      ].join(' ')}
      aria-label={ariaLabel}
    >
      {label}
    </button>
  )
}
