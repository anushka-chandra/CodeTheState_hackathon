import { useCallback, useMemo, useState } from 'react'
import type { FeatureCollection, Polygon } from 'geojson'
import { usePlan } from '../state/PlanContext'
import { useI18n } from '../i18n/I18nContext'
import { evaluateCompliance, summarise } from '../data/compliance'
import { roofTypeFromLabel } from '../data/roof'
import { useCityBuildings } from '../data/useCityBuildings'
import { useCadastralParcel, scalePolygon } from '../data/useCadastralParcel'
import { compareToReference } from '../data/compareReference'
import Viewer3D from '../viewer/Viewer3D'
import VerdictChip from '../components/VerdictChip'
import PlanStempel from '../components/PlanStempel'
import { exportGeoJSON, exportCityGML, exportCityJSON } from '../data/exportQGIS'
import type { ComplianceRow, Constraint } from '../types'

const ROOF_OPTIONS = ['Satteldach', 'Walmdach', 'Flachdach', 'Pultdach', 'Zeltdach']

function toNum(v: string | number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

// ── Spot generation ──────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon against ANY of the given rings (lon/lat). */
function pointInAnyPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  for (const ring of rings) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1]
      const xj = ring[j][0], yj = ring[j][1]
      const intersect =
        (yi > lat) !== (yj > lat) &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      if (intersect) inside = !inside
    }
    if (inside) return true
  }
  return false
}

/**
 * Generate available building spots in the GAPS BETWEEN existing buildings —
 * infill sites embedded in the built fabric, NOT open land on the edge.
 * 1. NOT inside any building footprint (with a small clearance), and
 * 2. surrounded by the built area — at least `need` buildings within
 *    NEIGHBOR_RADIUS_M. Chosen spots are kept ≥ SPOT_SPACING_M apart; the
 *    neighbour requirement relaxes so we never return zero.
 */
function computeSpots(
  center: { lon: number; lat: number },
  cityBuildings: FeatureCollection | null,
): { lon: number; lat: number }[] {
  const SEARCH_RADIUS_M = 220
  const GRID_STEP_M = 18
  const CLEARANCE_M = 8
  const NEIGHBOR_RADIUS_M = 75
  const MIN_NEIGHBORS = 3
  const SPOT_SPACING_M = 28
  const MAX_SPOTS = 12

  const mPerDegLat = 110540
  const mPerDegLon = 111320 * Math.cos((center.lat * Math.PI) / 180)
  const distM = (
    a: { lon: number; lat: number },
    b: { lon: number; lat: number },
  ) => Math.hypot((a.lon - b.lon) * mPerDegLon, (a.lat - b.lat) * mPerDegLat)

  const footprints: number[][][] = []
  const centroids: { lon: number; lat: number }[] = []
  for (const f of cityBuildings?.features ?? []) {
    if (f.geometry.type !== 'Polygon') continue
    const ring = (f.geometry as Polygon).coordinates[0]
    if (!ring || ring.length < 4) continue
    footprints.push(ring)
    let cx = 0, cy = 0
    const n = ring.length - 1
    for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] }
    centroids.push({ lon: cx / n, lat: cy / n })
  }

  const stepLon = GRID_STEP_M / mPerDegLon
  const stepLat = GRID_STEP_M / mPerDegLat
  const radLon = SEARCH_RADIUS_M / mPerDegLon
  const radLat = SEARCH_RADIUS_M / mPerDegLat

  type Cand = { lon: number; lat: number; neighbors: number; clear: number }
  const cands: Cand[] = []
  for (let lon = center.lon - radLon; lon <= center.lon + radLon; lon += stepLon) {
    for (let lat = center.lat - radLat; lat <= center.lat + radLat; lat += stepLat) {
      const c = { lon, lat }
      if (distM(c, center) > SEARCH_RADIUS_M) continue
      if (!footprints.length) {
        cands.push({ lon, lat, neighbors: 99, clear: SEARCH_RADIUS_M - distM(c, center) })
        continue
      }
      if (pointInAnyPolygon(lon, lat, footprints)) continue
      let nearest = Infinity
      let neighbors = 0
      for (const b of centroids) {
        const d = distM(c, b)
        if (d < nearest) nearest = d
        if (d <= NEIGHBOR_RADIUS_M) neighbors++
      }
      if (nearest < CLEARANCE_M) continue
      cands.push({ lon, lat, neighbors, clear: nearest })
    }
  }

  for (const need of [MIN_NEIGHBORS, 2, 1, 0]) {
    const pool = cands
      .filter((c) => c.neighbors >= need)
      .sort((a, b) => b.neighbors - a.neighbors || b.clear - a.clear)
    const chosen: { lon: number; lat: number }[] = []
    for (const c of pool) {
      if (chosen.every((p) => distM(c, p) >= SPOT_SPACING_M)) {
        chosen.push({ lon: c.lon, lat: c.lat })
        if (chosen.length >= MAX_SPOTS) break
      }
    }
    if (chosen.length) return chosen
  }
  return []
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ComplianceScreen() {
  const {
    result,
    constraints,
    proposed,
    activeFootprint,
    zones,
    selectedZoneId,
    updateProposed,
  } = usePlan()
  const { t, lang } = useI18n()
  const cityBuildings = useCityBuildings(result?.plan.centroidWGS84)
  const { parcel, parcelArea } = useCadastralParcel(result?.plan.centroidWGS84)

  // Selected spot — null means no building placed yet.
  const [selectedSpot, setSelectedSpot] = useState<{ lon: number; lat: number } | null>(null)
  const [rotationDeg, setRotationDeg] = useState(0)

  const rows = useMemo(
    () => evaluateCompliance(constraints, proposed, lang),
    [constraints, proposed, lang],
  )
  const summary = useMemo(() => summarise(rows), [rows])

  const grz = toNum(proposed['grz'] ?? 0.4, 0.4)
  const floors = toNum(proposed['floors'] ?? 2, 2)
  const maxHeight = toNum(proposed['max_height'] ?? 9, 9)

  // Available spots between existing buildings.
  const spots = useMemo(
    () => result ? computeSpots(result.plan.centroidWGS84, cityBuildings) : [],
    [result?.plan.centroidWGS84, cityBuildings],
  )

  // Derive building footprint at the selected spot.
  const PLOT_AREA = 600
  const liveFootprint = useMemo(() => {
    if (!selectedSpot) return null

    let base: Polygon

    // Use real parcel shape if available
    if (parcel) {
      const scaleFactor = Math.sqrt(Math.max(grz, 0.05))
      base = scalePolygon(parcel, scaleFactor)
    } else {
      // Fabricated rectangle at the selected spot
      const plotArea = parcelArea ?? PLOT_AREA
      const buildingArea = Math.max(grz, 0.05) * plotArea
      const aspect = 1.3
      const widthM = Math.sqrt(buildingArea * aspect)
      const depthM = buildingArea / widthM
      const mPerDegLon = 111320 * Math.cos((selectedSpot.lat * Math.PI) / 180)
      const mPerDegLat = 110540
      const hw = (widthM / 2) / mPerDegLon
      const hh = (depthM / 2) / mPerDegLat
      base = {
        type: 'Polygon' as const,
        coordinates: [[
          [selectedSpot.lon - hw, selectedSpot.lat - hh],
          [selectedSpot.lon + hw, selectedSpot.lat - hh],
          [selectedSpot.lon + hw, selectedSpot.lat + hh],
          [selectedSpot.lon - hw, selectedSpot.lat + hh],
          [selectedSpot.lon - hw, selectedSpot.lat - hh],
        ]],
      } satisfies Polygon
    }

    return base
  }, [selectedSpot, grz, parcel, parcelArea])

  const heightM = maxHeight > 0 ? maxHeight : Math.max(floors * 3, 3)

  if (!result) return null

  const selectedZone = zones.find((z) => z.id === selectedZoneId)

  // Only create a proposed building when a spot has been selected.
  const proposedBuilding = liveFootprint
    ? {
        footprint: liveFootprint,
        heightM,
        roofType: roofTypeFromLabel(proposed['roof_type'] ?? 'unknown'),
        roofPitchDeg: toNum(proposed['roof_pitch'] ?? 38, 38),
        compliant: summary.fail === 0,
        rotationDeg,
      }
    : null

  const refComparison = useMemo(
    () =>
      proposedBuilding
        ? compareToReference(
            { footprint: proposedBuilding.footprint, heightM, roofType: proposedBuilding.roofType },
            cityBuildings,
          )
        : null,
    [proposedBuilding?.footprint, heightM, proposedBuilding?.roofType, cityBuildings],
  )

  const byKey: Record<string, ComplianceRow> = {}
  rows.forEach((r) => (byKey[r.key] = r))

  const handleSpotClick = useCallback((center: { lon: number; lat: number }) => {
    setSelectedSpot(center)
    setRotationDeg(0)
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
      {/* LEFT — 3D viewer slot (~65%) */}
      <section className="sheet flex min-h-[420px] flex-col lg:min-h-[70vh]">
        <div className="flex items-center justify-between border-b border-ink px-4 py-3">
          <div className="min-w-0">
            <span className="eyebrow">{t('compliance.view')}</span>
            <h2 className="mt-1 truncate font-display text-base font-bold uppercase tracking-[0.1em]">
              {result.plan.name || result.plan.municipality}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {selectedZone && zones.length > 1 && (
                <span className="border border-survey-teal/50 bg-survey-teal/8 px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.12em] text-survey-teal">
                  {t('compliance.zoneLabel')} · {selectedZone.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 font-mono text-[0.6rem] text-ink/55">
            <Legend color="#2DD4A8" label={t('compliance.legendSpot')} />
            <Legend color="#8d8d8d" label={t('compliance.legendExisting')} />
          </div>
        </div>
        <div className="flex-1">
          <Viewer3D
            center={result.plan.centroidWGS84}
            cityBuildings={cityBuildings ?? undefined}
            proposed={proposedBuilding ?? undefined}
            spots={selectedSpot ? [] : spots}
            onSpotClick={handleSpotClick}
            parcelOutline={parcel ?? undefined}
            highlightBuildingId={refComparison?.refBuildingId ?? undefined}
          />
        </div>
        <div className="border-t border-grid-line px-4 py-2 font-mono text-[0.6rem] text-ink/45">
          {selectedSpot ? (
            <>
              {t('compliance.spotWord')} {selectedSpot.lon.toFixed(4)}, {selectedSpot.lat.toFixed(4)}
              <button
                type="button"
                onClick={() => setSelectedSpot(null)}
                className="ml-2 border border-ink/30 px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.12em] text-ink/60 hover:bg-plan-paper"
              >
                {t('compliance.resetSpot')}
              </button>
              <span className="ml-3 inline-flex items-center gap-2">
                Rotation
                <input
                  type="range" min={0} max={359} value={rotationDeg}
                  onChange={(e) => setRotationDeg(Number(e.target.value))}
                  className="h-1 w-28 align-middle"
                  aria-label="Rotate building"
                />
                <button
                  type="button"
                  onClick={() => setRotationDeg((rotationDeg + 15) % 360)}
                  className="border border-ink/30 px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.12em] text-ink/60 hover:bg-plan-paper"
                >+15°</button>
                <span className="font-mono">{rotationDeg}°</span>
              </span>
            </>
          ) : (
            <span>{t('viewer.selectSpot')}</span>
          )}
          {parcelArea != null && (
            <span> · {t('compliance.parcelArea', { area: Math.round(parcelArea) })}</span>
          )}
        </div>
      </section>

      {/* RIGHT — compliance report (~35%) */}
      <section className="sheet flex flex-col">
        <div className="flex items-center justify-between border-b border-ink px-4 py-3">
          <div>
            <span className="eyebrow">{t('compliance.report')}</span>
            <h2 className="mt-1 font-display text-base font-bold uppercase tracking-[0.1em]">
              {t('compliance.baunvo')}
            </h2>
          </div>
          {selectedSpot && (
            <ExportMenu
              onGeoJSON={() => exportGeoJSON(result, proposed, activeFootprint ?? result.footprint)}
              onCityGML={() => exportCityGML(result, proposed, activeFootprint ?? result.footprint)}
              onCityJSON={() => exportCityJSON(result, proposed, activeFootprint ?? result.footprint)}
              onPrint={() => window.print()}
              t={t}
            />
          )}
        </div>

        {!selectedSpot ? (
          /* Prompt to select a spot */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="inline-block h-5 w-5 rounded-full bg-[#2DD4A8] opacity-80" />
            <p className="font-display text-[0.75rem] uppercase tracking-[0.14em] text-ink/55">
              {t('viewer.selectSpot')}
            </p>
            <p className="font-body text-[0.7rem] text-ink/40">
              {t('compliance.spotHint')}
            </p>
          </div>
        ) : (
          <>
            {/* Plan-Stempel */}
            <div className="border-b border-grid-line bg-plan-paper/40 py-3">
              <PlanStempel
                verdict={summary.overall}
                violated={summary.fail}
                total={summary.total}
              />
            </div>

            {/* Overall verdict banner */}
            <div
              className={[
                'flex items-center justify-between gap-2 border-b px-4 py-2.5',
                summary.fail > 0
                  ? 'border-parcel-red/40 bg-parcel-red/[0.06] text-parcel-red'
                  : summary.review > 0
                    ? 'border-seal-amber/40 bg-seal-amber/[0.06] text-seal-amber'
                    : 'border-survey-teal/40 bg-survey-teal/[0.06] text-survey-teal',
              ].join(' ')}
            >
              <span className="font-display text-[0.7rem] font-bold uppercase tracking-[0.14em]">
                {summary.fail > 0
                  ? t('compliance.violated', {
                      fail: summary.fail,
                      total: summary.total,
                    })
                  : summary.review > 0
                    ? t(
                        summary.review === 1
                          ? 'compliance.needReviewOne'
                          : 'compliance.needReviewMany',
                        { n: summary.review },
                      )
                    : t('compliance.allSatisfied')}
              </span>
              <span className="font-mono text-[0.65rem]">
                {summary.pass}✓ · {summary.review}? · {summary.fail}✗
              </span>
            </div>

            {/* Per-parameter rows */}
            <ul className="divide-y divide-grid-line">
              {constraints.map((c) => (
                <ComplianceRowItem
                  key={c.key}
                  constraint={c}
                  row={byKey[c.key]}
                  proposed={proposed[c.key] ?? c.value}
                  onProposed={(v) => updateProposed(c.key, v)}
                  t={t}
                />
              ))}
            </ul>

            {/* Reference LOD2 comparison section */}
            <div className="border-t border-ink px-4 py-3">
              <span className="eyebrow">{t('compliance.referenceTitle')}</span>
              {refComparison ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-body text-[0.6rem] text-ink/50">{t('compliance.refHeight')}</span>
                    <span className="font-mono text-sm">{refComparison.refHeight.toFixed(1)} m</span>
                    <DeltaBadge delta={refComparison.heightDelta} unit="m" refValue={refComparison.refHeight} t={t} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-body text-[0.6rem] text-ink/50">{t('compliance.refArea')}</span>
                    <span className="font-mono text-sm">{Math.round(refComparison.refArea)} m²</span>
                    <DeltaBadge delta={refComparison.areaDelta} unit="m²" refValue={refComparison.refArea} t={t} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-body text-[0.6rem] text-ink/50">{t('compliance.refRoof')}</span>
                    <span className={[
                      'mt-0.5 inline-block px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.12em]',
                      refComparison.roofMatch
                        ? 'border border-survey-teal/50 bg-survey-teal/8 text-survey-teal'
                        : 'border border-seal-amber/50 bg-seal-amber/8 text-seal-amber',
                    ].join(' ')}>
                      {refComparison.roofMatch ? '✓' : '≠'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-1 font-mono text-[0.65rem] text-ink/40">{t('compliance.noReference')}</p>
              )}
            </div>

            <p className="mt-auto border-t border-grid-line px-4 py-3 font-body text-[0.7rem] text-ink/45">
              {t('compliance.editHint')}
            </p>
          </>
        )}
      </section>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

function ExportMenu({
  onGeoJSON,
  onCityGML,
  onCityJSON,
  onPrint,
  t,
}: {
  onGeoJSON: () => void
  onCityGML: () => void
  onCityJSON: () => void
  onPrint: () => void
  t: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="border border-ink bg-white px-3 py-1.5 font-display text-[0.6rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-plan-paper"
      >
        {t('compliance.export')} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 flex min-w-[160px] flex-col border border-ink bg-white shadow-md">
          <button
            type="button"
            onClick={() => { onGeoJSON(); setOpen(false) }}
            className="px-3 py-2 text-left font-display text-[0.6rem] uppercase tracking-[0.12em] text-ink hover:bg-survey-teal/10"
          >
            {t('compliance.exportGeoJSON')}
          </button>
          <button
            type="button"
            onClick={() => { onCityGML(); setOpen(false) }}
            className="border-t border-grid-line px-3 py-2 text-left font-display text-[0.6rem] uppercase tracking-[0.12em] text-ink hover:bg-survey-teal/10"
          >
            {t('compliance.exportCityGML')}
          </button>
          <button
            type="button"
            onClick={() => { onCityJSON(); setOpen(false) }}
            className="border-t border-grid-line px-3 py-2 text-left font-display text-[0.6rem] uppercase tracking-[0.12em] text-ink hover:bg-survey-teal/10"
          >
            {t('compliance.exportCityJSON')}
          </button>
          <button
            type="button"
            onClick={() => { onPrint(); setOpen(false) }}
            className="border-t border-grid-line px-3 py-2 text-left font-display text-[0.6rem] uppercase tracking-[0.12em] text-ink hover:bg-survey-teal/10"
          >
            {t('compliance.exportPDF')}
          </button>
        </div>
      )}
    </div>
  )
}

function ComplianceRowItem({
  constraint: c,
  row,
  proposed,
  onProposed,
  t,
}: {
  constraint: Constraint
  row: ComplianceRow | undefined
  proposed: string | number
  onProposed: (v: string | number) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  if (!row) return null
  const isNumber = typeof c.value === 'number' || c.key === 'roof_pitch'
  const fail = row.verdict === 'FAIL'

  return (
    <li
      className={[
        'px-4 py-3',
        fail ? 'bg-parcel-red/[0.04]' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-body text-sm font-semibold">
            {c.labelDe}
          </span>
          <span className="font-body text-[0.7rem] text-ink/50">{c.labelEn}</span>
        </div>
        <VerdictChip verdict={row.verdict} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {/* Allowed (read-only) */}
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{t('compliance.allowed')}</span>
          <div className="flex items-stretch border border-grid-line bg-plan-paper/40">
            <span className="w-full px-2 py-1.5 text-right font-mono text-sm text-ink/70">
              {c.value}
            </span>
            {c.unit ? (
              <span className="flex items-center border-l border-grid-line px-2 font-mono text-xs text-ink/45">
                {c.unit}
              </span>
            ) : null}
          </div>
        </div>

        {/* Proposed (editable) */}
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{t('compliance.proposed')}</span>
          <div
            className={[
              'flex items-stretch border',
              fail ? 'border-parcel-red' : 'border-ink',
            ].join(' ')}
          >
            {c.key === 'roof_type' ? (
              <select
                value={String(proposed)}
                onChange={(e) => onProposed(e.target.value)}
                className="w-full bg-white px-2 py-1.5 font-mono text-sm focus:bg-survey-teal/5"
                aria-label={`Proposed ${c.labelEn}`}
              >
                {ROOF_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                {!ROOF_OPTIONS.includes(String(proposed)) && (
                  <option value={String(proposed)}>{String(proposed)}</option>
                )}
              </select>
            ) : (
              <input
                type={isNumber ? 'number' : 'text'}
                inputMode={isNumber ? 'decimal' : 'text'}
                step={isNumber ? '0.1' : undefined}
                value={String(proposed)}
                onChange={(e) =>
                  onProposed(
                    isNumber && e.target.value !== ''
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
                className="w-full bg-white px-2 py-1.5 text-right font-mono text-sm focus:bg-survey-teal/5"
                aria-label={`Proposed ${c.labelEn}`}
              />
            )}
            {c.unit ? (
              <span className="flex items-center border-l border-current/20 bg-plan-paper px-2 font-mono text-xs text-ink/55">
                {c.unit}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {row.note && (
        <p
          className={[
            'mt-1.5 font-mono text-[0.68rem]',
            fail
              ? 'text-parcel-red'
              : row.verdict === 'REVIEW'
                ? 'text-seal-amber'
                : 'text-ink/45',
          ].join(' ')}
        >
          {fail ? '✗ ' : row.verdict === 'REVIEW' ? '? ' : '✓ '}
          {row.note}
        </p>
      )}
    </li>
  )
}

function DeltaBadge({
  delta,
  unit,
  refValue,
  t,
}: {
  delta: number
  unit: string
  refValue: number
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const pct = refValue > 0 ? Math.abs(delta / refValue) * 100 : 0
  const isClose = pct <= 10
  const isFar = pct > 25

  const color = isClose
    ? 'border-survey-teal/50 bg-survey-teal/8 text-survey-teal'
    : isFar
      ? 'border-parcel-red/50 bg-parcel-red/8 text-parcel-red'
      : 'border-seal-amber/50 bg-seal-amber/8 text-seal-amber'

  const sign = delta > 0 ? '+' : ''
  const label = isClose
    ? t('compliance.deltaClose')
    : t('compliance.deltaOff', { delta: `${sign}${delta.toFixed(1)} ${unit}` })

  return (
    <span className={`mt-0.5 inline-block border px-1.5 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.12em] ${color}`}>
      {label}
    </span>
  )
}
