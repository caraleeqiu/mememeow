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
              text: `Extract all text from this PDF document and format it for English reading practice.

IMPORTANT: First check the language of the content.
If the content is NOT primarily in English, respond with ONLY: "NOT_ENGLISH: [language name]"

If the content IS in English:
1. Extract all readable text
2. Split into sentences (one per line)
3. Fix any OCR errors or formatting issues
4. Each sentence should be 10-150 characters
5. Output ONLY the sentences, no explanations`
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

    // 检查是否为非英语
    if (text.startsWith('NOT_ENGLISH:')) {
      const lang = text.replace('NOT_ENGLISH:', '').trim()
      return res.status(400).json({ error: `检测到${lang}内容，目前只支持英文哦~` })
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
