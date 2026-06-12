import { lazy, Suspense, useState } from 'react'
import type { Viewer3DProps } from './Viewer3D.types'
import Viewer3DPlaceholder from './Viewer3DPlaceholder'

// MapLibre is heavy — load it only when the map mode is actually shown.
const MapLibreViewer = lazy(() => import('./MapLibreViewer'))

type Mode = 'map' | 'schematic'

/**
 * The viewer slot. Defaults to the real MapLibre fill-extrusion map; if it can't
 * initialise (no WebGL / offline / style failure) it auto-falls back to the
 * schematic placeholder. A toggle lets the presenter switch deliberately —
 * the schematic is the guaranteed-safe demo path.
 */
export default function Viewer3D(props: Viewer3DProps) {
  const [mode, setMode] = useState<Mode>('map')
  const [mapFailed, setMapFailed] = useState(false)

  const showMap = mode === 'map' && !mapFailed

  return (
    <div className="relative h-full w-full">
      {showMap ? (
        <Suspense fallback={<ViewerLoading />}>
          <MapLibreViewer
            {...props}
            onError={() => {
              setMapFailed(true)
              setMode('schematic')
            }}
          />
        </Suspense>
      ) : (
        <Viewer3DPlaceholder {...props} />
      )}

      {/* Mode toggle */}
      <div className="absolute right-3 top-3 z-10 flex border border-white/20 bg-black/40 backdrop-blur-sm">
        <ModeButton
          active={showMap}
          disabled={mapFailed}
          onClick={() => {
            setMapFailed(false)
            setMode('map')
          }}
          label="3D Map"
        />
        <ModeButton
          active={!showMap}
          onClick={() => setMode('schematic')}
          label="Schematic"
        />
      </div>

      {mapFailed && (
        <p className="absolute bottom-12 right-3 z-10 max-w-[55%] border border-seal-amber/50 bg-black/50 px-2 py-1 text-right font-mono text-[0.55rem] text-seal-amber backdrop-blur-sm">
          Map unavailable — showing schematic.
        </p>
      )}
    </div>
  )
}

function ModeButton({
  active,
  disabled,
  onClick,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-2.5 py-1 font-display text-[0.55rem] uppercase tracking-[0.12em] transition-colors',
        active
          ? 'bg-survey-teal text-white'
          : disabled
            ? 'cursor-not-allowed text-white/25'
            : 'text-white/60 hover:text-white',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ViewerLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#15171A]">
      <span className="font-mono text-[0.65rem] text-white/45">
        loading 3D map…
      </span>
    </div>
  )
}
