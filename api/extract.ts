import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }

  try {
    const urlLower = url.toLowerCase()

    // TikTok
    if (urlLower.includes('tiktok.com')) {
      const result = await extractWithGemini(url, 'tiktok')
      return res.status(200).json(result)
    }

    // YouTube
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      const result = await extractWithGemini(url, 'youtube')
      return res.status(200).json(result)
    }

    // Instagram
    if (urlLower.includes('instagram.com')) {
      const result = await extractWithGemini(url, 'instagram')
      return res.status(200).json(result)
    }

    // Twitter/X
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      return res.status(400).json({
        error: 'Twitter/X 暂不支持语音转写，请直接粘贴文字内容',
      })
    }

    return res.status(400).json({ error: 'Unsupported platform' })
  } catch (error: any) {
    console.error('Extraction error:', error)
    return res.status(500).json({ error: error.message || 'Extraction failed' })
  }
}

// Extract audio and transcribe using Gemini
async function extractWithGemini(url: string, platform: string) {
  // Step 1: Get audio URL using cobalt.tools API
  const audioUrl = await getAudioUrl(url)

  if (!audioUrl) {
    throw new Error('无法获取视频音频，请检查链接是否正确')
  }

  // Step 2: Download audio
  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error('音频下载失败')
  }

  const audioBuffer = await audioResponse.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')

  // Check size (Gemini has limits)
  if (audioBase64.length > 20 * 1024 * 1024) { // ~15MB original
    throw new Error('视频太长，请选择较短的视频（建议3分钟以内）')
  }

  // Step 3: Send to Gemini for transcription
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const geminiResponse = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: `Transcribe this audio to English text.
Rules:
1. Output ONLY the transcription, no explanations
2. Split into sentences (one per line)
3. Fix any grammar or punctuation
4. If the audio is not in English, translate it to English
5. Remove filler words like "um", "uh", "like"
6. Each sentence should be 10-150 characters`
          },
          {
            inline_data: {
              mime_type: 'audio/mp3',
              data: audioBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      }
    }),
  })

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.text()
    console.error('Gemini error:', errorData)
    throw new Error('Gemini 转写失败，请稍后重试')
  }

  const geminiData = await geminiResponse.json()
  const transcription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

  if (!transcription) {
    throw new Error('无法识别音频内容，可能没有语音')
  }

  // Step 4: Parse sentences
  const sentences = transcription
    .split('\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length >= 10 && s.length <= 200)
    .slice(0, 50) // Max 50 sentences

  if (sentences.length === 0) {
    throw new Error('未能提取到有效句子')
  }

  return {
    title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Video`,
    sentences,
    platform,
    type: 'video',
  }
}

// Get audio URL using cobalt.tools API
async function getAudioUrl(videoUrl: string): Promise<string | null> {
  try {
    // Use cobalt.tools API (free, no auth required)
    const response = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url: videoUrl,
        isAudioOnly: true,
        aFormat: 'mp3',
      }),
    })

    if (!response.ok) {
      console.error('Cobalt API error:', response.status)
      return null
    }

    const data = await response.json()

    if (data.status === 'stream' || data.status === 'redirect') {
      return data.url
    }

    if (data.status === 'picker' && data.picker?.[0]?.url) {
      return data.picker[0].url
    }

    console.error('Cobalt response:', data)
    return null
  } catch (error) {
    console.error('Failed to get audio URL:', error)
    return null
  }
}
