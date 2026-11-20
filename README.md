# sạch.

Cắt & gộp PDF theo khoảng trang và chuyển Word (`.docx`) sang PDF. **Mọi thử đều xử lý trên trình duyệt** — file không được upload, không có máy chủ, không quảng cáo.

## Tính năng

**Tab 1 — Cắt & Gộp PDF**
- Kéo thả nhiều file `.pdf` cùng lúc; mỗi file một dòng gồm tên, tổng số trang và ô `Từ` → `Đến` (mặc định `1 → trang cuối`).
- Kéo ⠿ hoặc dùng ↑ ↓ để đổi thứ tự xuất.
- Nhân bản dòng (⧉) để lấy nhiều đoạn từ cùng một file, ví dụ `1–2` và `8–10`.
- Gộp tất cả đoạn thành một file `ket-qua.pdf` bằng `pdf-lib copyPages` — không nén lại, giữ nguyên chất lượng.

**Tab 2 — Word → PDF**
- Kéo `.docx` vào là tự động chuyển sang PDF (A4), hiển thị số trang.
- Nhập `Từ` → `Đến` để cắt trước khi tải về.

Kéo sai định dạng sẽ tự động chuyển sang tab phù hợp.

## Chạy local

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Giới hạn

- Tối đa 25 MB/file, 20 file mỗi lần kéo, 1000 trang output.
- PDF được mã hóa cần mở khóa trước.
- `.docx` không có khái niệm trang cố định; số trang được tính theo bản PDF A4 sau chuyển đổi. Mammoth giữ tốt văn bản, tiêu đề, danh sách và ảnh cơ bản; layout phức tạp (cột, header/footer, text box) có thể không giữ nguyên.

## Cấu trúc

Vite + React 19 + TypeScript + Tailwind CSS v4. Các thư viện nặng (`pdf-lib`, `mammoth`, `html2pdf.js`) được tải theo yêu cầu. Deploy tĩnh, output là `dist/`.

## Links

- Repository: https://github.com/dillysluvu/tailieu-sach
- Live: đang cập nhật sau khi deploy.
