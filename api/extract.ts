import type { VercelRequest, VercelResponse } from '@vercel/node'
import { YoutubeTranscript } from 'youtube-transcript'
import ytdl from '@distube/ytdl-core'

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || ''

const API_VERSION = 'v12-instagram-fix'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[extract] API Version:', API_VERSION)

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', version: API_VERSION })
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

    // TikTok - 使用原始 API
    if (urlLower.includes('tiktok.com')) {
      if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RapidAPI key not configured' })
      }
      const result = await extractTikTok(url)
      return res.status(200).json(result)
    }

    // YouTube - 使用免费字幕 API
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      const result = await extractYouTube(url)
      return res.status(200).json(result)
    }

    // Instagram
    if (urlLower.includes('instagram.com')) {
      if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RapidAPI key not configured' })
      }
      const result = await extractInstagram(url)
      return res.status(200).json(result)
    }

    // Twitter/X
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RapidAPI key not configured' })
      }
      const result = await extractTwitter(url)
      return res.status(200).json(result)
    }

    return res.status(400).json({ error: 'Unsupported platform' })
  } catch (error: any) {
    console.error('Extraction error:', error)
    let errorMsg = error.message || 'Extraction failed'

    if (error.name === 'AbortError' || errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      errorMsg = '视频处理超时，请尝试较短的视频（30秒以内效果最好）'
    }

    return res.status(500).json({ error: errorMsg })
  }
}

// Extract TikTok using RapidAPI + Gemini transcription
async function extractTikTok(url: string) {
  console.log('[tiktok] Extracting for:', url)

  try {
    // Step 1: 使用原始 TikTok Downloader API
    console.log('[tiktok] Step 1: Getting download URL...')
    const rapidResponse = await fetchWithTimeout(
      `https://tiktok-video-downloader-api.p.rapidapi.com/media?videoUrl=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'tiktok-video-downloader-api.p.rapidapi.com',
        },
      },
      20000
    )

    if (!rapidResponse.ok) {
      const errorText = await rapidResponse.text()
      console.error('[tiktok] RapidAPI error:', rapidResponse.status, errorText)
      throw new Error('无法获取 TikTok 视频信息')
    }

    const rapidData = await rapidResponse.json()
    console.log('[tiktok] RapidAPI response:', JSON.stringify(rapidData).slice(0, 500))

    // 获取下载链接
    const downloadUrl = rapidData.downloadUrl || rapidData.videoUrl || rapidData.play
    const isAudio = false

    console.log('[tiktok] Got download URL')

    if (!downloadUrl) {
      console.error('[tiktok] No download URL found in:', JSON.stringify(rapidData).slice(0, 500))
      throw new Error('无法获取下载链接')
    }

    // Step 2: 下载媒体
    console.log('[tiktok] Step 2: Downloading media...')
    const mediaResponse = await fetchWithTimeout(downloadUrl, {}, 60000) // 60秒超时
    if (!mediaResponse.ok) {
      throw new Error('媒体下载失败')
    }

    const mediaBuffer = await mediaResponse.arrayBuffer()
    const mediaBase64 = Buffer.from(mediaBuffer).toString('base64')
    const sizeMB = mediaBase64.length / 1024 / 1024
    console.log('[tiktok] Media size:', sizeMB.toFixed(2), 'MB')

    // Gemini 支持最大约 100MB
    if (sizeMB > 50) {
      throw new Error(`文件太大 (${sizeMB.toFixed(1)}MB)，请选择较短的视频（约30秒以内）`)
    }

    // Step 3: 使用 Gemini 转写（含语言检测）
    console.log('[tiktok] Step 3: Transcribing with Gemini...')
    const mimeType = isAudio ? 'audio/mpeg' : 'video/mp4'
    const transcription = await transcribeWithGemini(mediaBase64, mimeType)
    console.log('[tiktok] Transcription length:', transcription.length)

    // Step 4: 解析句子
    const sentences = transcription
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 10 && s.length <= 200)
      .slice(0, 50)

    if (sentences.length === 0) {
      throw new Error('未能提取到有效句子')
    }

    return {
      title: rapidData.title || 'TikTok Video',
      sentences,
      platform: 'tiktok',
      type: 'video',
    }
  } catch (error: any) {
    console.error('[tiktok] Error:', error.message, error.stack)
    throw new Error(`TikTok 提取失败: ${error.message}`)
  }
}

// Extract Instagram using RapidAPI + Gemini transcription
async function extractInstagram(url: string) {
  console.log('[instagram] Extracting for:', url)

  try {
    // 使用 Instagram downloader API (GET /convert?url=...)
    console.log('[instagram] Getting download URL...')
    const rapidResponse = await fetchWithTimeout(
      `https://instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com/convert?url=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com',
        },
      },
      20000
    )

    const rapidText = await rapidResponse.text()
    console.log('[instagram] RapidAPI status:', rapidResponse.status, 'response:', rapidText.slice(0, 300))

    let downloadUrl = ''
    let title = 'Instagram Video'

    if (rapidResponse.ok) {
      const rapidData = JSON.parse(rapidText)
      // 尝试获取视频链接 - 检查多种可能的字段
      downloadUrl = rapidData.url || rapidData.download_url || rapidData.video_url
      if (rapidData.result && Array.isArray(rapidData.result)) {
        const videoItem = rapidData.result.find((m: any) => m.type === 'video' || m.url?.includes('.mp4'))
        downloadUrl = videoItem?.url || rapidData.result[0]?.url || downloadUrl
      }
      if (rapidData.media && Array.isArray(rapidData.media)) {
        const videoMedia = rapidData.media.find((m: any) => m.type === 'video')
        downloadUrl = videoMedia?.url || rapidData.media[0]?.url || downloadUrl
      }
      title = rapidData.title || rapidData.caption?.slice(0, 50) || 'Instagram Video'
    }

    // 备用方案：cobalt
    if (!downloadUrl) {
      console.log('[instagram] Trying cobalt fallback...')
      downloadUrl = await getAudioUrl(url) || ''
    }

    if (!downloadUrl) {
      throw new Error('无法获取 Instagram 视频')
    }

    // 下载视频
    console.log('[instagram] Downloading media...')
    const mediaResponse = await fetchWithTimeout(downloadUrl, {}, 60000)
    if (!mediaResponse.ok) {
      throw new Error('媒体下载失败')
    }

    const mediaBuffer = await mediaResponse.arrayBuffer()
    const mediaBase64 = Buffer.from(mediaBuffer).toString('base64')
    console.log('[instagram] Media size:', Math.round(mediaBase64.length / 1024 / 1024 * 100) / 100, 'MB')

    if (mediaBase64.length > 50 * 1024 * 1024) {
      throw new Error('视频太大，请选择较短的视频')
    }

    // Gemini 转写
    console.log('[instagram] Transcribing with Gemini...')
    const transcription = await transcribeWithGemini(mediaBase64, 'video/mp4')

    const sentences = transcription
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 10 && s.length <= 200)
      .slice(0, 50)

    if (sentences.length === 0) {
      throw new Error('未能提取到有效句子')
    }

    return {
      title,
      sentences,
      platform: 'instagram',
      type: 'video',
    }
  } catch (error: any) {
    console.error('[instagram] Error:', error.message)
    throw new Error(`Instagram 提取失败: ${error.message}`)
  }
}

// Extract Twitter/X using RapidAPI + Gemini transcription
async function extractTwitter(url: string) {
  console.log('[twitter] Extracting for:', url)

  try {
    // 使用 Twitter downloader API
    console.log('[twitter] Getting download URL...')
    const rapidResponse = await fetchWithTimeout(
      `https://twitter-downloader-download-twitter-videos.p.rapidapi.com/status`,
      {
        method: 'POST',
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'twitter-downloader-download-twitter-videos.p.rapidapi.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      },
      20000
    )

    const rapidText = await rapidResponse.text()
    console.log('[twitter] RapidAPI status:', rapidResponse.status, 'response:', rapidText.slice(0, 300))

    let downloadUrl = ''
    let title = 'Twitter Video'

    if (rapidResponse.ok) {
      const rapidData = JSON.parse(rapidText)
      // 尝试获取视频链接
      if (rapidData.media?.video?.videoVariants) {
        const variants = rapidData.media.video.videoVariants
        const mp4Variant = variants.find((v: any) => v.content_type === 'video/mp4')
        downloadUrl = mp4Variant?.url || variants[0]?.url
      }
      downloadUrl = downloadUrl || rapidData.download_url || rapidData.video_url || rapidData.url
      title = rapidData.text?.slice(0, 50) || 'Twitter Video'
    }

    // 备用方案：cobalt
    if (!downloadUrl) {
      console.log('[twitter] Trying cobalt fallback...')
      downloadUrl = await getAudioUrl(url) || ''
    }

    if (!downloadUrl) {
      throw new Error('无法获取 Twitter 视频，请确保是包含视频的推文')
    }

    // 下载视频
    console.log('[twitter] Downloading media...')
    const mediaResponse = await fetchWithTimeout(downloadUrl, {}, 60000)
    if (!mediaResponse.ok) {
      throw new Error('媒体下载失败')
    }

    const mediaBuffer = await mediaResponse.arrayBuffer()
    const mediaBase64 = Buffer.from(mediaBuffer).toString('base64')
    console.log('[twitter] Media size:', Math.round(mediaBase64.length / 1024 / 1024 * 100) / 100, 'MB')

    if (mediaBase64.length > 50 * 1024 * 1024) {
      throw new Error('视频太大，请选择较短的视频')
    }

    // Gemini 转写
    console.log('[twitter] Transcribing with Gemini...')
    const transcription = await transcribeWithGemini(mediaBase64, 'video/mp4')

    const sentences = transcription
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 10 && s.length <= 200)
      .slice(0, 50)

    if (sentences.length === 0) {
      throw new Error('未能提取到有效句子')
    }

    return {
      title,
      sentences,
      platform: 'twitter',
      type: 'video',
    }
  } catch (error: any) {
    console.error('[twitter] Error:', error.message)
    throw new Error(`Twitter 提取失败: ${error.message}`)
  }
}

// 快速语言检测（只用前 500KB 数据）
async function detectLanguage(mediaBase64: string, mimeType: string): Promise<string> {
  // 只取前 500KB 用于快速检测
  const sampleData = mediaBase64.slice(0, 500 * 1024)

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const geminiResponse = await fetchWithTimeout(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: `What language is spoken in this audio/video?
Reply with ONLY one word: the language name (e.g., "English", "Chinese", "Japanese", "Spanish", etc.)`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: sampleData
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 20,
      }
    }),
  }, 15000) // 15秒快速检测

  if (!geminiResponse.ok) {
    console.log('[detectLanguage] Failed, assuming English')
    return 'English' // 检测失败就假设是英语，让后续流程处理
  }

  const data = await geminiResponse.json()
  const lang = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'English'
  console.log('[detectLanguage] Detected:', lang)
  return lang
}

// 通用 Gemini 转写函数（含语言检测）
async function transcribeWithGemini(mediaBase64: string, mimeType: string): Promise<string> {
  // Step 1: 快速语言检测
  console.log('[gemini] Step 1: Quick language detection...')
  const detectedLang = await detectLanguage(mediaBase64, mimeType)

  if (detectedLang.toLowerCase() !== 'english') {
    throw new Error(`检测到${detectedLang}内容，目前只支持英文视频哦~`)
  }

  // Step 2: 完整转写
  console.log('[gemini] Step 2: Full transcription...')
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const geminiResponse = await fetchWithTimeout(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: `Transcribe this English audio/video to text.
Rules:
1. Output ONLY the transcription, no explanations
2. Split into sentences (one per line)
3. Fix any grammar or punctuation
4. Remove filler words like "um", "uh", "like"
5. Each sentence should be 10-150 characters`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: mediaBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      }
    }),
  }, 40000) // 40秒转写

  if (!geminiResponse.ok) {
    const errorData = await geminiResponse.text()
    console.error('[gemini] Error:', errorData)
    throw new Error('Gemini 转写失败')
  }

  const geminiData = await geminiResponse.json()
  const transcription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

  if (!transcription) {
    throw new Error('无法识别视频内容')
  }

  return transcription
}

// Extract YouTube transcript - 先尝试字幕，失败则用 Gemini 转写
async function extractYouTube(url: string) {
  console.log('[youtube] Extracting for:', url)

  // 提取视频 ID
  let videoId = ''
  if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1].split('?')[0]
  } else if (url.includes('/shorts/')) {
    videoId = url.split('/shorts/')[1].split('?')[0]
  } else if (url.includes('v=')) {
    videoId = url.split('v=')[1].split('&')[0]
  }

  if (!videoId) {
    throw new Error('无法解析 YouTube 视频 ID')
  }

  console.log('[youtube] Video ID:', videoId)

  // 方案1: 尝试获取字幕（快速免费）
  try {
    console.log('[youtube] Trying transcript API...')
    const transcript = await YoutubeTranscript.fetchTranscript(videoId)

    if (transcript && transcript.length > 0) {
      console.log('[youtube] Got transcript, segments:', transcript.length)

      // 合并短句子，拆分长句子
      const sentences: string[] = []
      let currentSentence = ''

      for (const segment of transcript) {
        const text = segment.text.replace(/\n/g, ' ').trim()
        if (!text) continue

        currentSentence += (currentSentence ? ' ' : '') + text

        if (/[.!?]$/.test(currentSentence) || currentSentence.length > 150) {
          if (currentSentence.length >= 10 && currentSentence.length <= 200) {
            sentences.push(currentSentence)
          } else if (currentSentence.length > 200) {
            const parts = currentSentence.split(/(?<=[.!?])\s+/)
            for (const part of parts) {
              if (part.length >= 10 && part.length <= 200) {
                sentences.push(part.trim())
              }
            }
          }
          currentSentence = ''
        }
      }

      if (currentSentence.length >= 10 && currentSentence.length <= 200) {
        sentences.push(currentSentence)
      }

      if (sentences.length > 0) {
        console.log('[youtube] Processed sentences:', sentences.length)
        return {
          title: 'YouTube Video',
          sentences: sentences.slice(0, 50),
          platform: 'youtube',
          type: 'video',
        }
      }
    }
  } catch (error: any) {
    console.log('[youtube] Transcript not available:', error.message)
  }

  // 方案2: 直接用 Gemini 解析 YouTube URL
  console.log('[youtube] Falling back to Gemini direct parsing...')
  return await extractYouTubeWithGemini(videoId)
}

// 下载 YouTube 音频并用 Gemini 转写
async function extractYouTubeWithGemini(videoId: string) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
  console.log('[youtube-gemini] Processing:', youtubeUrl)

  let audioBase64 = ''
  let title = 'YouTube Video'

  // 方法1: 尝试 RapidAPI YouTube 下载
  if (RAPIDAPI_KEY) {
    try {
      console.log('[youtube-gemini] Trying RapidAPI get_m4a_download_link...')

      const rapidResponse = await fetchWithTimeout(
        `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/get_m4a_download_link/${videoId}`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com',
          },
        },
        25000
      )

      const rapidText = await rapidResponse.text()
      console.log('[youtube-gemini] RapidAPI status:', rapidResponse.status, 'response:', rapidText.slice(0, 300))

      if (rapidResponse.ok) {
        const rapidData = JSON.parse(rapidText)
        const audioUrl = rapidData.file

        if (audioUrl) {
          console.log('[youtube-gemini] Got audio URL, downloading...')
          const audioResponse = await fetchWithTimeout(audioUrl, {}, 30000)
          console.log('[youtube-gemini] Audio download status:', audioResponse.status)

          if (audioResponse.ok) {
            const audioBuffer = await audioResponse.arrayBuffer()
            audioBase64 = Buffer.from(audioBuffer).toString('base64')
            console.log('[youtube-gemini] RapidAPI success, size:', Math.round(audioBase64.length / 1024), 'KB')
          }
        }
      }
    } catch (rapidError: any) {
      console.log('[youtube-gemini] RapidAPI failed:', rapidError.message)
    }
  }

  // 方法2: 尝试 ytdl-core
  if (!audioBase64) {
    try {
      console.log('[youtube-gemini] Trying ytdl-core...')
      const info = await ytdl.getInfo(youtubeUrl)
      title = info.videoDetails.title
      console.log('[youtube-gemini] Video title:', title)

      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
      console.log('[youtube-gemini] Audio formats found:', audioFormats.length)
      if (audioFormats.length === 0) {
        throw new Error('No audio format found')
      }

      const format = audioFormats.sort((a, b) =>
        (Number(a.contentLength) || 0) - (Number(b.contentLength) || 0)
      )[0]
      console.log('[youtube-gemini] Audio format:', format.mimeType, 'size:', format.contentLength)

      const chunks: Buffer[] = []
      const stream = ytdl(youtubeUrl, { format })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Download timeout')), 30000)
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => { clearTimeout(timeout); resolve() })
        stream.on('error', (err) => { clearTimeout(timeout); reject(err) })
      })

      audioBase64 = Buffer.concat(chunks).toString('base64')
      console.log('[youtube-gemini] ytdl-core success, size:', Math.round(audioBase64.length / 1024), 'KB')
    } catch (ytdlError: any) {
      console.log('[youtube-gemini] ytdl-core failed:', ytdlError.message, ytdlError.stack?.slice(0, 200))
    }
  }

  // 方法3: 尝试 cobalt API
  if (!audioBase64) {
    try {
      console.log('[youtube-gemini] Trying cobalt API...')
      const audioUrl = await getAudioUrl(youtubeUrl)
      console.log('[youtube-gemini] Cobalt audio URL:', audioUrl ? 'got it' : 'failed')
      if (audioUrl) {
        const audioResponse = await fetchWithTimeout(audioUrl, {}, 30000)
        console.log('[youtube-gemini] Cobalt download status:', audioResponse.status)
        if (audioResponse.ok) {
          const audioBuffer = await audioResponse.arrayBuffer()
          audioBase64 = Buffer.from(audioBuffer).toString('base64')
          console.log('[youtube-gemini] cobalt success, size:', Math.round(audioBase64.length / 1024), 'KB')
        }
      }
    } catch (cobaltError: any) {
      console.log('[youtube-gemini] cobalt failed:', cobaltError.message)
    }
  }

  if (!audioBase64) {
    throw new Error('无法下载视频音频（所有方法均失败：RapidAPI、ytdl-core、cobalt）')
  }

  // 检查大小限制
  if (audioBase64.length > 20 * 1024 * 1024) {
    throw new Error('视频太长，请选择较短的视频（建议3分钟以内）')
  }

  // 发送到 Gemini 转写
  console.log('[youtube-gemini] Sending to Gemini...')
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const geminiResponse = await fetchWithTimeout(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
              mime_type: 'audio/webm',
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
  }, 60000)

  console.log('[youtube-gemini] Gemini response:', geminiResponse.status)
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text()
    console.error('[youtube-gemini] Gemini error:', errorText)
    throw new Error('Gemini 转写失败')
  }

  const data = await geminiResponse.json()
  const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  console.log('[youtube-gemini] Transcription length:', transcription.length)

  if (!transcription) {
    throw new Error('无法识别音频内容')
  }

  const sentences = transcription
    .split('\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length >= 10 && s.length <= 200)
    .slice(0, 50)

  if (sentences.length === 0) {
    throw new Error('未能提取到有效句子')
  }

  return {
    title,
    sentences,
    platform: 'youtube',
    type: 'video',
  }
}

// extractYouTubeWithYtdl removed - using Gemini direct parsing instead

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
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

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
