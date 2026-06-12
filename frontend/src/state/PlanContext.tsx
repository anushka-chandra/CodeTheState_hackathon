import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Constraint, ConstraintKey, ExtractionResult } from '../types'

/**
 * Single source of truth for a plan as it moves through the flow:
 *   extraction result → human-reviewed constraints → proposed (what-if) values.
 *
 * The 3D viewer and the compliance panel both subscribe here, so editing a
 * proposed value re-renders everything downstream live (§3.4).
 */

export interface PlanState {
  /** Raw extraction (immutable reference value). */
  result: ExtractionResult | null
  /** Working copy of constraints, edited in Review. */
  constraints: Constraint[]
  /** Per-row human confirmation in Review (keyed by constraint key). */
  confirmed: Record<string, boolean>
  /** Proposed "what-if" values on the compliance screen (keyed by key). */
  proposed: Record<string, string | number>
  /** Original uploaded file, if any (Upload screen sets this). */
  file: File | null
  /** Displayable source image for the Review pane (object URL / asset / data URL). */
  planImageUrl: string | null
}

interface PlanContextValue extends PlanState {
  /** Load a fresh extraction and seed working copies. */
  loadResult: (
    result: ExtractionResult,
    opts?: { file?: File | null; planImageUrl?: string | null },
  ) => void
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
  constraints: [],
  confirmed: {},
  proposed: {},
  file: null,
  planImageUrl: null,
}

/** Seed proposed values from the extracted constraints, but tuned so the demo
 *  shows one deliberate FAIL: proposed max height 11.4 m vs allowed 9.0 m. */
function seedProposed(constraints: Constraint[]): Record<string, string | number> {
  const proposed: Record<string, string | number> = {}
  for (const c of constraints) {
    proposed[c.key] = c.value
  }
  // Deliberate FAIL for the demo: proposed ridge height exceeds the 9.0 m limit.
  if ('max_height' in proposed) proposed['max_height'] = 11.4
  // Pitch is a planner's single choice, not a range — seed inside the allowed band.
  if ('roof_pitch' in proposed) proposed['roof_pitch'] = 38
  return proposed
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlanState>(emptyState)

  const loadResult = useCallback(
    (
      result: ExtractionResult,
      opts: { file?: File | null; planImageUrl?: string | null } = {},
    ) => {
      const constraints = result.constraints.map((c) => ({ ...c }))
      setState((prev) => ({
        result,
        constraints,
        confirmed: {},
        proposed: seedProposed(constraints),
        file: opts.file ?? prev.file,
        planImageUrl: opts.planImageUrl ?? prev.planImageUrl,
      }))
    },
    [],
  )

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
