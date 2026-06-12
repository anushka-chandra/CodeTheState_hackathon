import puppeteer from 'puppeteer-core'

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:5190'
const OUT = '/tmp/planraum'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--force-color-profile=srgb',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
})

async function shoot(name, steps = async () => {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await steps(page)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`shot ${name}`)
  await page.close()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. Upload screen
await shoot('1-upload')

// 2. Review (via Use example plan)
await shoot('2-review', async (page) => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Use example plan'),
    )
    btn?.click()
  })
  await sleep(900)
})

// 3. Compliance (continue from review)
await shoot('3-compliance', async (page) => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Use example plan'),
    )
    btn?.click()
  })
  await sleep(700)
  // Resolve the low-confidence row by confirming it.
  await page.evaluate(() => {
    const conf = [...document.querySelectorAll('button')].filter((b) =>
      (b.getAttribute('title') || '').includes('Mark as confirmed'),
    )
    conf.forEach((b) => b.click())
  })
  await sleep(300)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Confirm all'),
    )
    btn?.click()
  })
  await sleep(4500) // let MapLibre tiles + extrusions render
})

// 4. Mobile review at 380px
const m = await browser.newPage()
await m.setViewport({ width: 380, height: 820, deviceScaleFactor: 1 })
await m.goto(BASE, { waitUntil: 'networkidle0' })
await m.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Use example plan'),
  )
  btn?.click()
})
await sleep(900)
await m.screenshot({ path: `${OUT}/4-mobile-review.png` })
console.log('shot 4-mobile-review')

await browser.close()
console.log('done')
