# PLAN_V2.md — Nâng cấp `tailieu-sach` lên bản Aesthetic / Mobile-First / CI-Ready

**Trạng thái:** ✅ Đã duyệt (2026-11-20) · **Mốc:** sau MVP (`50a0254`)
**Phạm vi:** giữ nguyên 2 tab / 1 màn hình / 100% client-side. Không thêm tính năng xử lý file mới.

> Đường dẫn: theo quy tắc Plan Mode, file này nằm tại `/home/uyvu/.opencode/plan/PLAN_V2.md`.
> Sau khi duyệt, agent triển khai sẽ copy thành `PLAN_V2.md` ở gốc repo.
>
> **File preview trực quan:** `/home/uyvu/.opencode/plan/PREVIEW_V2.html` — mở bằng trình duyệt để xem
> Light/Dark, Desktop 820px / Mobile 390px và 6 trạng thái (empty/idle/running/error/success/dragging).
> Đây là mockup tĩnh để duyệt design; sau khi duyệt có thể chuyển vào `docs/preview-v2.html` trong repo.

---

## 0. Audit source hiện tại (đọc toàn bộ trước khi design)

| Khu vực | Hiện trạng | Vấn đề cần nâng cấp |
|---|---|---|
| `src/index.css` | Tailwind v4, `@theme` chỉ có `--font-sans`; body hard-code `#fff/#0a0a0a` | Không có design token, không dark mode, không motion tokens |
| `src/App.tsx` | `max-w-3xl`, header + tabs + notice dạng `<p>`, footer | Chưa có theme toggle, overlay kéo thả toàn cửa sổ, shortcut, sticky bar |
| `src/components/Tabs.tsx` | Underline 2px, `transition-colors` | Chưa có indicator trượt, chưa conditional focus, touch target < 44px |
| `src/components/Dropzone.tsx` | `min-h-160/184`, border dashed, `role=button` | Chưa có full-window drag state, micro-interaction, empty-state tinh tế |
| `src/components/RangeInputs.tsx` | `type=number`, `w-14 py-1` (~34px cao) | Thiếu `inputMode="numeric"`, thiếu 44px touch target, iOS tự zoom khi font < 16px |
| `src/components/PdfRowItem.tsx` | 4 nút `h-7 w-7` = 28px; handle `⠿` chỉ kéo được | Touch target quá nhỏ; ↑↓ có nhưng khó bấm; tên dài chỉ `truncate` |
| `src/components/PdfMergerPanel.tsx` | Action bar inline dưới danh sách | Không ghim đáy trên mobile; nút `py-2.5` ≈ 42px |
| `src/components/WordPanel.tsx` | Tương tự, trạng thái là text thường | Chưa có feedback success/error có icon/animation |
| `src/components/StatusLine.tsx` | `<p aria-live>` màu đen/đỏ | Thiếu icon, toast, auto-dismiss, phân biệt error/success |
| `src/hooks/*` | `usePdfRows`, `useAsyncTask` ổn định | Cần thêm theme, global drag, shortcut; giữ nguyên thuật toán merge/crop |
| `src/lib/pdf.ts`, `word.ts` | Dynamic import đã đúng | Giữ nguyên; chỉ tối ưu chunk splitting |
| `package.json` | `build = tsc -b && vite build`, `lint = oxlint` | Chưa có script `check` tổng hợp / CI |
| `vercel.json` | Chưa có | Thiếu rewrite, cache, security headers |
| Git/Vercel | Deploy CLI đã chạy, **Git integration chưa connect** | Cần auto deploy trên push + Preview PR |

**Baseline bundle** (`npm run build`): main `269.21 kB / 87.28 kB gzip`; `html2pdf` `934.99 kB / 265.51 kB gzip`; `mammoth` `298.50 kB / 87.82 kB gzip`; 12 file font (6 woff2 + 6 woff).

---

## 1. Design Tokens (Light / Dark)

### 1.1 Nguyên tắc
Monochrome làm nền, **một accent duy nhất** dùng có chừng mực (focus, tiến trình, success). Border `1px`, không shadow nặng, không gradient. Dark mode dịu mắt (không dùng `#000` thuần).

### 1.2 Bảng token (`src/index.css`)

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--bg` | `#FAFAFA` | `#0B0B0F` | Nền trang |
| `--surface` | `#FFFFFF` | `#15151B` | Card, dropzone, sticky bar |
| `--surface-hover` | `#F4F4F5` | `#1C1C24` | Hover row/button |
| `--text` | `#18181B` | `#F4F4F5` | Chữ chính |
| `--text-muted` | `#71717A` | `#A1A1AA` | Phụ, hint, meta |
| `--text-faint` | `#A1A1AA` | `#71717A` | Placeholder, footer |
| `--line` | `#E4E4E7` | `#27272A` | Border 1px |
| `--line-strong` | `#CBCBD2` | `#3F3F46` | Border khi hover/focus |
| `--accent` | `#5E6AD2` | `#8B94E8` | Focus ring, progress, active indicator |
| `--accent-soft` | `#EEF0FF` | `#1E2140` | Nền chip success/active |
| `--danger` | `#C0392B` | `#F87171` | Lỗi |
| `--success` | `#2E7D5B` | `#4ADE80` | Hoàn tất |
| `--focus` | `#5E6AD2` | `#8B94E8` | `outline` 2px offset 2px |

**Contrast:** text/muted ≥ 4.5:1; border ≥ 3:1 so với nền (kiểm tra bằng DevTools). `color-scheme: light|dark` set theo theme để scrollbar/native input khớp.

### 1.3 Typography
- Font: **Inter Variable** (gộp latin + vietnamese, 2 file woff2 thay vì 12) — fallback `ui-sans-serif, system-ui`.
- Scale: `11 / 12 / 13 / 14 / 16 / 18 / 24 px` (`text-[11px]` … `text-2xl`).
- Heading `letter-spacing: -0.02em`; số dùng `font-variant-numeric: tabular-nums`.
- Label ô trang: `11px uppercase tracking-[0.08em] text-text-faint`.
- **Input mobile `font-size: 16px`** để iOS không tự zoom.

### 1.4 Spacing / Shape / Motion
- Spacing base 4px: `1=4, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48, 16=64`.
- Radius: `6px` control, `10px` card, `12px` dropzone. Border width luôn `1px`.
- Duration: `120ms` (hover), `180ms` (row/enter), `240ms` (overlay/toast).
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- **Thư viện motion đã được chọn:** dùng `motion` (kế nhiệm framer-motion) với `LazyMotion` + `domAnimation` tải bất đồng bộ, component `m` thay vì `motion`, `AnimatePresence` cho enter/exit, `layout` cho reorder FLIP, `useReducedMotion()` để tắt animation theo hệ thống. CSS transition vẫn dùng cho hover/focus (rẻ).
- `@media (prefers-reduced-motion: reduce)` + `useReducedMotion()` → mọi animation về `0.01ms`.

---

## 2. Thay đổi cụ thể trên từng file

### 2.1 `src/index.css` (viết lại)
- Khai báo `@custom-variant dark (&:where(.dark, .dark *));` (Tailwind v4).
- `@theme inline` map token → utility: `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-line`, `--color-accent`, `--color-danger`, `--color-success`.
- `:root { ...light tokens... }` và `.dark { ...dark tokens... }`.
- `@layer base`: body `bg-bg text-text`, `::selection`, focus-visible ring dùng `--focus`, reduce-motion, `touch-action: manipulation`.
- Keyframes: `row-in`, `toast-in`, `check-draw`, `indeterminate`, `overlay-in`.
- Utility classes: `.hairline`, `.surface-card`, `.btn-primary`, `.btn-ghost`, `.touch-target` (`min-width/min-height: 44px`).

### 2.2 `index.html`
- Inline script trước CSS để đọc `localStorage['ts-theme']` / `prefers-color-scheme`, thêm class `dark` vào `<html>` → **không FOUC**.
- `<meta name="theme-color">` cập nhật bằng `useTheme` (xem 2.3); thêm `og:title/description`.
- Preload 2 font woff2 quyết định (latin + vietnamese) với `crossorigin`.

### 2.3 `src/hooks/useTheme.ts` (mới)
- State `ThemePreference = 'system' | 'light' | 'dark'`; lưu localStorage; `matchMedia` listener; apply `.dark` lên `documentElement`; sync `theme-color`.
- Trả `{ preference, resolved, setPreference }`.

### 2.4 `src/components/ThemeToggle.tsx` (mới)
- Nút 44×44 cycling `system → light → dark`, icon Sun/Moon/Monitor, `aria-label` mô tả trạng thái tiếp theo, tooltip `title`.
- Đặt trong header cạnh chip "File không rời trình duyệt".

### 2.5 `src/App.tsx`
- Layout `max-w-2xl lg:max-w-3xl`, `px-4 sm:px-6`, `pb-28 md:pb-10` (chừa chỗ sticky bar).
- Header: wordmark + privacy chip + `ThemeToggle`.
- Nâng `notice` thành `<Toast>` (xem 2.9) thay vì `<p>`.
- Thêm `useGlobalDrag()` → `<DragOverlay />` full-window.
- Đăng ký `Ctrl/Cmd + Enter` qua ref: `exportRef.current` do panel active đăng ký `handleExport` (xem 2.10); `Esc` đóng overlay/toast.
- Giữ nguyên logic `handleFiles` (auto-switch tab) — chỉ đổi cách hiển thị notice.

### 2.6 `src/components/Tabs.tsx`
- Underline active dùng `m.span layoutId="tab-indicator"` trượt giữa 2 tab (spring nhẹ), fallback CSS nếu `useReducedMotion()`.
- `role=tablist`, arrow-key navigation (←/→), `tabIndex={selected?0:-1}`, touch target 44px.
- Dùng token `text-text-muted` / `text-text`, `border-line`.

### 2.7 `src/components/Dropzone.tsx`
- Restyle: `surface-card`, border `1px dashed var(--line)`, hover `border-line-strong`, drag `border-accent bg-accent-soft scale-[1.005]`.
- Icon SVG chuyển thành bộ 3 icon theo state (idle / dragging / processing) với `transition`.
- `data-state` để CSS điều khiển; `aria-busy` khi xử lý; giữ `role=button`, keyboard.
- Empty-state: thêm dòng gợi ý “PDF · DOCX — tối đa 25 MB” dạng chip nhỏ.

### 2.8 `src/components/PdfRowItem.tsx` (giữ tên file, đổi cấu trúc)
- **Mobile (<768px):** card stacked — dòng 1: handle 44×44 + file icon + tên (`truncate`, `title`) + badge `N trang`; dòng 2: `RangeInputs` + nhóm 4 nút `⧉ × ↑ ↓` mỗi nút 44×44; dòng 3 (khi lỗi): message màu `--danger`.
- **Desktop:** vẫn 1 dòng ngang, handle + name + range + actions.
- Handle `⠿` có `aria-label`, `cursor-grab active:cursor-grabbing`, highlight đích khi drop (`ring-1 ring-accent`).
- Row enter/exit bằng `AnimatePresence` + `m.li` (`initial={{opacity:0,y:4}} animate ... exit={{opacity:0,height:0}}`); reorder dùng prop `layout` để FLIP mượt; target drop highlight `ring-1 ring-accent`.
- Không dùng hover làm affordance duy nhất (mobile).

### 2.9 `src/components/RangeInputs.tsx`
- `inputMode="numeric"`, `pattern="[0-9]*"`, `autoComplete="off"`.
- `min-h-11 w-14 sm:w-16`, `text-[16px] sm:text-sm`, `tabular-nums`, border-bottom 1px → border-full 1px khi focus, ring accent.
- Label `TỪ` / `ĐẾN` 11px uppercase phía trên, suffix `/ N`.
- Giữ contract `onChange(from, to)` và validation `rangeIssue` không đổi.

### 2.10 `src/components/StickyActionBar.tsx` (mới)
- Mobile: `fixed inset-x-0 bottom-0 z-30`, `bg-[var(--surface)]/90 backdrop-blur`, border-top 1px, `padding-bottom: env(safe-area-inset-bottom)`, chứa summary + primary button full-width 44px.
- Desktop: `md:static md:border-0 md:bg-transparent md:backdrop-blur-none`, nút auto width.
- Props: `{ summary, disabled, busy, label, onAction }`; dùng chung cho cả 2 panel.
- Progress bar 2px màu accent chạy ngang khi `busy`.

### 2.11 `src/components/StatusLine.tsx` → nâng thành `StatusFeedback` (giữ tên file)
- Map status → icon (spinner / check / alert) + màu token + `role="status"` hoặc `role="alert"`.
- Toast bọc trong `AnimatePresence`, `m.div` slide-up 240ms; success tự ẩn sau 3s (giữ error đến khi user thao tác). Progress bar dùng `m.div` thay vì CSS keyframe.
- `aria-live="polite"` cho running/done, `assertive` cho error.

### 2.12 `src/components/DragOverlay.tsx` + `src/hooks/useGlobalDrag.ts` (mới)
- `useGlobalDrag`: đếm `dragenter/dragleave` cấp `window` (chống nháy khi đi qua child), chỉ active khi `dataTransfer.types` có `Files`.
- Overlay `fixed inset-0 z-50 pointer-events-none`, nền `bg-[var(--bg)]/80 backdrop-blur-sm`, dropzone giả ở giữa; `AnimatePresence` + `m.div` fade/scale 180ms.
- `onDrop` tại window → `onFiles(files)` rồi reset counter. Không chặn drop của row reorder (kiểm tra `types`).

### 2.13 `src/hooks/useExportShortcut.ts` (mới)
- App giữ `exportRef: useRef<(() => void) | null>`; mỗi panel `useEffect` đăng ký hàm export của mình khi tab active, cleanup khi unmount/inactive.
- `document.addEventListener('keydown', e => { if ((e.metaKey||e.ctrlKey) && e.key==='Enter') { e.preventDefault(); exportRef.current?.() } })`.
- Hiện gợi ý `⌘/Ctrl + Enter` dưới nút export trên desktop (`hidden md:block`).

### 2.14 `src/hooks/usePdfRows.ts`
- **Không đổi thuật toán** (`copyPages`, cache `Map`). Bổ sung:
  - `addingFiles: boolean` + danh sách skeleton row trong lúc `loadPdf` (hiện chỉ có text “đang đọc file…”).
  - `announcement: string` (via callback) để `aria-live` báo “Đã chuyển lên/xuống”, “Đã nhân bản”.
- Dọn cache khi remove (giữ nguyên logic hiện tại).

### 2.15 `src/lib/download.ts`
- Sanitize filename: thay `/ \ : * ? " < > |` bằng `-`, giữ dấu tiếng Việt, fallback `ket-qua.pdf`.
- Xử lý `revokeObjectURL` trong `finally`-like (giữ delay 1s hiện tại).

### 2.16 `src/lib/pdf.ts`, `src/lib/word.ts`, `src/types.ts`, `src/types/mammoth.d.ts`
- Giữ nguyên logic. Chỉ đổi comment giải thích chunk splitting (2.20) và thêm type `ThemePreference` vào `types.ts`. Không đụng vào container `position:static` của Word (đã fix lỗi canvas height=0 ở MVP).

### 2.17 `package.json`
```json
"scripts": {
  "dev": "vite",
  "typecheck": "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json",
  "check": "npm run typecheck && npm run lint && npm run build",
  "build": "tsc -b && vite build",
  "lint": "oxlint",
  "preview": "vite preview"
}
```
- Đổi dependency `@fontsource/inter` → `@fontsource-variable/inter`; thêm `motion`.
- Bọc `<App/>` trong `<LazyMotion features={loadDomAnimation} strict>` với `loadDomAnimation = () => import('motion/react').then(m => m.domAnimation)` — feature chunk tải sau paint, không nằm trong initial bundle.

### 2.18 `.gitignore`
- Bổ sung: `.env`, `.env.*`, `!.env.example`, `.vercel` (đã có), `.turbo`, `coverage/`, `*.tsbuildinfo`, `.DS_Store` (đã có).

### 2.19 `.github/workflows/ci.yml` (mới)
- Trigger `push: main`, `pull_request`; job `checkout → setup-node 22 (cache npm) → npm ci → npm run check`. Không deploy trong CI (Vercel lo).

### 2.20 `vite.config.ts` + tối ưu bundle
- Dùng `build.rolldownOptions.output.advancedChunks` (Vite 8 / Rolldown) tách nhóm: `pdf-lib`, `mammoth`, `jspdf+html2canvas+html2pdf` → mỗi nhóm 1 chunk lazy, **không modulepreload**.
- Đổi font sang variable: từ 12 file font xuống ~2 woff2; CSS giảm từ 15.24 kB.
- Mục tiêu: main ≤ **180 kB raw / 60–70 kB gzip** (motion feature chunk tải sau paint, không tính vào initial); heavy chunks chỉ tải khi bấm tab tương ứng; verify bằng `npm run build` so với baseline ở mục 0. Nếu motion feature chunk kéo initial vượt ngưỡng, chuyển `AnimatePresence` sang `LazyMotion` async hoặc giảm số `layout` animation.

### 2.21 `vercel.json` (mới)
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/assets/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]},
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
    ]}
  ]
}
```
- CSP: **không bật ngay** ở chế độ enforce (html2pdf tạo iframe/CSS inline có thể vỡ); nếu cần, thêm `Content-Security-Policy-Report-Only` trước, test bằng browser rồi mới enforce.

### 2.22 `README.md`
- Cập nhật: dark mode, shortcut, touch target, CI, auto deploy, lệnh `npm run check`; giữ nguyên 2 link.

### 2.23 `PLAN_V2.md`
- Copy từ plan này vào gốc repo sau khi duyệt.

---

## 3. UX theo thiết bị

| Hành vi | Mobile (<768px) | Desktop (≥768px) |
|---|---|---|
| Layout | Card dọc, full-width, `max-w-2xl` | 1 dòng ngang, `max-w-3xl` căn giữa |
| Touch target | ≥ 44×44 mọi nút/ô nhập; input font 16px | 32–36px ok nhưng vẫn giữ hover/focus rõ |
| Nhập trang | `inputMode="numeric"`; label `TỪ/ĐẾN` | Giữ, có spinner native |
| Sắp xếp | Nút `↑ ↓` 44px là chính; kéo vẫn hoạt động | Kéo handle ⠿ + arrow-key |
| Dropzone | `min-h-140`, icon + text, full width | `min-h-184`, hover border |
| Kéo file | Overlay toàn màn hình (iOS không có DnD → dùng Browse) | Overlay toàn màn hình + dropzone_local |
| Action bar | `fixed` đáy + safe-area + summary + nút full-width | Inline dưới danh sách |
| Shortcut | Không (dùng nút) | `⌘/Ctrl + Enter` export, `Esc` đóng overlay |
| Feedback | Toast trên sticky bar, rung nhẹ icon success | Toast góc dưới phải, micro-animation |
| Dark mode | Toggle góc trên, theo hệ thống mặc định | Toggle + `(A)` shortcut tuỳ chọn |

**Empty / running / error / success** đều có state riêng: empty = dropzone + 3 chip hướng dẫn; running = spinner trên nút + progress 2px + skeleton row; error = icon đỏ + message cụ thể + nút “Thử lại” (re-run action); success = icon check animate + toast tự ẩn.

---

## 4. Vercel + Git (CI/CD)

1. **Sửa Git integration** (hiện `vercel git connect` lỗi do chưa cài GitHub App):
   - Vào https://vercel.com/dillysluvus-projects/pdf/settings/git → cài/authorize Vercel GitHub App cho `dillysluvu`.
   - `npx vercel link` → chọn project hiện tại (`pdf`) → `npx vercel git connect https://github.com/dillysluvu/tailieu-sach --yes`.
   - Kiểm tra: `npx vercel project ls`, Settings → Git hiện repo; `git push` thử một commit → dashboard xuất hiện deployment mới.
   - Nếu vẫn lỗi: fallback = import lại repo thành project mới `tailieu-sach` trên dashboard (đổi live URL, cần cập nhật README) **hoặc** GitHub Actions dùng secret `VERCEL_TOKEN` + `vercel --prod --yes`.
2. **Giữ live URL hiện tại** `https://pdf-lac-chi.vercel.app`; tuỳ chọn đổi tên project hiển thị thành `tailieu-sach` trong dashboard (không đổi domain).
3. **Preview deploy:** sau khi Git connected, mở branch phụ → PR → Vercel tự tạo Preview URL + comment. Nếu muốn public preview, tắt Deployment Protection cho Preview (hiện production đang `vercel_authentication` nhưng curl vẫn 200 — cần verify lại sau khi đổi config).
4. **vercel.json:** commit file ở 2.21 → push → verify `curl -I https://pdf-lac-chi.vercel.app/assets/<chunk>.js` trả `Cache-Control: immutable`; verify rewrite `/some-route` vẫn trả HTML 200.
5. **Git workflow:** commit `.gitignore` + `ci.yml` + script `check`; mọi thay đổi chạy `npm run check` trước push (CI cũng chạy lại). Không dùng hook bắt buộc để tránh cản workflow; nếu muốn, thêm `.githooks/pre-push` và `git config core.hooksPath .githooks`.

---

## 5. Trình tự triển khai (sau khi duyệt)

1. Design tokens + dark mode + theme toggle + `index.html` bootstrap.
2. Restyle Tabs / Dropzone / RangeInputs / PdfRowItem / StatusLine bằng token + motion.
3. StickyActionBar + useGlobalDrag/DragOverlay + useExportShortcut.
4. Mobile pass: 44px targets, numeric inputMode, stacked card, safe-area, overflow check.
5. Bundle pass: variable font, advancedChunks, đo lại kích thước, target < 1s.
6. `vercel.json`, `.github/workflows/ci.yml`, `.gitignore`, script `check`.
7. Sửa Vercel Git connect → push → verify auto deploy + Preview.
8. `npm run check` + browser test 375px/1440px + curl headers → copy `PLAN_V2.md` vào repo + commit/push cuối.

## 6. Tiêu chí nghiệm thu

- `npm run check`, `npm run lint`, `npm run build` đều sạch.
- Chromium 375px & 1440px: mọi nút/ô nhập ≥ 44×44; `inputMode=numeric`; `scrollWidth <= clientWidth`; sticky bar `position: fixed` trên mobile.
- Dark mode đổi được, lưu qua reload, không FOUC, contrast đạt.
- `⌘/Ctrl+Enter` xuất file; overlay hiện khi kéo file từ desktop vào cửa sổ.
- Main JS ≤ 60–70 kB gzip (chưa gồm motion feature chunk tải sau paint); heavy libs không tải khi mới mở trang; `useReducedMotion()` hoạt động.
- Push lên `main` tự tạo deployment Vercel; PR có Preview URL; `curl -I` thấy cache + security headers.

---

## 7. Quyết định đã chốt

| Quyết định | Lựa chọn |
|---|---|
| Accent | **Indigo `#5E6AD2`** (dark `#8B94E8`) |
| Theme | **Theo hệ thống + 3 trạng thái** System / Light / Dark, nhớ localStorage, chống FOUC |
| Vercel | **Giữ project `pdf`** và live URL `https://pdf-lac-chi.vercel.app` |
| CI | **`npm run check` + GitHub Actions**, không pre-push hook |
| Motion | **`motion` / framer-motion** (LazyMotion + async domAnimation, `m`, `AnimatePresence`, `layout`) |
| Preview file | Giữ tại plan để duyệt; sau khi implement copy vào `docs/preview-v2.html` nếu bạn muốn lưu trong repo |

---

### Bàn giao triển khai

Kế hoạch và preview đã được duyệt. Để bắt đầu viết code, hãy **chuyển sang agent triển khai (Implementation/Builder)**. Agent đó sẽ copy `PLAN_V2.md` vào gốc repo, copy `PREVIEW_V2.html` vào `docs/preview-v2.html`, rồi thực hiện tuần tự 8 bước ở mục 5. Plan Mode hiện tại không cho phép ghi file vào thư mục dự án.

---

## 8. Ghi chú triển khai thực tế (2026-11-20)

- Đã copy file này vào gốc repo và `docs/preview-v2.html`.
- `npm run check` (typecheck + lint + build) sạch.
- Browser test Chromium 1440px + 390px: **21/21** — gồm gộp 6 trang, nhân bản 9 trang, `Ctrl+Enter`, sắp xếp bằng mũi tên, khoảng trang không hợp lệ, overlay kéo thả toàn cửa sổ, dark mode lưu qua reload, auto-switch tab, Word cắt 1 trang, 44px touch target, sticky bar `fixed`, không tràn ngang, không lỗi pageerror.
- Bundle sau tối ưu: app `32 kB / 10.6 kB gzip`, React `219 kB / 68 kB gzip`, Motion `143 kB / 48 kB gzip`; **chỉ 3 chunk này được modulepreload**. `pdf-vendor` (510 kB) và `word-vendor` (1.26 MB) chỉ tải khi dùng đến tính năng tương ứng. Font variable: đúng 2 file woff2 (latin + vietnamese).
- **Điều chỉnh mục tiêu:** do đã chọn thư viện Motion theo yêu cầu, initial JS thực tế ~128 kB gzip (cao hơn mục tiêu 60–70 kB trong plan). Có thể giảm bằng cách bỏ Motion và dùng CSS thuần nếu ưu tiên bundle nhỏ hơn; hiện tại ưu tiên theo lựa chọn motion của người dùng.
- CSP enforce không bật (html2pdf tạo iframe/CSS inline) — chỉ dùng các security headers cơ bản trong `vercel.json`.

- Vercel Git connect (native) không hoàn tất: Vercel GitHub App chưa được cài cho account `dillysluvu` (`/v1/integrations/integrations` trả `[]`). Đã dùng fallback GitHub Actions với secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`; workflow chạy thành công trên push `main` (deploy production) và sẵn sàng comment preview cho PR. Muốn chuyển sang native: cài GitHub App rồi connect tại `https://vercel.com/dillysluvus-projects/pdf/settings/git`, sau đó xóa 2 job deploy trong `ci.yml`.
- `vercel.json` đã verify: `/assets/*` trả `Cache-Control: public, max-age=31536000, immutable` kèm các security headers; live URL vẫn `https://pdf-lac-chi.vercel.app` (HTTP 200).
