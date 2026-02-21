import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { prepare } from '../db/schema.js'

const execAsync = promisify(exec)

type Platform = 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'medium' | 'news'
type ContentType = 'video' | 'article'

interface ContentInfo {
  platform: Platform
  type: ContentType
}

export function detectPlatform(url: string): ContentInfo {
  const urlLower = url.toLowerCase()

  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return { platform: 'youtube', type: 'video' }
  }
  if (urlLower.includes('tiktok.com')) {
    return { platform: 'tiktok', type: 'video' }
  }
  if (urlLower.includes('instagram.com')) {
    return { platform: 'instagram', type: 'video' }
  }
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return { platform: 'twitter', type: 'video' }
  }
  if (urlLower.includes('medium.com')) {
    return { platform: 'medium', type: 'article' }
  }

  return { platform: 'news', type: 'article' }
}

// 提取 YouTube 字幕
async function extractYouTubeSubtitles(url: string): Promise<{ title: string; sentences: string[] }> {
  try {
    // 获取视频信息
    const { stdout } = await execAsync(
      `yt-dlp --print title --print description --skip-download "${url}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    )

    const lines = stdout.trim().split('\n')
    const title = lines[0] || 'YouTube Video'

    // 尝试获取字幕
    try {
      const { stdout: subStdout } = await execAsync(
        `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "/tmp/%(id)s" --print "%(subtitles)s" "${url}"`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
      )

      // 如果有字幕文件，读取它
      const videoId = url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1]
      if (videoId) {
        const fs = await import('fs/promises')
        try {
          const vttContent = await fs.readFile(`/tmp/${videoId}.en.vtt`, 'utf-8')
          await fs.unlink(`/tmp/${videoId}.en.vtt`).catch(() => {})
          return { title, sentences: parseVTT(vttContent) }
        } catch {
          // 字幕文件不存在，使用描述
        }
      }
    } catch {
      // 获取字幕失败
    }

    // 使用描述作为内容
    const description = lines.slice(1).join(' ')
    if (description.length > 50) {
      return { title, sentences: splitIntoSentences(description) }
    }

    return { title, sentences: [title] }
  } catch (error) {
    console.error('YouTube extraction error:', error)
    throw new Error('Failed to extract YouTube content')
  }
}

// 使用 yt-dlp 下载并转写
async function extractVideoWithWhisper(url: string): Promise<{ title: string; sentences: string[] }> {
  const tempId = uuidv4()
  const tempFile = `/tmp/${tempId}`

  try {
    // 获取标题并下载音频
    const { stdout: infoStdout } = await execAsync(
      `yt-dlp --print title "${url}"`,
      { timeout: 30000 }
    )
    const title = infoStdout.trim() || 'Video'

    await execAsync(
      `yt-dlp -x --audio-format mp3 -o "${tempFile}.%(ext)s" "${url}"`,
      { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }
    )

    // 尝试用 Whisper 转写
    try {
      await execAsync(
        `whisper "${tempFile}.mp3" --language en --output_format txt --output_dir /tmp`,
        { timeout: 300000 }
      )

      const fs = await import('fs/promises')
      const transcript = await fs.readFile(`${tempFile}.txt`, 'utf-8')
      await execAsync(`rm -f ${tempFile}.*`).catch(() => {})

      return { title, sentences: splitIntoSentences(transcript) }
    } catch {
      // Whisper 不可用，返回标题
      await execAsync(`rm -f ${tempFile}.*`).catch(() => {})
      return { title, sentences: [title] }
    }
  } catch (error) {
    console.error('Video extraction error:', error)
    await execAsync(`rm -f ${tempFile}.*`).catch(() => {})
    throw new Error('Failed to extract video content. Make sure yt-dlp is installed.')
  }
}

// 提取文章内容
async function extractArticle(url: string): Promise<{ title: string; sentences: string[] }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article) {
      throw new Error('Failed to parse article')
    }

    return {
      title: article.title,
      sentences: splitIntoSentences(article.textContent)
    }
  } catch (error) {
    console.error('Article extraction error:', error)
    throw new Error('Failed to extract article content')
  }
}

// 解析 VTT 字幕
function parseVTT(content: string): string[] {
  const lines = content.split('\n')
  const sentences: string[] = []
  let currentSentence = ''

  for (const line of lines) {
    const trimmed = line.trim()
    // 跳过时间戳和元数据
    if (!trimmed || /^\d/.test(trimmed) || /-->/.test(trimmed) || /^WEBVTT/.test(trimmed) || /^NOTE/.test(trimmed)) {
      continue
    }
    // 移除 HTML 标签
    const clean = trimmed.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    if (clean) {
      currentSentence += ' ' + clean
      if (/[.!?]$/.test(clean)) {
        const sentence = currentSentence.trim()
        if (sentence.length > 10) {
          sentences.push(sentence)
        }
        currentSentence = ''
      }
    }
  }

  if (currentSentence.trim().length > 10) {
    sentences.push(currentSentence.trim())
  }

  return sentences.length > 0 ? sentences : ['No subtitles available']
}

// 分割文本为句子
function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim()

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && s.length < 200)

  return sentences.length > 0 ? sentences : ['No content available']
}

// 主提取函数
export async function extractContent(url: string, userId: string) {
  const { platform, type } = detectPlatform(url)
  let sentences: string[] = []
  let title = ''

  if (type === 'video') {
    if (platform === 'youtube') {
      const result = await extractYouTubeSubtitles(url)
      sentences = result.sentences
      title = result.title
    } else {
      const result = await extractVideoWithWhisper(url)
      sentences = result.sentences
      title = result.title
    }
  } else {
    const result = await extractArticle(url)
    sentences = result.sentences
    title = result.title
  }

  if (sentences.length === 0) {
    throw new Error('No content extracted')
  }

  // 保存到数据库
  const id = uuidv4()
  prepare(`
    INSERT INTO contents (id, user_id, url, title, type, platform, sentences)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, url, title, type, platform, JSON.stringify(sentences))

  return {
    id,
    title,
    type,
    platform,
    sentences,
    totalSentences: sentences.length
  }
}

// 获取用户的内容列表
export function getUserContents(userId: string) {
  const contents = prepare(`
    SELECT id, url, title, type, platform, sentences, created_at
    FROM contents
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId)

  return contents.map((c: any) => ({
    ...c,
    sentences: JSON.parse(c.sentences),
    totalSentences: JSON.parse(c.sentences).length
  }))
}

// 获取单个内容
export function getContent(contentId: string) {
  const content = prepare(`
    SELECT id, url, title, type, platform, sentences, created_at
    FROM contents
    WHERE id = ?
  `).get(contentId) as any

  if (!content) {
    throw new Error('Content not found')
  }

  return {
    ...content,
    sentences: JSON.parse(content.sentences)
  }
}
