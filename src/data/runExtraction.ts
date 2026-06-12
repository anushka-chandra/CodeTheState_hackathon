import type { ExtractionResult } from '../types'
import { mockExtraction } from './mockExtraction'

/**
 * THE data-access seam. Every "read a plan" call goes through here so the
 * backend swap later touches exactly one function — no fetch() scattered
 * through components (hard rule from the brief, §3.2).
 *
 * Today: a timed simulation that resolves the bundled mock JSON.
 * Later: replace the body with a real upload + poll, keeping this signature.
 */

export type ExtractStageKey =
  | 'reading'
  | 'locating'
  | 'extracting'
  | 'geocoding'
  | 'building'

export interface ExtractStage {
  key: ExtractStageKey
  label: string
}

/** Ordered pipeline shown on the Extract screen (§3.2). */
export const EXTRACT_STAGES: ExtractStage[] = [
  { key: 'reading', label: 'Reading document' },
  { key: 'locating', label: 'Locating Nutzungsschablone' },
  { key: 'extracting', label: 'Extracting constraints' },
  { key: 'geocoding', label: 'Geocoding plan area' },
  { key: 'building', label: 'Building 3D candidate' },
]

export interface RunExtractionOptions {
  /** Called as each stage becomes active; index is into EXTRACT_STAGES. */
  onStage?: (stage: ExtractStage, index: number) => void
  signal?: AbortSignal
}

const STAGE_MIN_MS = 600
const STAGE_MAX_MS = 900

// Deterministic-ish jitter without Math.random (kept reproducible for demos).
function stageDuration(index: number): number {
  const span = STAGE_MAX_MS - STAGE_MIN_MS
  const t = (index * 137) % 100 // 0..99 spread
  return STAGE_MIN_MS + Math.round((t / 99) * span)
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/**
 * @param _file  the uploaded plan (unused by the mock; the backend will use it)
 */
export async function runExtraction(
  _file: File | null,
  options: RunExtractionOptions = {},
): Promise<ExtractionResult> {
  const { onStage, signal } = options
  for (let i = 0; i < EXTRACT_STAGES.length; i++) {
    onStage?.(EXTRACT_STAGES[i], i)
    await delay(stageDuration(i), signal)
  }
  return mockExtraction
}
