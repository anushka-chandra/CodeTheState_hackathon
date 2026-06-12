/**
 * Render page 1 of a PDF to a PNG data URL. Returns null on any failure so the
 * caller can fall back to a styled placeholder (the brief: "if that fights you,
 * show a styled placeholder" — never crash).
 *
 * pdf.js is heavy (~1 MB), so it's dynamically imported here: the main bundle
 * stays light and the library only loads the first time a PDF is dropped.
 */
export async function renderPdfThumbnail(
  file: File,
  maxWidth = 480,
): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
      .default
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

    const data = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data })
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / base.width, 2)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const url = canvas.toDataURL('image/png')
    void loadingTask.destroy()
    return url
  } catch {
    return null
  }
}
