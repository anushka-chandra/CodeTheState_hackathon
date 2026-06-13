import type { ExtractionResult } from '../types'
import { planFileToImages } from './planImages'

/**
 * THE data-access seam. Every "read a plan" call goes through here — no fetch()
 * scattered through components.
 *
 * Renders the upload to page images in the browser, POSTs them to the Vercel
 * serverless function at /api/extract, and returns the parsed ExtractionResult.
 * Errors are surfaced to the caller (ExtractScreen shows a failure state).
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function stageDuration(index: number): number {
  const span = STAGE_MAX_MS - STAGE_MIN_MS
  const t = (index * 137) % 100 // 0..99 spread
  return STAGE_MIN_MS + Math.round((t / 99) * span)
}
void stageDuration

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

/** The Vercel serverless extraction endpoint (same-origin). */
const EXTRACT_ENDPOINT = '/api/extract'

export interface ExtractionOutcome {
  result: ExtractionResult
}

export async function runExtraction(
  file: File | null,
  options: RunExtractionOptions = {},
): Promise<ExtractionOutcome> {
  const { onStage, signal } = options

  // Stage 0 — render the upload to page images in the browser.
  onStage?.(EXTRACT_STAGES[0], 0)
  if (!file) throw new Error('No file')
  const images = await planFileToImages(file)
  if (images.length === 0) throw new Error('No renderable pages')
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // Stage 1 — send to the serverless vision extractor.
  onStage?.(EXTRACT_STAGES[1], 1)
  const res = await fetch(EXTRACT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, filename: file.name }),
    signal,
  })
  if (!res.ok) {
    let detail = `Extraction failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch { /* ignore parse errors */ }
    throw new Error(detail)
  }

  // Stage 2 — parse the model's structured answer.
  onStage?.(EXTRACT_STAGES[2], 2)
  const result = (await res.json()) as ExtractionResult
  if (!result?.constraints?.length) throw new Error('No constraints extracted')

  // Stages 3–4 — geocode / build candidate (cosmetic ticks).
  onStage?.(EXTRACT_STAGES[3], 3)
  await delay(220, signal)
  onStage?.(EXTRACT_STAGES[4], 4)
  await delay(220, signal)

  return { result }
}
