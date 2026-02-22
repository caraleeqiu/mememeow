import type { VercelRequest, VercelResponse } from '@vercel/node'

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

  try {
    const urlLower = url.toLowerCase()

    // TikTok
    if (urlLower.includes('tiktok.com')) {
      const result = await extractTikTok(url)
      return res.status(200).json(result)
    }

    // YouTube
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      const result = await extractYouTube(url)
      return res.status(200).json(result)
    }

    // Instagram
    if (urlLower.includes('instagram.com')) {
      return res.status(400).json({
        error: 'Instagram extraction is not yet supported. Please paste the caption/transcript directly.',
      })
    }

    // Twitter/X
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      const result = await extractTwitter(url)
      return res.status(200).json(result)
    }

    return res.status(400).json({ error: 'Unsupported platform' })
  } catch (error: any) {
    console.error('Extraction error:', error)
    return res.status(500).json({ error: error.message || 'Extraction failed' })
  }
}

// TikTok extraction using tikwm.com API
async function extractTikTok(url: string) {
  // Clean URL - extract video ID
  const cleanUrl = url.split('?')[0]

  // Use tikwm.com API (free, no auth required)
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  })

  const data = await response.json()

  if (data.code !== 0 || !data.data) {
    throw new Error('Failed to extract TikTok video info')
  }

  const videoData = data.data
  const title = videoData.title || 'TikTok Video'
  const description = videoData.title || ''

  // TikTok videos usually have short captions, so we'll use the description
  // and split it into sentences or phrases
  let sentences: string[] = []

  if (description) {
    // Split by common sentence endings or line breaks
    sentences = description
      .split(/[.!?\n]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 5)
  }

  // If no good sentences, use the whole description as one
  if (sentences.length === 0 && description) {
    sentences = [description.trim()]
  }

  if (sentences.length === 0) {
    throw new Error('No text content found in this TikTok video. The video might not have captions or description.')
  }

  return {
    title,
    sentences,
    platform: 'tiktok',
    type: 'video',
  }
}

// YouTube extraction using youtube-transcript API
async function extractYouTube(url: string) {
  // Extract video ID
  let videoId = ''

  if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1]?.split('?')[0] || ''
  } else if (url.includes('youtube.com/watch')) {
    const urlParams = new URL(url).searchParams
    videoId = urlParams.get('v') || ''
  } else if (url.includes('youtube.com/shorts/')) {
    videoId = url.split('shorts/')[1]?.split('?')[0] || ''
  }

  if (!videoId) {
    throw new Error('Could not extract YouTube video ID')
  }

  // Try to get transcript using a public API
  // Using youtubetranscript.com API (has rate limits but works for basic use)
  try {
    const transcriptUrl = `https://youtubetranscript.com/?server_vid2=${videoId}`
    const response = await fetch(transcriptUrl)
    const html = await response.text()

    // Parse the XML transcript
    const textMatches = html.match(/<text[^>]*>([^<]+)<\/text>/g)

    if (textMatches && textMatches.length > 0) {
      const sentences = textMatches
        .map(match => {
          const text = match.replace(/<[^>]+>/g, '')
          return decodeHTMLEntities(text).trim()
        })
        .filter(s => s.length > 0)

      // Group into logical sentences (combine short segments)
      const combinedSentences: string[] = []
      let current = ''

      for (const s of sentences) {
        current += (current ? ' ' : '') + s
        if (current.length > 50 || /[.!?]$/.test(current)) {
          combinedSentences.push(current)
          current = ''
        }
      }
      if (current) combinedSentences.push(current)

      if (combinedSentences.length > 0) {
        return {
          title: `YouTube Video ${videoId}`,
          sentences: combinedSentences.slice(0, 50),
          platform: 'youtube',
          type: 'video',
        }
      }
    }
  } catch (e) {
    console.error('Transcript fetch failed:', e)
  }

  throw new Error('Could not extract YouTube transcript. The video might not have captions available. Please paste the transcript directly.')
}

// Twitter/X extraction
async function extractTwitter(url: string) {
  // Twitter extraction is tricky without API access
  // Try using nitter or other mirror services
  const nitterUrl = url
    .replace('twitter.com', 'nitter.net')
    .replace('x.com', 'nitter.net')

  try {
    const response = await fetch(nitterUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const html = await response.text()

    // Extract tweet content
    const contentMatch = html.match(/<div class="tweet-content[^"]*"[^>]*>([^<]+)<\/div>/)
    if (contentMatch) {
      const text = decodeHTMLEntities(contentMatch[1]).trim()
      const sentences = text
        .split(/[.!?\n]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 10)

      if (sentences.length > 0) {
        return {
          title: 'Tweet',
          sentences,
          platform: 'twitter',
          type: 'article',
        }
      }
    }
  } catch (e) {
    console.error('Twitter extraction failed:', e)
  }

  throw new Error('Could not extract Twitter content. Please paste the tweet text directly.')
}

function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&nbsp;': ' ',
  }

  return text.replace(/&[^;]+;/g, match => entities[match] || match)
}
