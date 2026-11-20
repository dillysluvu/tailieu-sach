# file — Document Workspace

Cắt & gộp PDF, chuyển Word (`.docx`) và ảnh (JPG/PNG) sang PDF. **Mọi thứ đều xử lý trên trình duyệt** — file không được upload, không có máy chủ, không quảng cáo.

## Tính năng

**Tab 1 — Cắt & Gộp PDF**
- Kéo thả nhiều file `.pdf` cùng lúc; kéo từ bất kỳ đâu vào cửa sổ đều được.
- Mỗi dòng: tên file, tổng số trang, ô `Từ` → `Đến` (mặc định `1 → trang cuối`).
- Kéo ⠿ hoặc dùng ↑ ↓ để đổi thứ tự xuất (nút 44×44 thân thiện cảm ứng).
- Nhân bản dòng (⧉) để lấy nhiều đoạn từ cùng một file, ví dụ `1–2` và `8–10`.
- Gộp thành `ket-qua.pdf` bằng `pdf-lib copyPages` — không nén lại, giữ nguyên chất lượng.
- Nút **Xem trước** dựng PDF đầu ra bằng `pdf.js` (lật trang, `Esc` để đóng) trước khi tải.

**Tab 2 — Word → PDF**
- Kéo `.docx` vào là tự động chuyển sang PDF (A4), hiển thị số trang.
- Nhập `Từ` → `Đến` để cắt trước khi tải về.
- Nút **Xem trước** hiển thị PDF sau khi chuyển/cắt, tải thẳng từ modal nếu ưng ý.

**Tab 3 — Ảnh → PDF**
- Kéo nhiều ảnh `.jpg` / `.png` cùng lúc; ⬆ ⬇ để đổi thứ tự, × để bỏ ảnh.
- Mỗi ảnh thành một trang A4 (tự chọn chiều ngang/dọc, vừa khung, không cắt ảnh).
- Giới hạn chung **500 MB/file · 100 file/lần · 10.000 trangxuất** như các tab khác.

**Xuất & preview dùng chung**
- Đặt **Tên file xuất** (tự thêm `.pdf`, lọc ký tự không hợp lệ).
- Chọn trang: **Tất cả / Trang lẻ / Trang chẵn / Trang cuối** — áp dụng cho cả 3 tab.
- Preview render **theo trang khi cuộn tới** (`IntersectionObserver`), giải phóng canvas khi rời khỏi màn hình và nạp thêm từng đợt 20 trang — không dựng cả tài liệu một lúc.
- Bytes đầu ra được cache theo chữ ký cấu hình, bấm lại **Xem trước / Tải** không tính lại.

**Giao diện V2**
- Light / Dark theo hệ thống, nút chuyển góc trên (System → Light → Dark).
- Mobile-first: thanh hành động ghim đáy, ô nhập bàn phím số, thẻ file xếp dọc, vùng chạm ≥ 44px.
- Desktop: bố cục căn giữa, full-window drag overlay, phím tắt `⌘ / Ctrl + Enter` để xuất.
- Motion nhẹ với `motion` (tải feature theo yêu cầu, tôn trọng `prefers-reduced-motion`).
- Preview PDF đầu ra mở trong modal, lật trang và đóng bằng `Esc`.
- Title `file — Document Workspace`; ảnh chia sẻ `public/og-image.png` (OG/Twitter card).

Kéo sai định dạng sẽ tự động chuyển sang tab phù hợp.

## Chạy local

```bash
npm install
npm run dev
npm run check      # typecheck + lint + build
npm run preview
```

## Giới hạn

- Tối đa **500 MB/file**, **100 file mỗi lần kéo**, **10.000 trang output**.
- Với file rất lớn, tốc độ và bộ nhớ phụ thuộc vào thiết bị — nên đóng bớt tab và xử lý từng đợt nếu máy yếu.
- PDF được mã hóa cần mở khóa trước.
- `.docx` không có khái niệm trang cố định; số trang được tính theo bản PDF A4 sau chuyển đổi. Mammoth giữ tốt văn bản, tiêu đề, danh sách và ảnh cơ bản; layout phức tạp (cột, header/footer, text box) có thể không giữ nguyên.

## Cấu trúc

Vite 8 + React 19 + TypeScript 7 + Tailwind CSS v4 + Motion 14. Script E2E dùng Playwright (`npm run test:e2e`). `pdf-lib`, `mammoth`, `html2pdf.js` và `pdfjs-dist` (dùng để preview) được tải động theo nhu cầu; `vercel.json` cấu hình SPA rewrite, cache immutable cho `/assets/*` và security headers. Deploy tĩnh, output là `dist/`.

Xem bản thiết kế V2: [`docs/preview-v2.html`](docs/preview-v2.html) và [`PLAN_V2.md`](PLAN_V2.md).

## CI / Deploy

- GitHub Actions (`.github/workflows/ci.yml`) chạy `npm run check` và job `e2e` (cài Chromium, build, chạy `npm run test:e2e`) trên push `main` và mọi PR; deploy chỉ chạy khi cả hai xanh.
- Push `main` → tự deploy production; PR → tự deploy preview và comment URL vào PR.
- secrets cần thiết: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Nếu sau này bật native Git integration trong Vercel Dashboard, xóa job `deploy-production` / `deploy-preview` để tránh deploy trùng.
- Native Git connect hiện chưa bật vì Vercel GitHub App chưa được cài cho tài khoản; vào `https://vercel.com/dillysluvus-projects/pdf/settings/git` để connect nếu muốn.

## Links

- Repository: https://github.com/dillysluvu/tailieu-sach
- Live: https://sachpdf.vercel.app (các domain cũ `tailieu-sach.vercel.app`, `pdf-lac-chi.vercel.app` vẫn hoạt động)
