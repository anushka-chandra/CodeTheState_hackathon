/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let n = bytes / 1024
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`
}

/** Best-effort plan number from a filename, e.g. "B-Plan_2024-07_Obere-Au.pdf". */
export function parsePlanNumber(filename: string): string | undefined {
  const stem = filename.replace(/\.[^.]+$/, '')
  // "B-Plan 2024-07", "BPlan_07", "Bebauungsplan-123"
  const bplan = stem.match(/b[-\s_]?plan[-\s_]*([0-9][\w-]*)/i)
  if (bplan) return `B-PLAN ${bplan[1].replace(/_/g, '-')}`
  // A year-number pattern like 2024-07
  const year = stem.match(/\b(20\d{2}[-_]?\d{1,3})\b/)
  if (year) return year[1].replace(/_/g, '-')
  return undefined
}

const ACCEPTED = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff']

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED.some((ext) => name.endsWith(ext))
}

export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.tif,.tiff'
