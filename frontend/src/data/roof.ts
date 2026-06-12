import type { RoofType } from '../types'

/** Map a German Dachform label (or proposed value) to the viewer enum. */
export function roofTypeFromLabel(value: string | number): RoofType {
  const s = String(value).toLowerCase()
  if (s.includes('flach') || s === 'fd') return 'flach'
  if (s.includes('sattel') || s.includes('gable') || s === 'sd') return 'sattel'
  if (s.includes('walm') || s.includes('zelt') || s.includes('mansard') || s.includes('hipped') || s === 'wd')
    return 'walm'
  if (s.includes('pult') || s.includes('mono') || s.includes('shed')) return 'pult'
  return 'unknown'
}
