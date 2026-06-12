import type { RoofType } from '../types'

/** Map a German Dachform label (or proposed value) to the viewer enum. */
export function roofTypeFromLabel(value: string | number): RoofType {
  const s = String(value).toLowerCase()
  if (s.includes('flach')) return 'flach'
  if (s.includes('sattel')) return 'sattel'
  if (s.includes('walm') || s.includes('zelt') || s.includes('mansard'))
    return 'walm'
  if (s.includes('pult')) return 'pult'
  return 'unknown'
}
