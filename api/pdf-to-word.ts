import type { IncomingMessage, ServerResponse } from 'node:http'

type RequestBody = {
  images?: string[]
  subject?: 'math' | 'literature' | 'general'
}

const PROMPTS: Record<'math' | 'literature' | 'general', string> = {
  math: `Bạn là chuyên gia số hóa đề thi & tài liệu dạy học môn Toán tiếng Việt sang Markdown sạch để xuất ra Microsoft Word.
Yêu cầu bắt buộc:
- Giữ chính xác 100% tiếng Việt có dấu, số thứ tự **Câu 1.**, **Bài 1.**, **Phần I.** và các đáp án trắc nghiệm A, B, C, D.
- MỌI biểu thức toán học, phân số, căn thức, lũy thừa, hệ phương trình, hình học (tam giác, góc, song song, vuông góc...) PHẢI viết bằng LaTeX chuẩn: inline dùng $...$ và công thức riêng dòng dùng $$...$$. Tuyệt đối KHÔNG dùng \\( ... \\) hay \\[ ... \\].
- Nếu trang có bảng biểu hoặc phần đầu đề thi chia 2 cột (Sở GD / Trường — Kỳ thi / Mã đề), hãy biểu diễn bằng Markdown table.
- Không thêm lời bình luận, không bọc toàn bộ kết quả trong khối \`\`\`markdown. Chỉ trả về đúng nội dung tài liệu đã số hóa.`,

  literature: `Bạn là chuyên gia số hóa tài liệu dạy học môn Ngữ Văn tiếng Việt sang Markdown sạch để xuất ra Microsoft Word.
Yêu cầu bắt buộc:
- Giữ chính xác 100% chính tả và dấu tiếng Việt.
- Giữ nguyên cấu trúc tiêu đề, đề bài, phần **I. ĐỌC HIỂU** / **II. LÀM VĂN**, đoạn trích, bảng biểu (Markdown table).
- Với các đoạn THƠ, giữ nguyên ngắt dòng từng câu thơ và khổ thơ (dùng hai dấu cách cuối dòng hoặc blockquote \`>\`).
- Không thêm lời bình luận, không bọc toàn bộ kết quả trong khối \`\`\`markdown. Chỉ trả về đúng nội dung tài liệu.`,

  general: `Bạn là chuyên gia số hóa tài liệu học tập tiếng Việt sang Markdown sạch để xuất ra Microsoft Word.
Yêu cầu bắt buộc:
- Giữ chính xác 100% tiếng Việt có dấu, tiêu đề, danh sách, bảng biểu (Markdown table) và cấu trúc đề bài.
- Nếu có công thức toán/khoa học, viết bằng LaTeX chuẩn ($...$ hoặc $$...$$), KHÔNG dùng \\( ... \\) hay \\[ ... \\].
- Không thêm lời bình luận, không bọc toàn bộ kết quả trong khối \`\`\`markdown. Chỉ trả về đúng nội dung tài liệu.`,
}

function normalizeGeminiMarkdown(raw: string): string {
  return raw
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expr: string) => `\n$$\n${expr.trim()}\n$$\n`)
    .replace(/\\\((.+?)\\\)/g, (_match, expr: string) => `$${expr.trim()}$`)
    .trim()
}

async function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<RequestBody> {
  if (req.body && typeof req.body === 'object') return req.body as RequestBody
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as RequestBody
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const serverApiKey = process.env.GEMINI_API_KEY?.trim() ?? ''
  const requiredPin = process.env.ACCESS_PIN?.trim() ?? ''

  if (req.method === 'GET') {
    sendJson(res, 200, {
      aiConfigured: Boolean(serverApiKey),
      pinRequired: Boolean(serverApiKey && requiredPin),
    })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Chỉ hỗ trợ phương thức GET hoặc POST.' })
    return
  }

  const userApiKey = String(req.headers['x-gemini-key'] ?? '').trim()
  const apiKey = serverApiKey || userApiKey

  if (serverApiKey && requiredPin && !userApiKey) {
    const providedPin = String(req.headers['x-access-pin'] ?? '').trim()
    if (providedPin !== requiredPin) {
      sendJson(res, 401, { error: 'Mã khóa truy cập AI không đúng. Hãy kiểm tra lại mã PIN.' })
      return
    }
  }

  if (!apiKey) {
    sendJson(res, 503, {
      error:
        'Máy chủ chưa cài GEMINI_API_KEY. Bạn có thể dán Gemini API Key miễn phí của mình hoặc dùng chế độ "Nhanh trên máy (Offline)".',
    })
    return
  }

  let body: RequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Dữ liệu gửi lên không hợp lệ.' })
    return
  }

  const images = Array.isArray(body.images) ? body.images.filter((item) => typeof item === 'string' && item.length > 0) : []
  if (!images.length || images.length > 5) {
    sendJson(res, 400, { error: 'Mỗi lượt gửi cần từ 1 đến 5 trang ảnh.' })
    return
  }

  const subject = body.subject && body.subject in PROMPTS ? body.subject : 'general'
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const parts: Array<Record<string, unknown>> = [{ text: PROMPTS[subject] }]
  for (const base64 of images) {
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: base64,
      },
    })
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    })

    const payload = (await upstream.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: { message?: string }
    }

    if (!upstream.ok) {
      sendJson(res, 502, {
        error: payload.error?.message || `Gemini API trả về lỗi (${upstream.status}).`,
      })
      return
    }

    const rawText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    sendJson(res, 200, { markdown: normalizeGeminiMarkdown(rawText) })
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Lỗi gọi dịch vụ AI.',
    })
  }
}
