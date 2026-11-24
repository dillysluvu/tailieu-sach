# Tài liệu PDF (`sachpdf.vercel.app`)

Bộ công cụ xử lý tài liệu gọn nhẹ, thân thiện cho việc soạn bài & dạy học: **Cắt & Gộp PDF**, **Tách PDF (.zip)**, **PDF → Ảnh**, **PDF → Word (Toán – Văn)**, **Word → PDF** và **Ảnh → PDF**. Hỗ trợ cài đặt như ứng dụng (PWA) trên điện thoại và máy tính.

- **Bản dùng trực tuyến (Public):** https://sachpdf.vercel.app

## Tính năng

1. **Cắt & Gộp PDF:** Kéo thả nhiều file `.pdf`, chọn khoảng `Từ → Đến`, nhân bản đoạn, đổi thứ tự, xem trước và gộp giữ nguyên chất lượng (`pdf-lib`).
2. **Tách PDF:** Chia 1 file dày thành nhiều file nhỏ theo *số trang mỗi phần* (vd: cứ 4 trang 1 đề), *tự chọn khoảng* (`1-4, 5-8`), hoặc *mỗi trang 1 file*, tải gọn thành `.zip` (`fflate`).
3. **PDF → Ảnh:** Xuất trang PDF sang JPG/PNG sắc nét để gửi thẳng qua Zalo, chọn 3 mức độ nét, tải 1 ảnh trực tiếp hoặc nhiều ảnh dạng `.zip` kèm nút lưu lẻ từng trang.
4. **PDF → Word (`.docx`):**
   - **Chế độ AI Toán – Văn:** Gửi ảnh trang đã chọn (hoặc ảnh chụp trang sách từ điện thoại) qua `/api/pdf-to-word` (Gemini Vision) → tạo `.docx` bằng `markdown-docx` với công thức Toán chuẩn Word (OMML) và định dạng Ngữ Văn (thơ, trích dẫn, bảng biểu). Hỗ trợ sửa trực tiếp văn bản/công thức trước khi tải lại `.docx`.
   - **Chế độ Nhanh trên máy (Offline):** Phân tích bố cục trực tiếp bằng `pdf.js` + `docx`: giữ chữ **đậm** / *nghiêng*, căn giữa, bảng biểu & lưới đáp án `A. B. C. D.`, giữ ngắt dòng thơ và tự động nhúng ảnh đối với trang scan.
5. **Word → PDF:** Dựng trực tiếp từ bố cục `.docx` gốc (`docx-preview`) kèm bộ chuyển đổi công thức Toán Word (OMML), bảng biểu, lề A4 chuẩn, tránh cắt đôi dòng chữ khi sang trang, hỗ trợ cắt khoảng trang và nút **In / PDF nét chữ** để xuất PDF vector giữ nguyên lớp chữ.
6. **Ảnh → PDF:** Gom nhiều ảnh `JPG / PNG / WebP` thành 1 file PDF A4 (tự chọn chiều ngang/dọc, hỗ trợ ảnh chụp điện thoại).

## Chạy local & cấu hình AI (tùy chọn)

```bash
npm install
npm run dev
npm run check      # typecheck + lint + build
npm run test:e2e   # kiểm thử Playwright trên desktop & mobile
```

Để bật sẵn chế độ **AI Toán – Văn** trên Vercel cho mọi người dùng:
- Thêm biến môi trường trong Vercel Project Settings theo mẫu [`.env.example`](.env.example):
  - `GEMINI_API_KEY`: khóa Gemini API (lấy tại Google AI Studio).
  - `ACCESS_PIN` *(tùy chọn)*: mã PIN riêng để chỉ người có mã mới gọi được API AI dùng key máy chủ.
- Nếu chưa cấu hình `GEMINI_API_KEY` trên máy chủ, người dùng vẫn có thể dán Gemini API Key cá nhân ngay trên giao diện hoặc dùng chế độ **Nhanh trên máy (Offline)** không cần mạng.

## Giới hạn

- Tối đa **500 MB/file**, **100 file mỗi lần kéo**, **10.000 trang xuất**.
- Mọi thao tác Cắt/Gộp, Tách ZIP, PDF → Ảnh, Ảnh → PDF, Word → PDF và PDF → Word (Offline) đều chạy **100% trên trình duyệt**. Riêng chế độ **AI Toán – Văn** gửi ảnh của các trang được chọn tới `/api/pdf-to-word` để nhận diện công thức và bố cục.
