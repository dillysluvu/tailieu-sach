import type { TabKey } from '../types'

export type TabMeta = {
  key: TabKey
  label: string
  hint: string
  panel: string
  group: 'organize' | 'convert'
}

export const TAB_LIST: TabMeta[] = [
  {
    key: 'pdf',
    label: 'Cắt & Gộp PDF',
    hint: 'Ghép file, lấy đoạn trang & ghép 2 mặt',
    panel: 'panel-pdf',
    group: 'organize',
  },
  {
    key: 'split',
    label: 'Tách PDF',
    hint: 'Chia theo số trang, khoảng hoặc mốc MB',
    panel: 'panel-split',
    group: 'organize',
  },
  {
    key: 'compress',
    label: 'Nén PDF',
    hint: 'Giảm dung lượng, vừa mốc gửi Zalo',
    panel: 'panel-compress',
    group: 'organize',
  },
  {
    key: 'edit',
    label: 'Chỉnh trang',
    hint: 'Xoay, sắp xếp, đánh số, dấu mờ, A4, cắt lề',
    panel: 'panel-edit',
    group: 'organize',
  },
  {
    key: 'pdf2img',
    label: 'PDF → Ảnh',
    hint: 'Xuất ảnh JPG/PNG sắc nét gửi Zalo',
    panel: 'panel-pdf2img',
    group: 'convert',
  },
  {
    key: 'pdf2word',
    label: 'PDF → Word',
    hint: 'Chuyển đề Toán – Văn sang .docx sửa được',
    panel: 'panel-pdf2word',
    group: 'convert',
  },
  {
    key: 'word',
    label: 'Word → PDF',
    hint: 'Đổi .docx ra PDF A4 chuẩn công thức Toán',
    panel: 'panel-word',
    group: 'convert',
  },
  {
    key: 'image',
    label: 'Ảnh → PDF',
    hint: 'Gom nhiều ảnh thành 1 file PDF A4 gọn nhẹ',
    panel: 'panel-image',
    group: 'convert',
  },
]

export const TAB_INFO: Record<TabKey, { label: string; hint: string }> = Object.fromEntries(
  TAB_LIST.map((t) => [t.key, { label: t.label, hint: t.hint }]),
) as Record<TabKey, { label: string; hint: string }>
