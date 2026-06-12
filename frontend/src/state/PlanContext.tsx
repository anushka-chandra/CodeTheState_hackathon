import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Polygon } from 'geojson'
import type {
  Constraint,
  ConstraintKey,
  ExtractionResult,
  PlanZone,
} from '../types'

/**
 * Single source of truth for a plan as it moves through the flow:
 *   extraction result → human-reviewed constraints → proposed (what-if) values.
 *
 * A plan may define several zones (Nutzungsschablonen). The working copies
 * (constraints / proposed / footprint) always reflect the *selected* zone; the
 * 3D viewer and compliance panel subscribe here, so editing a value or switching
 * zone re-renders everything downstream live.
 */

export interface PlanState {
  /** Raw extraction (immutable reference value). */
  result: ExtractionResult | null
  /** Every zone the plan defines (always ≥ 1 once a result is loaded). */
  zones: PlanZone[]
  /** Currently selected zone id (drives the working copies below). */
  selectedZoneId: string | null
  /** Working copy of the selected zone's constraints, edited in Review. */
  constraints: Constraint[]
  /** Per-row human confirmation in Review (keyed by constraint key). */
  confirmed: Record<string, boolean>
  /** Proposed "what-if" values on the compliance screen (keyed by key). */
  proposed: Record<string, string | number>
  /** Footprint of the selected zone (falls back to the plan footprint). */
  activeFootprint: Polygon | null
  /** Original uploaded file, if any (Upload screen sets this). */
  file: File | null
  /** Displayable source image for the Review pane (object URL / asset / data URL). */
  planImageUrl: string | null
  /** True when the live extraction failed and we served the bundled example. */
  cachedExample: boolean
}

interface PlanContextValue extends PlanState {
  /** Load a fresh extraction and seed working copies from the first zone. */
  loadResult: (
    result: ExtractionResult,
    opts?: {
      file?: File | null
      planImageUrl?: string | null
      cached?: boolean
    },
  ) => void
  /** Switch the active zone and re-seed working copies from it. */
  selectZone: (zoneId: string) => void
  setFile: (file: File | null) => void
  setPlanImageUrl: (url: string | null) => void
  updateConstraintValue: (key: ConstraintKey, value: string | number) => void
  setConfirmed: (key: ConstraintKey, value: boolean) => void
  updateProposed: (key: ConstraintKey, value: string | number) => void
  reset: () => void
}

const PlanContext = createContext<PlanContextValue | null>(null)

const emptyState: PlanState = {
  result: null,
  zones: [],
  selectedZoneId: null,
  constraints: [],
  confirmed: {},
  proposed: {},
  activeFootprint: null,
  file: null,
  planImageUrl: null,
  cachedExample: false,
}

/** Normalise a result into a list of zones (always ≥ 1). */
function zonesOf(result: ExtractionResult): PlanZone[] {
  if (result.zones && result.zones.length > 0) return result.zones
  return [
    {
      id: 'zone-1',
      name: 'Plangebiet',
      constraints: result.constraints,
      footprint: result.footprint,
    },
  ]
}

/**
 * Seed proposed values from a zone's constraints. For the bundled example
 * (`demo`) we tune one deliberate FAIL so the compliance feature always shows;
 * for live extractions proposed starts equal to the extracted values.
 */
function seedProposed(
  constraints: Constraint[],
  demo: boolean,
): Record<string, string | number> {
  const proposed: Record<string, string | number> = {}
  for (const c of constraints) proposed[c.key] = c.value
  if (demo) {
    if ('max_height' in proposed) proposed['max_height'] = 11.4
    if ('roof_pitch' in proposed) proposed['roof_pitch'] = 38
  }
  return proposed
}

function seedFromZone(zone: PlanZone, fallback: Polygon, demo: boolean) {
  const constraints = zone.constraints.map((c) => ({ ...c }))
  return {
    constraints,
    confirmed: {} as Record<string, boolean>,
    proposed: seedProposed(constraints, demo),
    activeFootprint: zone.footprint ?? fallback,
  }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlanState>(emptyState)

  const loadResult = useCallback(
    (
      result: ExtractionResult,
      opts: {
        file?: File | null
        planImageUrl?: string | null
        cached?: boolean
      } = {},
    ) => {
      const zones = zonesOf(result)
      const demo = opts.cached === true
      const seeded = seedFromZone(zones[0], result.footprint, demo)
      setState((prev) => ({
        result,
        zones,
        selectedZoneId: zones[0].id,
        ...seeded,
        file: opts.file ?? prev.file,
        planImageUrl: opts.planImageUrl ?? prev.planImageUrl,
        cachedExample: opts.cached ?? false,
      }))
    },
    [],
  )

  const selectZone = useCallback((zoneId: string) => {
    setState((prev) => {
      if (!prev.result || zoneId === prev.selectedZoneId) return prev
      const zone = prev.zones.find((z) => z.id === zoneId)
      if (!zone) return prev
      const seeded = seedFromZone(zone, prev.result.footprint, prev.cachedExample)
      return { ...prev, selectedZoneId: zoneId, ...seeded }
    })
  }, [])

  const setFile = useCallback((file: File | null) => {
    setState((prev) => ({ ...prev, file }))
  }, [])

  const setPlanImageUrl = useCallback((url: string | null) => {
    setState((prev) => ({ ...prev, planImageUrl: url }))
  }, [])

  const updateConstraintValue = useCallback(
    (key: ConstraintKey, value: string | number) => {
      setState((prev) => ({
        ...prev,
        constraints: prev.constraints.map((c) =>
          c.key === key ? { ...c, value } : c,
        ),
      }))
    },
    [],
  )

  const setConfirmed = useCallback((key: ConstraintKey, value: boolean) => {
    setState((prev) => ({
      ...prev,
      confirmed: { ...prev.confirmed, [key]: value },
    }))
  }, [])

  const updateProposed = useCallback(
    (key: ConstraintKey, value: string | number) => {
      setState((prev) => ({
        ...prev,
        proposed: { ...prev.proposed, [key]: value },
      }))
    },
    [],
  )

  const reset = useCallback(() => setState(emptyState), [])

  const value = useMemo<PlanContextValue>(
    () => ({
      ...state,
      loadResult,
      selectZone,
      setFile,
      setPlanImageUrl,
      updateConstraintValue,
      setConfirmed,
      updateProposed,
      reset,
    }),
    [
      state,
      loadResult,
      selectZone,
      setFile,
      setPlanImageUrl,
      updateConstraintValue,
      setConfirmed,
      updateProposed,
      reset,
    ],
  )

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used within a PlanProvider')
  return ctx
}
