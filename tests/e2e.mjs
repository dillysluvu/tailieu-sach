import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
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
  check('tab count', (await page.getByRole('tab').count()) === 8)
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

  // Duplex interleave merge (2 rows)
  await page.locator('#panel-pdf').getByRole('button', { name: /Ghép xen kẽ 2 mặt/ }).click()
  const [interleaveDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất PDF' }).click(),
  ])
  await interleaveDownload.saveAs(join(output, 'interleave.pdf'))
  check('duplex interleave exports 6 pages', (await pagesOf(join(output, 'interleave.pdf'))) === 6)
  await page.locator('#panel-pdf').getByRole('button', { name: /Ghép xen kẽ 2 mặt/ }).click()

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

  // ---------- Split PDF (.zip) ----------
  await page.getByRole('tab', { name: /Tách PDF/ }).click()
  await page.locator('#panel-split input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await page.locator('#panel-split').getByRole('radio', { name: /Mỗi trang 1 file/ }).waitFor({ timeout: 20000 })
  await page.locator('#panel-split').getByRole('radio', { name: /Mỗi trang 1 file/ }).click()
  const [splitDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-split').getByRole('button', { name: 'Tách & tải ZIP' }).click(),
  ])
  const splitZipPath = join(output, 'split.zip')
  await splitDownload.saveAs(splitZipPath)
  const splitEntries = Object.keys(unzipSync(new Uint8Array(readFileSync(splitZipPath))))
  check('split pdf exports zip with 6 pdfs', splitEntries.length === 6, splitEntries.join(', '))

  await page.locator('#panel-split').getByRole('radio', { name: /Tự chọn từng phần/ }).click()
  await page.locator('#panel-split').getByPlaceholder(/Ví dụ:/).fill('1-2, 3-cuối')
  const [splitCustomDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-split').getByRole('button', { name: 'Tách & tải ZIP' }).click(),
  ])
  const splitCustomZipPath = join(output, 'split-custom.zip')
  await splitCustomDownload.saveAs(splitCustomZipPath)
  const splitCustomEntries = Object.keys(unzipSync(new Uint8Array(readFileSync(splitCustomZipPath))))
  check('split pdf supports Vietnamese syntax 3-cuối', splitCustomEntries.length === 2, splitCustomEntries.join(', '))

  await page.locator('#panel-split').getByRole('radio', { name: /Theo dung lượng/ }).click()
  const [splitSizeDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-split').getByRole('button', { name: 'Cắt theo dung lượng' }).click(),
  ])
  await splitSizeDownload.saveAs(join(output, 'split-size.pdf'))
  check('split pdf by MB limit exports 6 pages', (await pagesOf(join(output, 'split-size.pdf'))) === 6)

  // ---------- Compress PDF ----------
  await page.getByRole('tab', { name: /Nén PDF/ }).click()
  await page.locator('#panel-compress input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await page.locator('#panel-compress').getByRole('button', { name: 'Nén PDF' }).waitFor({ timeout: 20000 })
  const [compressDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-compress').getByRole('button', { name: 'Nén PDF' }).click(),
  ])
  await compressDownload.saveAs(join(output, 'compressed.pdf'))
  check('compress pdf exports 6 pages', (await pagesOf(join(output, 'compressed.pdf'))) === 6)
  check('compress pdf shows size summary', await page.locator('#panel-compress').getByText(/(B|KB|MB) →/).isVisible())

  // ---------- Edit PDF ----------
  await page.getByRole('tab', { name: /Chỉnh trang/ }).click()
  await page.locator('#panel-edit input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await page.locator('#panel-edit').getByRole('button', { name: 'Xoay & Tải PDF' }).waitFor({ timeout: 20000 })
  const [rotateDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: 'Xoay & Tải PDF' }).click(),
  ])
  await rotateDownload.saveAs(join(output, 'rotated.pdf'))
  check('edit pdf rotate exports 6 pages', (await pagesOf(join(output, 'rotated.pdf'))) === 6)

  await page.locator('#panel-edit').getByRole('radio', { name: 'Đánh số trang' }).click()
  const [numDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: 'Đánh số & Tải PDF' }).click(),
  ])
  await numDownload.saveAs(join(output, 'numbered.pdf'))
  check('edit pdf page numbers exports 6 pages', (await pagesOf(join(output, 'numbered.pdf'))) === 6)

  await page.locator('#panel-edit').getByRole('radio', { name: 'Đóng dấu mờ' }).click()
  const [wmDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: 'Đóng dấu & Tải PDF' }).click(),
  ])
  await wmDownload.saveAs(join(output, 'watermarked.pdf'))
  check('edit pdf Vietnamese watermark exports 6 pages', (await pagesOf(join(output, 'watermarked.pdf'))) === 6)

  await page.locator('#panel-edit').getByRole('radio', { name: 'In gộp trang' }).click()
  const [nupDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: /In gộp 2 trang/ }).click(),
  ])
  await nupDownload.saveAs(join(output, 'nup.pdf'))
  check('edit pdf 2-up exports 3 sheets', (await pagesOf(join(output, 'nup.pdf'))) === 3)

  await page.locator('#panel-edit').getByRole('radio', { name: 'Sắp xếp & Xóa' }).click()
  await page.locator('#panel-edit').getByRole('button', { name: 'Đảo ngược thứ tự' }).click()
  await page.locator('#panel-edit').getByRole('button', { name: '+ Chèn trang trắng' }).click()
  const [orgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: 'Xuất 7 trang' }).click(),
  ])
  await orgDownload.saveAs(join(output, 'organized.pdf'))
  check('edit pdf organize (reverse + blank page) exports 7 pages', (await pagesOf(join(output, 'organized.pdf'))) === 7)

  await page.locator('#panel-edit').getByRole('radio', { name: 'Chuẩn hóa A4/A5' }).click()
  const [stdDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: /Chuẩn hóa A4/ }).click(),
  ])
  await stdDownload.saveAs(join(output, 'a4.pdf'))
  check('edit pdf standardize A4 exports 6 pages', (await pagesOf(join(output, 'a4.pdf'))) === 6)

  await page.locator('#panel-edit').getByRole('radio', { name: 'Cắt lề' }).click()
  await page.locator('#panel-edit').getByRole('button', { name: 'Viền scan 8 mm' }).click()
  const [cropDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: 'Cắt lề & Tải PDF' }).click(),
  ])
  await cropDownload.saveAs(join(output, 'cropped.pdf'))
  check('edit pdf crop margins exports 6 pages', (await pagesOf(join(output, 'cropped.pdf'))) === 6)

  await page.locator('#panel-edit').getByRole('radio', { name: 'Thông tin ẩn' }).click()
  const [metaDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-edit').getByRole('button', { name: 'Xóa thông tin ẩn & Tải PDF' }).click(),
  ])
  await metaDownload.saveAs(join(output, 'cleaned-meta.pdf'))
  check('edit pdf clean metadata exports 6 pages', (await pagesOf(join(output, 'cleaned-meta.pdf'))) === 6)

  // ---------- PDF -> Images (.zip) ----------
  await page.getByRole('tab', { name: /PDF → Ảnh/ }).click()
  await page.locator('#panel-pdf2img input[type=file]').first().setInputFiles(fixture('a.pdf'))
  const imgRange = page.locator('#panel-pdf2img input[type=number]')
  await imgRange.first().waitFor({ timeout: 20000 })
  await imgRange.nth(0).fill('1')
  await imgRange.nth(1).fill('2')
  const [pdfImgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-pdf2img').getByRole('button', { name: /Xuất 2 ảnh/ }).click(),
  ])
  const pdfImgZipPath = join(output, 'pages.zip')
  await pdfImgDownload.saveAs(pdfImgZipPath)
  const imgEntries = Object.keys(unzipSync(new Uint8Array(readFileSync(pdfImgZipPath))))
  check('pdf to images exports 2 jpgs in zip', imgEntries.length === 2 && imgEntries.every((n) => n.endsWith('.jpg')), imgEntries.join(', '))
  check('pdf to images renders gallery thumbnails', (await page.locator('#panel-pdf2img img').count()) === 2)

  // ---------- PDF -> Word (Offline mode) ----------
  await page.getByRole('tab', { name: /PDF → Word/ }).click()
  await page.locator('#panel-pdf2word input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await page.locator('#panel-pdf2word').getByRole('radio', { name: /Nhanh trên máy/ }).waitFor({ timeout: 20000 })
  await page.locator('#panel-pdf2word').getByRole('radio', { name: /Nhanh trên máy/ }).click()
  const [docxDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#panel-pdf2word').getByRole('button', { name: 'Chuyển sang Word' }).click(),
  ])
  const docxPath = join(output, 'converted.docx')
  await docxDownload.saveAs(docxPath)
  const docxEntries = Object.keys(unzipSync(new Uint8Array(readFileSync(docxPath))))
  check('pdf to word offline exports valid docx', docxEntries.includes('word/document.xml'), docxDownload.suggestedFilename())

  // PDF dropped on Word tab routes back to PDF tab
  await page.getByRole('tab', { name: /Word → PDF/ }).click()
  await page.locator('#panel-word input[type=file]').first().setInputFiles(fixture('a.pdf'))
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel-pdf')
    return panel && !panel.classList.contains('hidden')
  }, null, { timeout: 5000 })
  check('pdf drops route to PDF tab', (await page.getByRole('tab', { name: /Cắt & Gộp PDF/ }).getAttribute('aria-selected')) === 'true')

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

  // ---------- Images -> PDF ----------
  await page.getByRole('tab', { name: /Ảnh → PDF/ }).click()
  await page.locator('#panel-image input[type=file]').first().setInputFiles([fixture('photo.png'), fixture('photo.jpg')])
  await page.waitForFunction(() => document.querySelectorAll('#panel-image li').length === 2, null, { timeout: 20000 })
  check('image rows', (await page.locator('#panel-image li').count()) === 2)

  await page.locator('#panel-image').getByRole('radio', { name: /Cân bằng/ }).click()
  const [imageDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tạo PDF' }).click(),
  ])
  await imageDownload.saveAs(join(output, 'images.pdf'))
  check('images export 2 pages (balanced quality)', (await pagesOf(join(output, 'images.pdf'))) === 2)

  await page.locator('#panel-image').getByRole('button', { name: 'Trang chẵn' }).click()
  const [imageEven] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tạo PDF' }).click(),
  ])
  await imageEven.saveAs(join(output, 'images-even.pdf'))
  check('image even preset exports 1 page', (await pagesOf(join(output, 'images-even.pdf'))) === 1)
  await page.locator('#panel-image').getByRole('button', { name: 'Tất cả', exact: true }).click()

  await page.locator('#panel-image').getByRole('button', { name: 'Xem trước' }).click()
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
  await mpage.getByText('Đã chuyển sang Word → PDF').waitFor({ timeout: 3000 })
  check('auto switches to Word tab', (await mpage.getByRole('tab', { name: /Word → PDF/ }).getAttribute('aria-selected')) === 'true')

  await mpage.waitForFunction(() => document.querySelector('#panel-word input[type=number]') !== null, null, { timeout: 60000 })
  check('dropzone inputMode numeric on Word panel', (await mpage.locator('#panel-word input[type=number]').first().getAttribute('inputmode')) === 'numeric')
  await mpage.locator('#panel-word input[type=number]').first().fill('1')
  await mpage.locator('#panel-word input[type=number]').nth(1).fill('1')
  const [wordDownload] = await Promise.all([
    mpage.waitForEvent('download', { timeout: 60000 }),
    mpage.getByRole('button', { name: 'Tải PDF' }).click(),
  ])
  await wordDownload.saveAs(join(output, 'word.pdf'))
  check('word crop to 1 page', (await pagesOf(join(output, 'word.pdf'))) === 1)

  await mpage.getByRole('tab', { name: /Cắt & Gộp PDF/ }).click()
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
