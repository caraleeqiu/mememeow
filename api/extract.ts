import type { VercelRequest, VercelResponse } from '@vercel/node'

// Gemini API for audio transcription
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

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
    console.error('[extract] GEMINI_API_KEY is missing from env')
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }
  console.log('[extract] GEMINI_API_KEY found, length:', GEMINI_API_KEY.length)

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
    const errorMsg = error.name === 'AbortError'
      ? '请求超时，请稍后重试'
      : (error.message || 'Extraction failed')
    return res.status(500).json({ error: errorMsg })
  }
}

// Extract audio and transcribe using Gemini
async function extractWithGemini(url: string, platform: string) {
  console.log('[extract] Step 1: Getting audio URL...')

  // Step 1: Get audio URL using cobalt.tools API
  const audioUrl = await getAudioUrl(url)
  console.log('[extract] Audio URL:', audioUrl ? 'Got it' : 'Failed')

  if (!audioUrl) {
    throw new Error('无法获取视频音频，请检查链接是否正确')
  }

  console.log('[extract] Step 2: Downloading audio...')
  // Step 2: Download audio with timeout
  const audioResponse = await fetchWithTimeout(audioUrl, {}, 30000) // 30s timeout
  if (!audioResponse.ok) {
    throw new Error('音频下载失败')
  }

  const audioBuffer = await audioResponse.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')
  console.log('[extract] Audio size:', Math.round(audioBase64.length / 1024), 'KB')

  // Check size (Gemini has limits)
  if (audioBase64.length > 20 * 1024 * 1024) { // ~15MB original
    throw new Error('视频太长，请选择较短的视频（建议3分钟以内）')
  }

  console.log('[extract] Step 3: Sending to Gemini...')
  // Step 3: Send to Gemini for transcription with timeout
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const geminiResponse = await fetchWithTimeout(geminiUrl, {
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
  }, 45000) // 45 second timeout for Gemini

  console.log('[extract] Gemini response status:', geminiResponse.status)

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.text()
    console.error('Gemini error:', errorData)
    throw new Error('Gemini 转写失败，请稍后重试')
  }

  const geminiData = await geminiResponse.json()
  const transcription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
  console.log('[extract] Transcription length:', transcription.length)

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

// Fetch with timeout helper
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 15000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// Get audio URL using cobalt.tools API
async function getAudioUrl(videoUrl: string): Promise<string | null> {
  // Try multiple cobalt instances
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekmiki.com',
    'https://cobalt.canine.tools',
  ]

  for (const instance of cobaltInstances) {
    try {
      console.log('[cobalt] Trying instance:', instance)
      console.log('[cobalt] Requesting audio for:', videoUrl)

      const response = await fetchWithTimeout(`${instance}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
        }),
      }, 20000) // 20 second timeout per instance

      console.log('[cobalt] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[cobalt] API error:', response.status, errorText)
        continue // Try next instance
      }

      const data = await response.json()
      console.log('[cobalt] Response data:', JSON.stringify(data).slice(0, 200))

      // Handle different response formats
      let audioUrl = null
      if (data.url) {
        audioUrl = data.url
      } else if (data.status === 'stream' || data.status === 'redirect') {
        audioUrl = data.url
      } else if (data.status === 'picker' && data.picker?.[0]?.url) {
        audioUrl = data.picker[0].url
      } else if (data.audio) {
        audioUrl = data.audio
      }

      if (audioUrl) {
        console.log('[cobalt] Got audio URL from:', instance)
        return audioUrl
      }

      console.error('[cobalt] Unexpected response format:', data)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('[cobalt] Timeout for instance:', instance)
      } else {
        console.error('[cobalt] Failed for instance:', instance, error.message)
      }
      // Continue to next instance
    }
  }

  console.error('[cobalt] All instances failed')
  return null
}
