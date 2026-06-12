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

// When set (frontend/.env), point at the FastAPI backend; otherwise stay mock.
const API_URL = import.meta.env.VITE_API_URL as string | undefined

/**
 * Read a plan into structured constraints. The whole app depends only on this
 * function — it is the single backend seam (no fetch() scattered elsewhere).
 *
 * - With VITE_API_URL set: POST the file to the FastAPI `/extract` endpoint.
 * - Without it (or on any error): run the local mock simulation. Demo-safe.
 *
 * The staged `onStage` callbacks fire either way so the Extract screen animates.
 */
export async function runExtraction(
  file: File | null,
  options: RunExtractionOptions = {},
): Promise<ExtractionResult> {
  const { onStage, signal } = options

  if (API_URL && file) {
    try {
      // Tick the early stages while the request is in flight for UX parity.
      onStage?.(EXTRACT_STAGES[0], 0)
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API_URL.replace(/\/$/, '')}/extract`, {
        method: 'POST',
        body,
        signal,
      })
      if (!res.ok) throw new Error(`Extract failed: ${res.status}`)
      for (let i = 1; i < EXTRACT_STAGES.length; i++) {
        onStage?.(EXTRACT_STAGES[i], i)
        await delay(220, signal)
      }
      return (await res.json()) as ExtractionResult
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      // Fall through to the mock so a backend hiccup never breaks the demo.
      // eslint-disable-next-line no-console
      console.warn('Backend extract failed, using mock:', (err as Error)?.message)
    }
  }

  for (let i = 0; i < EXTRACT_STAGES.length; i++) {
    onStage?.(EXTRACT_STAGES[i], i)
    await delay(stageDuration(i), signal)
  }
  return mockExtraction
}
