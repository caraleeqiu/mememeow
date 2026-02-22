import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

// 允许的域名白名单
const ALLOWED_ORIGINS = [
  'https://mememeow.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

// 设置 CORS 头（限制来源）
function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin || ''
  const isProduction = process.env.VERCEL_ENV === 'production'

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else if (!isProduction) {
    // 非生产环境（开发、预览）允许所有来源
    res.setHeader('Access-Control-Allow-Origin', '*')
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// 安全日志（生产环境不记录敏感信息）
function log(tag: string, message: string, data?: Record<string, unknown>) {
  const isProduction = process.env.VERCEL_ENV === 'production'
  if (isProduction) return

  const safeData = data ? { ...data } : {}
  delete safeData.apiKey
  delete safeData.key
  delete safeData.token
  console.log(`[${tag}] ${message}`, Object.keys(safeData).length > 0 ? JSON.stringify(safeData) : '')
}

// 验证 Base64 数据
function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false
  // 检查是否为有效的 base64 字符
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  return base64Regex.test(str) && str.length > 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { pdfBase64 } = req.body

  // 验证输入
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ error: 'PDF data is required' })
  }

  if (!isValidBase64(pdfBase64)) {
    return res.status(400).json({ error: 'Invalid PDF data format' })
  }

  // 限制文件大小 (20MB base64 约等于 15MB 原文件)
  const maxSize = 20 * 1024 * 1024
  if (pdfBase64.length > maxSize) {
    return res.status(400).json({ error: 'PDF 文件太大，请选择小于 15MB 的文件' })
  }

  if (!GEMINI_API_KEY) {
    log('extract-pdf', 'Gemini API key not configured')
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }

  try {
    log('extract-pdf', 'Processing PDF', { sizeKB: Math.round(pdfBase64.length / 1024) })

    // 用 Gemini 提取 PDF 文本
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60秒超时

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Extract ONLY English sentences from this PDF document for reading practice.

Rules:
1. Extract ONLY sentences that are in English
2. Skip any Chinese, Japanese, Korean or other non-English text
3. Split into sentences (one per line)
4. Fix any OCR errors or formatting issues
5. Each sentence should be 10-150 characters
6. Output ONLY the English sentences, no explanations

If there are NO English sentences at all, respond with ONLY: "NO_ENGLISH_FOUND"`
            },
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: pdfBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        }
      }),
    })

    clearTimeout(timeoutId)

    if (!geminiResponse.ok) {
      log('extract-pdf', 'Gemini error', { status: geminiResponse.status })
      return res.status(500).json({ error: 'PDF 处理失败' })
    }

    const geminiData = await geminiResponse.json()
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    log('extract-pdf', 'Extracted text', { length: text.length })

    // 检查是否没有英文内容
    if (text.trim() === 'NO_ENGLISH_FOUND') {
      return res.status(400).json({ error: '未检测到英文内容，请上传包含英文的文档~' })
    }

    // 解析句子
    const sentences = text
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 10 && s.length <= 200)
      .slice(0, 50)

    if (sentences.length === 0) {
      return res.status(400).json({ error: '未能从 PDF 中提取到有效句子' })
    }

    log('extract-pdf', 'Extracted sentences', { count: sentences.length })

    return res.status(200).json({ sentences })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage.includes('aborted') || errorMessage.includes('AbortError')) {
      return res.status(500).json({ error: 'PDF 处理超时，请尝试较小的文件' })
    }

    log('extract-pdf', 'Error', { error: errorMessage })
    return res.status(500).json({ error: 'PDF 处理失败' })
  }
}
