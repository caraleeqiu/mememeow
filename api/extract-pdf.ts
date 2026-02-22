import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { pdfBase64 } = req.body

  if (!pdfBase64) {
    return res.status(400).json({ error: 'PDF data is required' })
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }

  try {
    console.log('[extract-pdf] Processing PDF, size:', Math.round(pdfBase64.length / 1024), 'KB')

    // 用 Gemini 提取 PDF 文本
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('[extract-pdf] Gemini error:', errorText)
      return res.status(500).json({ error: 'PDF 处理失败' })
    }

    const geminiData = await geminiResponse.json()
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    console.log('[extract-pdf] Gemini response length:', text.length)

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

    console.log('[extract-pdf] Extracted sentences:', sentences.length)

    return res.status(200).json({ sentences })
  } catch (error: any) {
    console.error('[extract-pdf] Error:', error.message)
    return res.status(500).json({ error: `PDF 处理失败: ${error.message}` })
  }
}
