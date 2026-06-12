/**
 * Turn an uploaded plan into base64 page images for the extraction API.
 *
 * PDFs are rasterised in the browser with pdf.js (already a dependency) — this
 * keeps the serverless function light (no native PDF libs) and reliable. Image
 * uploads are passed through as a single data URL. TIFF can't be rendered in
 * the browser, so it yields no images (the caller then falls back to cached).
 *
 * pdf.js is dynamically imported so it only loads when a PDF is processed.
 */

const MAX_PAGES = 3
const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.85

async function pdfToImages(file: File): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
    .default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const count = Math.min(pdf.numPages, MAX_PAGES)
  const out: string[] = []

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(MAX_WIDTH / base.width, 2.5)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    // White background so transparent PDFs render legibly as JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    out.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
  }
  void loadingTask.destroy()
  return out
}

function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Produce up to MAX_PAGES base64 data-URL images for the given plan file. */
export async function planFileToImages(file: File): Promise<string[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return pdfToImages(file)
  if (/\.(png|jpe?g)$/.test(name)) return [await imageFileToDataUrl(file)]
  return [] // TIFF / unknown — not renderable in the browser
}
