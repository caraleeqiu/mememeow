import type { VercelRequest, VercelResponse } from '@vercel/node'
import { YoutubeTranscript } from 'youtube-transcript'
import ytdl from '@distube/ytdl-core'

// API Keys (从环境变量读取，不记录)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || ''

const API_VERSION = 'v21-security-optimized'

// 允许的域名白名单
const ALLOWED_ORIGINS = [
  'https://mememeow.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

// 允许的视频平台域名
const ALLOWED_VIDEO_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
]

// 设置 CORS 头（限制来源）
function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
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

  return ALLOWED_ORIGINS.includes(origin) || !isProduction
}

// 验证 URL 格式和域名白名单
function validateVideoUrl(url: string): { valid: boolean; error?: string; platform?: string } {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    // 检查是否在白名单中
    const isAllowed = ALLOWED_VIDEO_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    )

    if (!isAllowed) {
      return { valid: false, error: '不支持的平台，请使用 YouTube 或 TikTok 链接' }
    }

    // 判断平台
    if (hostname.includes('tiktok')) {
      return { valid: true, platform: 'tiktok' }
    }
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      return { valid: true, platform: 'youtube' }
    }

    return { valid: false, error: '无法识别的平台' }
  } catch {
    return { valid: false, error: '无效的 URL 格式' }
  }
}

// 安全的日志函数（不记录敏感信息）
function log(tag: string, message: string, data?: Record<string, unknown>) {
  const safeData = data ? { ...data } : {}
  // 移除任何可能的敏感字段
  delete safeData.apiKey
  delete safeData.key
  delete safeData.token
  delete safeData.authorization

  console.log(`[${tag}] ${message}`, Object.keys(safeData).length > 0 ? JSON.stringify(safeData) : '')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  log('extract', `API Version: ${API_VERSION}`)

  // 设置 CORS
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', version: API_VERSION })
  }

  const { url } = req.body

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' })
  }

  // 验证 URL
  const validation = validateVideoUrl(url)
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error })
  }

  if (!GEMINI_API_KEY) {
    log('extract', 'Gemini API key not configured')
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }

  try {
    let result

    if (validation.platform === 'tiktok') {
      if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RapidAPI key not configured' })
      }
      result = await extractTikTok(url)
    } else if (validation.platform === 'youtube') {
      result = await extractYouTube(url)
    } else {
      return res.status(400).json({ error: 'Unsupported platform' })
    }

    return res.status(200).json(result)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log('extract', 'Extraction error', { error: errorMessage })

    let userMessage = errorMessage
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('AbortError')) {
      userMessage = '视频处理超时，请尝试较短的视频（30秒以内效果最好）'
    }

    return res.status(500).json({ error: userMessage })
  }
}

// TikTok 提取
async function extractTikTok(url: string) {
  log('tiktok', 'Extracting', { url: url.slice(0, 50) })

  // Step 1: 获取下载链接
  log('tiktok', 'Getting download URL...')
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
    throw new Error('无法获取 TikTok 视频信息')
  }

  const rapidData = await rapidResponse.json()
  const downloadUrl = rapidData.downloadUrl || rapidData.videoUrl || rapidData.play

  if (!downloadUrl) {
    throw new Error('无法获取下载链接')
  }

  // Step 2: 下载媒体
  log('tiktok', 'Downloading media...')
  const mediaResponse = await fetchWithTimeout(downloadUrl, {}, 60000)
  if (!mediaResponse.ok) {
    throw new Error('媒体下载失败')
  }

  const mediaBuffer = await mediaResponse.arrayBuffer()
  const mediaBase64 = Buffer.from(mediaBuffer).toString('base64')
  const sizeMB = mediaBase64.length / 1024 / 1024
  log('tiktok', 'Media downloaded', { sizeMB: sizeMB.toFixed(2) })

  if (sizeMB > 50) {
    throw new Error(`文件太大 (${sizeMB.toFixed(1)}MB)，请选择较短的视频（约30秒以内）`)
  }

  // Step 3: Gemini 转写（含语言检测）
  log('tiktok', 'Transcribing with Gemini...')
  const transcription = await transcribeWithGemini(mediaBase64, 'video/mp4')

  // Step 4: 解析句子
  const sentences = parseSentences(transcription)

  if (sentences.length === 0) {
    throw new Error('未能提取到有效句子')
  }

  return {
    title: rapidData.title || 'TikTok Video',
    sentences,
    platform: 'tiktok',
    type: 'video',
  }
}

// YouTube 提取
async function extractYouTube(url: string) {
  log('youtube', 'Extracting', { url: url.slice(0, 50) })

  // 提取视频 ID
  const videoId = extractYouTubeVideoId(url)
  if (!videoId) {
    throw new Error('无法解析 YouTube 视频 ID')
  }

  log('youtube', 'Video ID', { videoId })

  // 方案1: 尝试获取字幕（快速免费）
  try {
    log('youtube', 'Trying transcript API...')
    const transcript = await YoutubeTranscript.fetchTranscript(videoId)

    if (transcript && transcript.length > 0) {
      log('youtube', 'Got transcript', { segments: transcript.length })
      const sentences = parseTranscriptToSentences(transcript)

      if (sentences.length > 0) {
        return {
          title: 'YouTube Video',
          sentences: sentences.slice(0, 50),
          platform: 'youtube',
          type: 'video',
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unknown'
    log('youtube', 'Transcript not available', { error: msg })
  }

  // 方案2: 用 Gemini 转写
  log('youtube', 'Falling back to Gemini...')
  return await extractYouTubeWithGemini(videoId)
}

// 提取 YouTube 视频 ID
function extractYouTubeVideoId(url: string): string | null {
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1].split('?')[0]
  }
  if (url.includes('/shorts/')) {
    return url.split('/shorts/')[1].split('?')[0]
  }
  if (url.includes('v=')) {
    return url.split('v=')[1].split('&')[0]
  }
  return null
}

// 解析字幕为句子
function parseTranscriptToSentences(transcript: Array<{ text: string }>): string[] {
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

  return sentences
}

// YouTube + Gemini 转写
async function extractYouTubeWithGemini(videoId: string) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
  log('youtube-gemini', 'Processing', { videoId })

  let audioBase64 = ''
  let title = 'YouTube Video'

  // 方法1: RapidAPI
  if (RAPIDAPI_KEY) {
    try {
      log('youtube-gemini', 'Trying RapidAPI...')
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

      if (rapidResponse.ok) {
        const rapidData = await rapidResponse.json()
        const audioUrl = rapidData.file

        if (audioUrl) {
          const audioResponse = await fetchWithTimeout(audioUrl, {}, 30000)
          if (audioResponse.ok) {
            const audioBuffer = await audioResponse.arrayBuffer()
            audioBase64 = Buffer.from(audioBuffer).toString('base64')
            log('youtube-gemini', 'RapidAPI success', { sizeKB: Math.round(audioBase64.length / 1024) })
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown'
      log('youtube-gemini', 'RapidAPI failed', { error: msg })
    }
  }

  // 方法2: ytdl-core
  if (!audioBase64) {
    try {
      log('youtube-gemini', 'Trying ytdl-core...')
      const info = await ytdl.getInfo(youtubeUrl)
      title = info.videoDetails.title

      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
      if (audioFormats.length > 0) {
        const format = audioFormats.sort((a, b) =>
          (Number(a.contentLength) || 0) - (Number(b.contentLength) || 0)
        )[0]

        const chunks: Buffer[] = []
        const stream = ytdl(youtubeUrl, { format })

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Download timeout')), 30000)
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => { clearTimeout(timeout); resolve() })
          stream.on('error', (err) => { clearTimeout(timeout); reject(err) })
        })

        audioBase64 = Buffer.concat(chunks).toString('base64')
        log('youtube-gemini', 'ytdl-core success', { sizeKB: Math.round(audioBase64.length / 1024) })
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown'
      log('youtube-gemini', 'ytdl-core failed', { error: msg })
    }
  }

  // 方法3: cobalt
  if (!audioBase64) {
    try {
      log('youtube-gemini', 'Trying cobalt...')
      const audioUrl = await getAudioUrl(youtubeUrl)
      if (audioUrl) {
        const audioResponse = await fetchWithTimeout(audioUrl, {}, 30000)
        if (audioResponse.ok) {
          const audioBuffer = await audioResponse.arrayBuffer()
          audioBase64 = Buffer.from(audioBuffer).toString('base64')
          log('youtube-gemini', 'cobalt success', { sizeKB: Math.round(audioBase64.length / 1024) })
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown'
      log('youtube-gemini', 'cobalt failed', { error: msg })
    }
  }

  if (!audioBase64) {
    throw new Error('无法下载视频音频')
  }

  if (audioBase64.length > 20 * 1024 * 1024) {
    throw new Error('视频太长，请选择较短的视频（建议3分钟以内）')
  }

  // Gemini 转写
  log('youtube-gemini', 'Sending to Gemini...')
  const transcription = await callGemini(
    `Transcribe this audio to English text.
Rules:
1. Output ONLY the transcription, no explanations
2. Split into sentences (one per line)
3. Fix any grammar or punctuation
4. If the audio is not in English, translate it to English
5. Remove filler words like "um", "uh", "like"
6. Each sentence should be 10-150 characters`,
    audioBase64,
    'audio/webm',
    60000
  )

  const sentences = parseSentences(transcription)

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

// 快速语言检测
async function detectLanguage(mediaBase64: string, mimeType: string): Promise<string> {
  const sampleData = mediaBase64.slice(0, 500 * 1024) // 只用前 500KB

  try {
    const result = await callGemini(
      `What language is spoken in this audio/video?
Reply with ONLY one word: the language name (e.g., "English", "Chinese", "Japanese", "Spanish", etc.)`,
      sampleData,
      mimeType,
      15000
    )
    return result.trim() || 'English'
  } catch {
    return 'English' // 检测失败就假设是英语
  }
}

// 通用 Gemini 转写（含语言检测）
async function transcribeWithGemini(mediaBase64: string, mimeType: string): Promise<string> {
  // Step 1: 快速语言检测
  log('gemini', 'Quick language detection...')
  const detectedLang = await detectLanguage(mediaBase64, mimeType)
  log('gemini', 'Detected language', { lang: detectedLang })

  if (detectedLang.toLowerCase() !== 'english') {
    throw new Error(`检测到${detectedLang}内容，目前只支持英文视频哦~`)
  }

  // Step 2: 完整转写
  log('gemini', 'Full transcription...')
  return await callGemini(
    `Transcribe this English audio/video to text.
Rules:
1. Output ONLY the transcription, no explanations
2. Split into sentences (one per line)
3. Fix any grammar or punctuation
4. Remove filler words like "um", "uh", "like"
5. Each sentence should be 10-150 characters`,
    mediaBase64,
    mimeType,
    40000
  )
}

// 统一的 Gemini API 调用函数
async function callGemini(
  prompt: string,
  mediaBase64: string,
  mimeType: string,
  timeoutMs = 40000
): Promise<string> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: mediaBase64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      }
    }),
  }, timeoutMs)

  if (!response.ok) {
    const errorText = await response.text()
    log('gemini', 'API error', { status: response.status })
    throw new Error('Gemini 转写失败')
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  if (!text) {
    throw new Error('无法识别内容')
  }

  return text
}

// 解析句子
function parseSentences(transcription: string): string[] {
  return transcription
    .split('\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length >= 10 && s.length <= 200)
    .slice(0, 50)
}

// 带超时的 fetch
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

// cobalt.tools 获取音频 URL
async function getAudioUrl(videoUrl: string): Promise<string | null> {
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekmiki.com',
  ]

  for (const instance of cobaltInstances) {
    try {
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
      }, 20000)

      if (!response.ok) continue

      const data = await response.json()
      const audioUrl = data.url || (data.status === 'picker' ? data.picker?.[0]?.url : null)

      if (audioUrl) {
        log('cobalt', 'Got audio URL', { instance })
        return audioUrl
      }
    } catch {
      continue
    }
  }

  return null
}
