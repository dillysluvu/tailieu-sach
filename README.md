# Tài liệu PDF

Bộ công cụ xử lý tài liệu gọn nhẹ, thân thiện cho việc soạn bài & dạy học: **Cắt & Gộp PDF**, **Tách PDF (.zip)**, **PDF → Ảnh**, **PDF → Word (Toán – Văn)**, **Word → PDF** và **Ảnh → PDF**. Hỗ trợ cài đặt như ứng dụng (PWA) trên điện thoại và máy tính.

## Tính năng

1. **Cắt & Gộp PDF:** Kéo thả nhiều file `.pdf`, chọn khoảng `Từ → Đến`, nhân bản đoạn, đổi thứ tự, xem trước và gộp giữ nguyên chất lượng (`pdf-lib`).
2. **Tách PDF:** Chia 1 file dày thành nhiều file nhỏ theo *số trang mỗi phần* (vd: cứ 4 trang 1 đề), *tự chọn khoảng* (`1-4, 5-8`), hoặc *mỗi trang 1 file*, tải gọn thành `.zip` (`fflate`).
3. **PDF → Ảnh:** Xuất trang PDF sang JPG/PNG sắc nét để gửi thẳng qua Zalo, chọn 3 mức độ nét, tải 1 ảnh trực tiếp hoặc nhiều ảnh dạng `.zip` kèm nút lưu lẻ từng trang.
4. **PDF → Word (`.docx`):**
   - **Chế độ AI Toán – Văn:** Gửi ảnh trang đã chọn (hoặc ảnh chụp trang sách từ điện thoại) qua `/api/pdf-to-word` (Gemini Vision) → tạo `.docx` bằng `markdown-docx` với công thức Toán chuẩn Word (OMML) và định dạng Ngữ Văn (thơ, trích dẫn, bảng biểu).
   - **Chế độ Nhanh trên máy (Offline):** Tách chữ trực tiếp bằng `pdf.js` → `.docx` ngay trên trình duyệt, không cần mạng/API.
5. **Word → PDF:** Kéo `.docx` sang PDF A4, cắt khoảng trang và xem trước/tải trực tiếp.
6. **Ảnh → PDF:** Gom nhiều ảnh `JPG / PNG / WebP` thành 1 file PDF A4 (tự chọn chiều ngang/dọc, hỗ trợ ảnh chụp điện thoại).

## Chạy local & cấu hình AI (tùy chọn)

```bash
npm install
npm run dev
npm run check      # typecheck + lint + build
npm run test:e2e   # kiểm thử Playwright trên desktop & mobile
```

Để bật chế độ **AI Toán – Văn** trong tab `PDF → Word` (deploy Vercel hoặc backend nội bộ):
- Tạo biến môi trường theo mẫu [`.env.example`](.env.example):
  - `GEMINI_API_KEY`: khóa Gemini API (lấy tại Google AI Studio).
  - `ACCESS_PIN` *(tùy chọn)*: mã PIN riêng để chỉ người dùng nội bộ mới gọi được API AI.

## Tự host nội bộ trên Homelab (Dell i3 Gen 7)

Xem hướng dẫn từng bước (Caddy SPA, SFTPGo kho 1TB, Tailscale HTTPS, Cloudflare Tunnel, Gotenberg tùy chọn) trong [`vp.html`](vp.html).

## Giới hạn

- Tối đa **500 MB/file**, **100 file mỗi lần kéo**, **10.000 trang xuất**.
- Mọi thao tác Cắt/Gộp, Tách ZIP, PDF → Ảnh, Ảnh → PDF, Word → PDF và PDF → Word (Offline) đều chạy **100% trên trình duyệt**. Riêng chế độ **AI Toán – Văn** gửi ảnh của các trang được chọn tới `/api/pdf-to-word` để nhận diện công thức và bố cục.
