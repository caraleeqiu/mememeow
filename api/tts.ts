import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

// 允许的域名白名单
const ALLOWED_ORIGINS = [
  'https://mememeow.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

// 设置 CORS 头
function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin || ''
  const isProduction = process.env.VERCEL_ENV === 'production'

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else if (!isProduction) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// 可用的音色
// Kore: Firm, Charon: Informative, Fenrir: Excitable, Puck: Upbeat
// Enceladus: Breathy (有磁性), Aoede: Bright
const DEFAULT_VOICE = 'Enceladus' // 有磁性的声音

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text, voice = DEFAULT_VOICE } = req.body

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' })
  }

  if (text.length > 500) {
    return res.status(400).json({ error: 'Text too long (max 500 chars)' })
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text }]
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice
              }
            }
          }
        }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[tts] Gemini error:', response.status, errorText)
      return res.status(500).json({ error: 'TTS generation failed' })
    }

    const data = await response.json()
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData

    if (!audioData) {
      return res.status(500).json({ error: 'No audio generated' })
    }

    // 返回 base64 音频数据
    return res.status(200).json({
      audio: audioData.data,
      mimeType: audioData.mimeType || 'audio/mp3'
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[tts] Error:', message)
    return res.status(500).json({ error: 'TTS generation failed' })
  }
}
