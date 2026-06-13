import { useEffect, useMemo } from 'react'
import { useI18n } from '../i18n/I18nContext'
import type { Viewer3DProps } from './Viewer3D.types'

/**
 * Visual placeholder that fully honours the Viewer3DProps interface. It renders
 * a dark drafting panel with an isometric ground grid and the proposed building
 * extruded to `heightM`, coloured by compliance (parcel-red when non-compliant,
 * a warmer amber-red when compliant). A clearly-styled note marks where the real
 * MapLibre / Cesium canvas will mount. It must read as intentional, not broken.
 */

const ISO_COS = Math.cos(Math.PI / 6) // 0.866
const ISO_SIN = Math.sin(Math.PI / 6) // 0.5

type Pt = { x: number; y: number } // screen-space (pre-fit)

// Project a point in local metres (mx east, my north, mz up) to iso screen space.
function iso(mx: number, my: number, mz: number): Pt {
  return {
    x: (mx - my) * ISO_COS,
    y: (mx + my) * ISO_SIN - mz,
  }
}

// Convert a lon/lat ring to local metres relative to its own centroid.
function ringToMetres(
  ring: number[][],
  lat0: number,
): { pts: { mx: number; my: number }[]; w: number; d: number } {
  const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const mPerLat = 110540
  // centroid
  let clon = 0
  let clat = 0
  const n = ring.length - 1 // last repeats first
  for (let i = 0; i < n; i++) {
    clon += ring[i][0]
    clat += ring[i][1]
  }
  clon /= n
  clat /= n
  const pts = ring.slice(0, n).map(([lon, lat]) => ({
    mx: (lon - clon) * mPerLon,
    my: (lat - clat) * mPerLat,
  }))
  const xs = pts.map((p) => p.mx)
  const ys = pts.map((p) => p.my)
  return {
    pts,
    w: Math.max(...xs) - Math.min(...xs),
    d: Math.max(...ys) - Math.min(...ys),
  }
}

export default function Viewer3DPlaceholder({
  proposed,
  cityBuildings,
  onReady,
}: Viewer3DProps) {
  const { t } = useI18n()
  useEffect(() => {
    onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cityCount = cityBuildings?.features?.length ?? 0

  if (!proposed) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#15171A]">
        <IsoGrid />
        <div className="z-10 flex flex-col items-center gap-2 text-center">
          <span className="inline-block h-4 w-4 rounded-full bg-[#2DD4A8] opacity-80" />
          <span className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-white/60">
            {t('viewer.selectSpot')}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 hidden items-center gap-2 sm:flex">
          <span className="h-2.5 w-2.5 bg-white/30" aria-hidden />
          <span className="font-mono text-[0.6rem] text-white/45">
            {cityCount > 0
              ? t('viewer.existingBuildings', { n: cityCount })
              : t('viewer.backdropMissing')}
          </span>
        </div>
      </div>
    )
  }

  const geom = useMemo(() => {
    const ring = proposed.footprint.coordinates[0]
    const lat0 = ring[0]?.[1] ?? 48.695
    const { pts, w, d } = ringToMetres(ring, lat0)
    const H = Math.max(proposed.heightM, 0.5)

    // Optional ridge apex for pitched roofs (extrusions are flat-topped; this is
    // a light flourish so the roof type reads visually).
    const pitch = proposed.roofPitchDeg ?? 38
    const ridgeRise =
      proposed.roofType === 'flach' || proposed.roofType === 'unknown'
        ? 0
        : Math.min((Math.min(w, d) / 2) * Math.tan((pitch * Math.PI) / 180), H * 1.4)

    // Project base + top + apex, then compute a fit transform.
    const base = pts.map((p) => iso(p.mx, p.my, 0))
    const top = pts.map((p) => iso(p.mx, p.my, H))
    const apexPt = iso(0, 0, H + ridgeRise)
    const all = [...base, ...top, apexPt]
    const minX = Math.min(...all.map((p) => p.x))
    const maxX = Math.max(...all.map((p) => p.x))
    const minY = Math.min(...all.map((p) => p.y))
    const maxY = Math.max(...all.map((p) => p.y))

    return { base, top, apex: apexPt, ridgeRise, bbox: { minX, maxX, minY, maxY } }
  }, [proposed.footprint, proposed.heightM, proposed.roofType, proposed.roofPitchDeg])

  // Fit the building into a 0..VB box with padding.
  const VB = 100
  const pad = 22
  const { base, top, apex } = geom
  const bw = geom.bbox.maxX - geom.bbox.minX || 1
  const bh = geom.bbox.maxY - geom.bbox.minY || 1
  const scale = Math.min((VB - pad * 2) / bw, (VB - pad * 2) / bh)
  const offX = (VB - bw * scale) / 2 - geom.bbox.minX * scale
  const offY = (VB - bh * scale) / 2 - geom.bbox.minY * scale
  const tx = (p: Pt) => `${p.x * scale + offX},${p.y * scale + offY}`

  const basePoly = base.map(tx).join(' ')
  const topPoly = top.map(tx).join(' ')
  const apexXY = tx(apex)

  // Compliance colours: green when passing, red when failing.
  const fill = proposed.compliant ? '#2DD4A8' : '#C2362B'
  const wall = proposed.compliant ? '#238060' : '#8F271F'
  const wallDark = proposed.compliant ? '#1B6B50' : '#6B1D17'

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#15171A]">
      {/* Isometric ground grid */}
      <IsoGrid />

      {/* The proposed building */}
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Soft contact shadow on the ground */}
        <polygon points={basePoly} fill="#000000" opacity={0.28} transform="translate(0,2)" />

        {/* Walls: draw each side face from base[i]→base[i+1]→top[i+1]→top[i],
            far faces first (painter's algorithm by average depth). */}
        {base
          .map((_, i) => {
            const j = (i + 1) % base.length
            const depth = base[i].y + base[j].y
            return { i, j, depth }
          })
          .sort((a, b) => a.depth - b.depth)
          .map(({ i, j }, idx) => {
            const poly = [tx(base[i]), tx(base[j]), tx(top[j]), tx(top[i])].join(' ')
            // Alternate wall shading for a faceted look.
            return (
              <polygon
                key={i}
                points={poly}
                fill={idx % 2 === 0 ? wallDark : wall}
                stroke="#0c0d0f"
                strokeWidth={0.4}
              />
            )
          })}

        {/* Flat roof slab */}
        <polygon
          points={topPoly}
          fill={fill}
          stroke="#0c0d0f"
          strokeWidth={0.5}
        />

        {/* Pitched-roof flourish: ridge lines from the top polygon to an apex */}
        {geom.ridgeRise > 0.01 &&
          top.map((p, i) => (
            <line
              key={i}
              x1={tx(p).split(',')[0]}
              y1={tx(p).split(',')[1]}
              x2={apexXY.split(',')[0]}
              y2={apexXY.split(',')[1]}
              stroke="#0c0d0f"
              strokeWidth={0.4}
              opacity={0.85}
            />
          ))}
        {geom.ridgeRise > 0.01 && (
          <polygon
            points={`${tx(top[0])} ${tx(top[1] ?? top[0])} ${apexXY}`}
            fill={fill}
            opacity={0.92}
            stroke="#0c0d0f"
            strokeWidth={0.4}
          />
        )}
      </svg>

      {/* Top-left: footprint + attribute readout */}
      <div className="absolute left-3 top-3 flex flex-col gap-1.5">
        <span className="font-display text-[0.55rem] uppercase tracking-[0.18em] text-white/45">
          {t('viewer.proposedBuilding')}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5"
            style={{ background: fill }}
            aria-hidden
          />
          <span className="font-mono text-xs text-white/85">
            {proposed.heightM.toFixed(1)} m · {roofLabel(proposed.roofType)}
          </span>
        </div>
        <span
          className={[
            'mt-0.5 inline-flex w-fit items-center gap-1 border px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.14em]',
            proposed.compliant
              ? 'border-[#5b8f6a] text-[#8fd0a0]'
              : 'border-parcel-red text-[#e98d83]',
          ].join(' ')}
        >
          {proposed.compliant
            ? t('viewer.withinLimits')
            : t('viewer.exceedsLimits')}
        </span>
      </div>

      {/* Bottom-left: city backdrop status (hidden on the narrowest screens to
          avoid colliding with the viewer-slot note) */}
      <div className="absolute bottom-3 left-3 hidden items-center gap-2 sm:flex">
        <span className="h-2.5 w-2.5 bg-white/30" aria-hidden />
        <span className="font-mono text-[0.6rem] text-white/45">
          {cityCount > 0
            ? t('viewer.existingBuildings', { n: cityCount })
            : t('viewer.backdropMissing')}
        </span>
      </div>

      {/* Bottom-right: the "real viewer mounts here" note */}
      <div className="absolute bottom-3 right-3 max-w-[60%] border border-white/15 bg-black/30 px-2.5 py-1.5 text-right backdrop-blur-sm">
        <span className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-white/45">
          {t('viewer.slot')}
        </span>
        <p className="font-mono text-[0.6rem] leading-snug text-white/60">
          {t('viewer.slotNote')}
        </p>
      </div>
    </div>
  )
}

function roofLabel(t: string): string {
  switch (t) {
    case 'flach':
      return 'Flachdach'
    case 'sattel':
      return 'Satteldach'
    case 'walm':
      return 'Walmdach'
    case 'pult':
      return 'Pultdach'
    default:
      return 'Dachform ?'
  }
}

/** Faint isometric drafting grid behind the building. */
function IsoGrid() {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  const N = 14
  const VB = 100
  const cx = VB / 2
  const cy = VB / 2 + 14
  const step = 7
  for (let i = -N; i <= N; i++) {
    // Two families of iso lines.
    lines.push({
      x1: cx + i * step * ISO_COS - N * step * ISO_COS,
      y1: cy + i * step * ISO_SIN + N * step * ISO_SIN,
      x2: cx + i * step * ISO_COS + N * step * ISO_COS,
      y2: cy + i * step * ISO_SIN - N * step * ISO_SIN,
    })
    lines.push({
      x1: cx - i * step * ISO_COS - N * step * ISO_COS,
      y1: cy + i * step * ISO_SIN + N * step * ISO_SIN,
      x2: cx - i * step * ISO_COS + N * step * ISO_COS,
      y2: cy + i * step * ISO_SIN - N * step * ISO_SIN,
    })
  }
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="#0E5E5B"
          strokeWidth={0.2}
          opacity={0.18}
        />
      ))}
    </svg>
  )
}
