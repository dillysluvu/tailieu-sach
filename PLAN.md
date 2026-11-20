# PLAN.md — Web xử lý tài liệu Ultra-Minimalist

**Trạng thái:** ✅ Đã được duyệt (2026-11-20) — sẵn sàng triển khai.
**Mã dự án:** `tailieu-sach` · **Repo:** `github.com/dillysluvu/tailieu-sach` (public)
**Nguyên tắc:** 1 màn hình · 2 tab · 1 dropzone · 100% client-side · không upload · không quảng cáo.

> Ghi chú đường dẫn: theo quy tắc Plan Mode của môi trường này, file kế hoạch được ghi tại
> `/home/uyvu/.opencode/plan/PLAN.md`. Sau khi bạn duyệt, agent triển khai sẽ copy nội dung này
> thành `PLAN.md` ở gốc repo trước khi commit.

---

## 1. Tech stack

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Framework | **Vite + React 19 + TypeScript** | Tĩnh 100%, không SSR, deploy Vercel zero-config. Next.js không mang lại lợi ích khi không có API route. |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-first) | Ít file cấu hình, đúng tinh thần tối giản. |
| PDF core | **`pdf-lib`** | `copyPages` trích xuất/gộp không nén lại → giữ nguyên chất lượng, chạy trong browser. |
| Word → HTML | **`mammoth`** | Nhẹ, ổn định, giữ heading/list/bold/ảnh cơ bản. |
| HTML → PDF | **`html2pdf.js`** (html2canvas + jsPDF) | Render DOM ra canvas rồi đóng gói A4; output `arraybuffer` đưa sang pdf-lib để cắt. |
| Sanitize HTML | **`dompurify`** | Chặn HTML/JS độc hại từ file `.docx`. |
| Icon | **inline SVG** (hoặc `lucide-react` tree-shaken) | Chỉ dùng 4–5 icon: `⧉`, `×`, `↑↓`, ⋮⋯, lock. |
| Font | `@fontsource/inter` (subset `latin-ext` + `vietnamese`) | Tiếng Việt hiển thị đúng cả trong canvas của html2canvas. |
| Deploy | **Vercel** (static, `dist`) | Theo yêu cầu; framework preset = Vite. |
| Repo | `git init` + `gh repo create --public --push` | `gh` đã đăng nhập tài khoản `dillysluvu`, SSH OK. |

**Nguyên tắc bundle:** `pdf-lib`, `mammoth`, `html2pdf.js` được **dynamic import theo tab** (`import()` trong handler). Initial JS chỉ chứa shell UI → mở là dùng ngay.

---

## 2. Cấu trúc thư mục

```
tailieu-sach/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ README.md
├─ PLAN.md                      # copy từ kế hoạch này sau khi duyệt
├─ .gitignore
├─ public/
│  └─ favicon.svg               # hình vuông đen/trắng tối giản
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                   # shell: header + Tabs + Dropzone + active panel + footer
│  ├─ index.css                 # @import "tailwindcss"; tokens; focus-visible; font
│  ├─ types.ts                  # PdfRow, WordState, Status, TabKey
│  ├─ components/
│  │  ├─ Tabs.tsx
│  │  ├─ Dropzone.tsx           # dùng chung, accept động theo tab, auto-detect format
│  │  ├─ PdfRowItem.tsx         # 1 dòng: handle + tên/trang + from/to + ⧉ + × + ↑↓
│  │  ├─ PdfMergerPanel.tsx
│  │  ├─ WordPanel.tsx
│  │  ├─ RangeInputs.tsx
│  │  ├─ PrimaryButton.tsx
│  │  └─ StatusLine.tsx         # aria-live
│  ├─ lib/
│  │  ├─ pdf.ts                 # loadPdf, copyRange, mergeRows, getPageCount
│  │  ├─ word.ts                # docxToPdfBytes (mammoth → sanitize → html2pdf → crop)
│  │  ├─ parse.ts               # parseRange/validateRange (int, 1..n, from<=to)
│  │  ├─ download.ts            # bytesToDownload + URL.revokeObjectURL
│  │  └─ errors.ts              # message thân thiện (encrypted, sai format, quá lớn)
│  └─ hooks/
│     ├─ usePdfRows.ts          # state rows + cache PDFDocument + add/remove/duplicate/reorder
│     └─ useAsyncTask.ts        # status idle|running|done|error chung cho 2 tab
```

---

## 3. Mô hình dữ liệu & thuật toán

### 3.1 Tab 1 — Cắt & Gộp PDF thông minh

```ts
type PdfRow = {
  id: string;        // crypto.randomUUID() — identity của dòng
  fileId: string;    // trỏ tới File gốc; các dòng nhân bản CHUNG fileId
  name: string;
  pageCount: number;
  from: number;      // mặc định 1
  to: number;        // mặc định pageCount
};
```

**State:** `rows: PdfRow[]` + `docCache: Map<fileId, PDFDocument>`.
Khi drop N file → tạo N row theo đúng thứ tự `DataTransfer.files`, load từng file **một lần** vào cache, điền sẵn `1 → pageCount`. Nhân bản row = `id` mới, `fileId` giữ nguyên (không load lại file), range mặc định copy từ row gốc → user chỉnh tay. Xóa row = xóa khỏi mảng; nếu không còn row nào dùng `fileId` đó thì `docCache.delete(fileId)` để giải phóng bộ nhớ.

**Thuật toán xuất (`mergeRows`):**
```ts
const out = await PDFDocument.create();
for (const row of rows) {
  validateRange(row.from, row.to, row.pageCount);   // ném lỗi nếu sai
  const src = docCache.get(row.fileId)!;            // PDFDocument đã load
  const indices = [];
  for (let p = row.from; p <= row.to; p++) indices.push(p - 1);
  const copied = await out.copyPages(src, indices); // copy, KHÔNG addPage trực tiếp
  copied.forEach(page => out.addPage(page));
}
const bytes = await out.save();                      // Uint8Array
download(bytes, 'ket-qua.pdf');
```
- Dùng `copyPages` (khuyến nghị của pdf-lib) để clone cả resource dùng chung; không mutate source → nhân bản nhiều đoạn từ cùng 1 file an toàn.
- Thứ tự page trong file xuất = thứ tự `rows` sau khi kéo thả.
- Tổng trang hiển thị realtime ở chân bảng: `Σ(to − from + 1)`. Nút "Xuất PDF" bị disable khi có row sai range hoặc tổng > **1000 trang** (giới hạn bảo vệ RAM).

**Kéo thả đổi thứ tự:** HTML5 DnD native trên `<li draggable>` (`onDragStart` lưu `id`, `onDragOver preventDefault`, `onDrop` splice mảng). Nút `↑ / ↓` nhỏ làm fallback bàn phím & mobile (không thêm dependency dnd-kit). Dropzone chính và DnD row tách biệt rõ ràng.

**Validate:** `from/to` là số nguyên, `1 ≤ from ≤ to ≤ pageCount`. Hiện inline đỏ ngay dưới ô, không silent-clamp. File mã hóa → bắt lỗi load và hiện: *"PDF được bảo vệ — hãy mở khóa trước."*

### 3.2 Tab 2 — Word sang PDF & Cắt Word

**Luồng (tự convert ngay khi drop để biết số trang):**
1. `await file.arrayBuffer()` → `mammoth.convertToHtml({ arrayBuffer })`.
2. `DOMPurify.sanitize(html)` → chèn vào container ẩn (A4 = 210mm, padding 12mm, `position:fixed; left:-10000px`).
3. `await document.fonts.ready` → `html2pdf().set(opt).from(el).toPdf().get('pdf')` với `jsPDF:{unit:'mm', format:'a4'}`, `html2canvas:{scale:2, useCORS:true}`, margin 10mm.
4. `const bytes = pdf.output('arraybuffer')` → lưu vào state `wordPdfBytes: Uint8Array`, hiện *"Đã chuyển · N trang"*.
5. Ô `[ Từ ] — [ Đến ]` xuất ra, mặc định `1 → N` (N lấy từ `PDFDocument.load(bytes).getPageCount()`).
6. Khi bấm "Tải PDF": nếu range phủ toàn bộ → dùng luôn `bytes`; ngược lại `PDFDocument.load(bytes)` + `copyPages` như Tab 1 → `save()` → download `ten-file.pdf`.

**Lưu ý thiết kế đưa vào UI (1 dòng nhỏ):** *"Số trang được tính theo bản PDF A4 sau chuyển đổi — `.docx` không có trang cố định."* Giới hạn thực tế của mammoth: bỏ header/footer, cột, text box phức tạp. (Phương án dự phòng nếu cần fidelity cao: LibreOffice headless trong container nhỏ — **không làm ở bản đầu**, vì đi ngược lại yêu cầu 100% client-side.)

### 3.3 Dropzone dùng chung & auto-detect

Một khung duy nhất ở giữa, `accept` động: Tab 1 = `.pdf,application/pdf` (multiple), Tab 2 = `.docx` (single). Khi user kéo sai định dạng: **tự chuyển tab** tương ứng rồi nạp file (thay vì chỉ báo lỗi) — kèm microcopy *"Đã chuyển sang tab Word → PDF"*. Kiểm tra bằng `file.type` **và** extension. Giới hạn 25 MB/file, tối đa 20 file/lần drop.

---

## 4. UI/UX — bản đồ màn hình

```
┌─────────────────────────────────────────────────────────┐
│  sạch.                     🔒 Xử lý trên trình duyệt     │  ← header 56px
├─────────────────────────────────────────────────────────┤
│  [ Cắt & Gộp PDF ]  [ Word → PDF ]                      │  ← tab underline 2px
├─────────────────────────────────────────────────────────┤
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │  ← dropzone ~180px
│  │      Kéo file vào đây  ·  hoặc Browse       │  │     dashed 1px, hover đen
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│  ⋮⋯ tài-lieu-A.pdf   12 trang   [ 1 ] → [ 12 ]  ⧉ ×   │  ← row list
│  ⋮⋯ tai-lieu-B.pdf    8 trang   [ 3 ] → [  6 ]  ⧉ ×   │
│  + Thêm file                                            │
│  ─────────────────────────────────────────────────────  │
│  Tổng: 20 trang từ 2 file          [  Xuất PDF  ]       │  ← sticky footer
└─────────────────────────────────────────────────────────┘
```

- **Màu:** nền `#fff`, chữ `#000`, border `#e5e5e5`, hover `#fafafa`, lỗi `#b91c1c`. Không shadow, không gradient, không icon trang trí.
- **Type:** Inter 14/16px; ô số dùng `tabular-nums`, rộng 56px, border-bottom 1px (không viền hộp).
- **Trạng thái:** `idle → running → done | error`, hiển thị qua `StatusLine` (`aria-live="polite"`). Nút primary = nền đen, chữ trắng, bo 6px; disabled = xám nhạt.
- **A11y:** `role="tablist"` + `aria-selected`; label ẩn cho ô số; `focus-visible:ring-2`; ↑↓ fallback cho reorder.
- **Responsive (375px):** row chuyển thành 2 dòng (tên ở trên, range + action ở dưới); dropzone còn ~140px.

---

## 5. Các bước triển khai

1. `npm create vite@latest . -- --template react-ts` → `npm i` → `npm i -D tailwindcss @tailwindcss/vite` → `npm i pdf-lib mammoth html2pdf.js dompurify @fontsource/inter`.
2. Cấu hình `vite.config.ts`, `index.css` (font + tokens + `@import "tailwindcss"`), `types.ts`, `lib/errors.ts`, `lib/parse.ts`, `lib/download.ts`.
3. Dựng shell: `App.tsx` + `Tabs` + `Dropzone` + `StatusLine` + footer privacy.
4. `usePdfRows.ts` + `lib/pdf.ts` → Tab 1 đầy đủ: drop nhiều file, default range, reorder, duplicate, remove, validate, merge, download.
5. `lib/word.ts` + `WordPanel` → Tab 2: convert, đếm trang, crop, download.
6. Dynamic import 3 thư viện nặng; kiểm tra initial bundle (`npm run build`, mục tiêu < ~60 KB gzip cho JS khởi tạo).
7. Polish: microcopy tiếng Việt, trạng thái lỗi, a11y, mobile, favicon.
8. Test thủ công (xem mục 6) → `README.md` (hướng dẫn + privacy + giới hạn) → copy `PLAN.md` vào gốc repo.
9. Git & GitHub:
   ```bash
   git init
   git add . && git commit -m "feat: ultra-minimal pdf & word tools"
   gh repo create tailieu-sach --public --source=. --remote=origin --push
   ```
10. Vercel: Import repo → Framework **Vite** → Build `npm run build` → Output `dist` → Deploy. (Hoặc `npx vercel --prod` nếu muốn CLI.) Verify URL công khai + test lại 2 tab trên production.

---

## 6. Test cases bắt buộc

| # | Case | Kỳ vọng |
|---|---|---|
| 1 | Drop 3 PDF (10/8/12 trang) | 3 row, default `1–10`, `1–8`, `1–12`, tổng 30 trang |
| 2 | Sửa thành `2–5`, `3–6`, `1–7` | Xuất đúng 15 trang, thứ tự X→Y→Z |
| 3 | Kéo row 3 lên đầu | Thứ tự xuất đổi theo row |
| 4 | Nhân bản file X → `1–2` và `8–10` | File xuất có cả 2 đoạn, không load lại file |
| 5 | Range `0`, `99`, `from > to` | Inline error, nút Xuất disabled |
| 6 | Drop `.docx` khi đang ở Tab 1 | Tự chuyển Tab 2, convert, hiện số trang |
| 7 | `.docx` tiếng Việt → crop `2–4` | PDF đọc được, đúng 3 trang, không lỗi font |
| 8 | PDF mã hóa / file >25MB / file lạ | Thông báo rõ, không crash |
| 9 | iPhone 375px, dùng ↑↓ | Reorder vẫn hoạt động, không tràn ngang |
| 10 | Mở lần đầu, đo network | Không có request nào mang nội dung file đi server |

---

## 7. Quyết định đã chốt

| Quyết định | Lựa chọn |
|---|---|
| Framework | **Vite + React 19 + TypeScript** |
| Tên repo | **`tailieu-sach`** — public trên `dillysluvu` |
| Kéo sai định dạng | **Tự chuyển tab** rồi nạp file, kèm microcopy |
| Ngưỡng bảo vệ | **25 MB/file · 20 file/lần drop · 1000 trang output** |
| Ngôn ngữ UI | **Tiếng Việt** (không công tắc song ngữ) |

Rủi ro còn lại đã được xử lý trong thiết kế: `.docx` không có trang cố định → convert trước để đếm trang; mammoth bỏ layout phức tạp → ghi chú ngắn trong UI; PDF mã hóa → thông báo thân thiện.

---

### Bàn giao triển khai

Kế hoạch đã duyệt. Để bắt đầu viết code, hãy **chuyển sang agent triển khai (Implementation/Builder)** — Plan Mode hiện tại chỉ cho phép ghi file vào `/home/uyvu/.opencode/plan/`. Agent đó sẽ: copy file này thành `PLAN.md` ở gốc repo → scaffold → implement 2 tab → test → `gh repo create --public --push` → deploy Vercel.
