import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = (name) => join(root, 'tests', 'fixtures', name)
const output = mkdtempSync(join(tmpdir(), 'file-e2e-'))
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173/'

let server
if (!process.env.E2E_BASE) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  })
  let ready = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(BASE)).ok) {
        ready = true
        break
      }
    } catch {
      /* preview chưa kịp chạy */
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  if (!ready) throw new Error('Không khởi động được vite preview. Hãy chạy `npm run build` trước.')
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
})
const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
const pagesOf = async (path) => (await PDFDocument.load(readFileSync(path))).getPageCount()

try {
  // ---------- Desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await desktop.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(BASE, { waitUntil: 'networkidle' })

  check('title', (await page.title()).includes('PDF'))
  check('og image', (await page.locator('meta[property="og:image"]').getAttribute('content')).includes('og-image.png'))
  check('tab count', (await page.getByRole('tab').count()) === 3)
  check('higher limit chip', await page.getByText('500 MB').first().isVisible())

  // Theme toggle + persistence
  await page.getByRole('button', { name: /Đổi giao diện/ }).click()
  let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  if (!isDark) {
    await page.getByRole('button', { name: /Đổi giao diện/ }).click()
    isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  }
  check('dark mode toggles', isDark)
  await page.reload({ waitUntil: 'networkidle' })
  check(
    'theme persists after reload',
    await page.evaluate(() => document.documentElement.classList.contains('dark')),
  )

  // Add PDFs
  await page.locator('#panel-pdf input[type=file]').first().setInputFiles([fixture('a.pdf'), fixture('b.pdf')])
  await page.waitForFunction(() => document.querySelectorAll('#panel-pdf li').length === 2, null, { timeout: 20000 })
  check('two pdf rows', (await page.locator('#panel-pdf li').count()) === 2)

  const inputs = page.locator('#panel-pdf li input[type=number]')
  check('numeric inputMode', (await inputs.first().getAttribute('inputmode')) === 'numeric')
  const inputBox = await inputs.first().boundingBox()
  check('range input >= 44px tall', inputBox.height >= 44, `${inputBox.height}px`)

  await inputs.nth(0).fill('2')
  await inputs.nth(1).fill('4')
  await inputs.nth(2).fill('1')
  await inputs.nth(3).fill('3')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+Enter'),
  ])
  await download.saveAs(join(output, 'merge.pdf'))
  check('Ctrl+Enter exports 6 pages', (await pagesOf(join(output, 'merge.pdf'))) === 6)

  // On-demand preview
  await page.getByRole('button', { name: 'Xem trước' }).click()
  const previewDialog = page.getByRole('dialog')
  await previewDialog.waitFor({ timeout: 30000 })
  await previewDialog.locator('canvas').first().waitFor()
  check('pdf preview renders canvas', await previewDialog.locator('canvas').first().isVisible())
  await previewDialog.getByText(/1\s*\/\s*6/).waitFor({ timeout: 10000 })
  check('pdf preview shows page count', true)
  await page.keyboard.press('Escape')
  await previewDialog.waitFor({ state: 'hidden' })

  // Duplicate + reorder
  await page.locator('#panel-pdf li').first().getByRole('button', { name: 'Nhân bản đoạn' }).click()
  await page.waitForFunction(() => document.querySelectorAll('#panel-pdf li').length === 3)
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất PDF' }).click(),
  ])
  await download2.saveAs(join(output, 'dup.pdf'))
  check('duplicate exports 9 pages', (await pagesOf(join(output, 'dup.pdf'))) === 9)

  const nameBefore = await page.locator('#panel-pdf li').nth(0).locator('p[title]').innerText()
  await page.locator('#panel-pdf li').nth(2).getByRole('button', { name: 'Đưa lên' }).click()
  await page.locator('#panel-pdf li').nth(1).getByRole('button', { name: 'Đưa lên' }).click()
  const nameAfter = await page.locator('#panel-pdf li').nth(0).locator('p[title]').innerText()
  check('arrow reorder changes first row', nameBefore !== nameAfter, `${nameBefore} -> ${nameAfter}`)

  // Custom filename + even-page preset
  await page.getByRole('textbox', { name: 'Tên file xuất' }).fill(' Báo cáo ')
  await page.getByRole('button', { name: 'Trang chẵn' }).click()
  const [presetDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất PDF' }).click(),
  ])
  await presetDownload.saveAs(join(output, 'preset.pdf'))
  check('even preset exports 5 pages', (await pagesOf(join(output, 'preset.pdf'))) === 5)
  check('custom output filename', presetDownload.suggestedFilename() === 'Báo cáo.pdf', presetDownload.suggestedFilename())
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click()

  // PDF dropped on Word tab routes back to PDF tab
  await page.getByRole('tab', { name: 'Word → PDF' }).click()
  await page.locator('#panel-word input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel-pdf')
    return panel && !panel.classList.contains('hidden')
  }, null, { timeout: 5000 })
  check('pdf drops route to PDF tab', (await page.getByRole('tab', { name: 'Cắt & Gộp PDF' }).getAttribute('aria-selected')) === 'true')

  // Invalid range
  await page.locator('#panel-pdf li input[type=number]').nth(0).fill('99')
  await page.getByText('Tối đa', { exact: false }).first().waitFor()
  check('invalid range disables export', await page.getByRole('button', { name: 'Xuất PDF' }).isDisabled())

  // Full-window drag overlay
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['x'], 'test.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
  })
  await page.getByText('Thả file để thêm vào danh sách').waitFor({ timeout: 3000 })
  check('full-window drag overlay appears', true)

  // ---------- Images → PDF ----------
  await page.getByRole('tab', { name: 'Ảnh → PDF' }).click()
  await page.locator('#panel-image input[type=file]').first().setInputFiles([fixture('photo.png'), fixture('photo.jpg')])
  await page.waitForFunction(() => document.querySelectorAll('#panel-image li').length === 2, null, { timeout: 20000 })
  check('image rows', (await page.locator('#panel-image li').count()) === 2)

  const [imageDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tạo PDF' }).click(),
  ])
  await imageDownload.saveAs(join(output, 'images.pdf'))
  check('images export 2 pages', (await pagesOf(join(output, 'images.pdf'))) === 2)

  await page.getByRole('button', { name: 'Trang chẵn' }).click()
  const [imageEven] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tạo PDF' }).click(),
  ])
  await imageEven.saveAs(join(output, 'images-even.pdf'))
  check('image even preset exports 1 page', (await pagesOf(join(output, 'images-even.pdf'))) === 1)
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click()

  await page.getByRole('button', { name: 'Xem trước' }).click()
  const imagePreview = page.getByRole('dialog')
  await imagePreview.waitFor({ timeout: 30000 })
  await imagePreview.locator('canvas').first().waitFor()
  check('image preview renders canvas', await imagePreview.locator('canvas').first().isVisible())
  await page.keyboard.press('Escape')
  await imagePreview.waitFor({ state: 'hidden' })

  check('no desktop page errors', pageErrors.length === 0, pageErrors.join(' | '))

  // ---------- Mobile ----------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, isMobile: true, hasTouch: true })
  const mpage = await mobile.newPage()
  const mobileErrors = []
  mpage.on('pageerror', (error) => mobileErrors.push(error.message))
  await mpage.goto(BASE, { waitUntil: 'networkidle' })

  const overflow = await mpage.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  check('no horizontal overflow (empty)', overflow.scroll <= overflow.client, JSON.stringify(overflow))

  await mpage.locator('#panel-pdf input[type=file]').first().setInputFiles(fixture('test.docx'))
  await mpage.getByText('Đã chuyển sang tab Word → PDF').waitFor({ timeout: 3000 })
  check('auto switches to Word tab', (await mpage.getByRole('tab', { name: 'Word → PDF' }).getAttribute('aria-selected')) === 'true')
  check('dropzone inputMode numeric on Word panel', (await mpage.locator('#panel-word input[type=number]').first().getAttribute('inputmode')) === 'numeric')

  await mpage.waitForFunction(() => document.querySelector('#panel-word input[type=number]') !== null, null, { timeout: 60000 })
  await mpage.locator('#panel-word input[type=number]').first().fill('1')
  await mpage.locator('#panel-word input[type=number]').nth(1).fill('1')
  const [wordDownload] = await Promise.all([
    mpage.waitForEvent('download', { timeout: 60000 }),
    mpage.getByRole('button', { name: 'Tải PDF' }).click(),
  ])
  await wordDownload.saveAs(join(output, 'word.pdf'))
  check('word crop to 1 page', (await pagesOf(join(output, 'word.pdf'))) === 1)

  await mpage.getByRole('tab', { name: 'Cắt & Gộp PDF' }).click()
  await mpage.locator('#panel-pdf input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await mpage.waitForFunction(() => document.querySelectorAll('#panel-pdf li').length === 1, null, { timeout: 20000 })

  const smallTargets = await mpage.evaluate(() =>
    Array.from(document.querySelectorAll('#panel-pdf button, #panel-pdf input'))
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)
      })
      .map((el) => `${el.tagName}:${el.getAttribute('aria-label') || el.textContent?.trim()}`),
  )
  check('mobile touch targets >= 44px', smallTargets.length === 0, smallTargets.join(', '))

  const barPosition = await mpage.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('div')).find(
      (el) => el.className?.includes?.('fixed') && el.textContent?.includes('Xuất PDF'),
    )
    return bar ? getComputedStyle(bar).position : 'missing'
  })
  check('mobile action bar is fixed', barPosition === 'fixed', barPosition)

  const overflow2 = await mpage.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  check('no horizontal overflow (with rows)', overflow2.scroll <= overflow2.client, JSON.stringify(overflow2))
  check('no mobile page errors', mobileErrors.length === 0, mobileErrors.join(' | '))
} finally {
  await browser.close()
  server?.kill()
  console.log(results.join('\n'))
  console.log(`\n${results.filter((line) => line.startsWith('PASS')).length}/${results.length} passed`)
}
