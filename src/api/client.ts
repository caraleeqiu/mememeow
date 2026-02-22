import { supabase } from '../lib/supabase'
import type { Content, ProgressRecord } from '../types'

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - please try again')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============================================
// 改进的匹配算法
// ============================================

// Levenshtein 距离计算
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

// 词级别相似度（考虑词序）
function wordSimilarity(original: string[], spoken: string[]): number {
  if (original.length === 0) return spoken.length === 0 ? 100 : 0

  let matchScore = 0
  let positionBonus = 0
  const usedIndexes = new Set<number>()

  for (let i = 0; i < spoken.length; i++) {
    const spokenWord = spoken[i]
    let bestMatch = 0
    let bestIndex = -1

    for (let j = 0; j < original.length; j++) {
      if (usedIndexes.has(j)) continue

      const originalWord = original[j]

      // 完全匹配
      if (spokenWord === originalWord) {
        bestMatch = 1
        bestIndex = j
        break
      }

      // 部分匹配（Levenshtein）
      const maxLen = Math.max(spokenWord.length, originalWord.length)
      const distance = levenshteinDistance(spokenWord, originalWord)
      const similarity = 1 - distance / maxLen

      if (similarity > 0.7 && similarity > bestMatch) {
        bestMatch = similarity
        bestIndex = j
      }
    }

    if (bestIndex !== -1) {
      matchScore += bestMatch
      usedIndexes.add(bestIndex)

      // 位置奖励：相对位置接近的给额外分数
      const expectedPos = (i / spoken.length) * original.length
      const positionDiff = Math.abs(bestIndex - expectedPos)
      const posBonus = Math.max(0, 1 - positionDiff / original.length) * 0.2
      positionBonus += posBonus * bestMatch
    }
  }

  // 基础分数 + 位置奖励，惩罚过长或过短
  const lengthPenalty = Math.min(spoken.length / original.length, original.length / spoken.length)
  const baseScore = (matchScore / original.length) * 100
  const finalScore = baseScore * (0.8 + 0.2 * lengthPenalty) + positionBonus * 10

  return Math.min(100, Math.round(finalScore))
}

// 标准化文本
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, '') // 保留撇号（如 don't）
    .replace(/\s+/g, ' ')
    .trim()
}

// 匹配函数
function matchSpeech(original: string, spoken: string): { isMatch: boolean; score: number } {
  const originalNorm = normalizeText(original)
  const spokenNorm = normalizeText(spoken)

  // 完全匹配
  if (originalNorm === spokenNorm) {
    return { isMatch: true, score: 100 }
  }

  const originalWords = originalNorm.split(' ').filter(w => w.length > 0)
  const spokenWords = spokenNorm.split(' ').filter(w => w.length > 0)

  const score = wordSimilarity(originalWords, spokenWords)
  return { isMatch: score >= 80, score }
}

// ============================================
// Content API
// ============================================

export const content = {
  async paste(title: string, text: string, userId?: string, token?: string): Promise<Content & { totalSentences: number }> {
    console.log('[paste] Starting with userId:', userId, 'token:', token ? 'yes' : 'no')

    if (!userId) {
      throw new Error('Not authenticated')
    }

    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 5)
      .slice(0, 50)

    if (sentences.length === 0) {
      throw new Error('No valid sentences found. Make sure the text contains complete sentences.')
    }

    console.log('[paste] Inserting to Supabase, sentences:', sentences.length)

    // 直接用 fetch 绕过 Supabase SDK（避免 SDK 卡住）
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const authToken = token || supabaseKey

    console.log('[paste] Using fetch API directly')

    const response = await fetch(`${supabaseUrl}/rest/v1/contents`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        url: 'pasted',
        title: title || 'Pasted Text',
        type: 'article',
        platform: 'paste',
        sentences,
      }),
    })

    console.log('[paste] Fetch response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[paste] Fetch error:', errorText)
      throw new Error(`Insert failed: ${errorText}`)
    }

    const data = await response.json()
    console.log('[paste] Insert success:', data)

    return {
      ...data[0],
      totalSentences: sentences.length,
    }
  },

  async extract(url: string, userId?: string): Promise<Content & { totalSentences: number }> {
    const urlLower = url.toLowerCase()
    let platform = 'news'
    let type = 'article'

    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      platform = 'youtube'
      type = 'video'
    } else if (urlLower.includes('tiktok.com')) {
      platform = 'tiktok'
      type = 'video'
    } else if (urlLower.includes('instagram.com')) {
      platform = 'instagram'
      type = 'video'
    } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      platform = 'twitter'
      type = 'video'
    }

    if (type !== 'video') {
      throw new Error('目前只支持视频平台（TikTok、YouTube、Instagram、Twitter）。其他内容请使用"粘贴文字"或"上传文件"功能。')
    }

    if (!userId) throw new Error('请先登录')

    // 获取 session token 用于 API 认证
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const apiResponse = await fetchWithTimeout('/api/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
    }, 90000)

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json()
      throw new Error(errorData.error || 'Video extraction failed')
    }

    const extracted = await apiResponse.json()

    if (!extracted.sentences || extracted.sentences.length === 0) {
      throw new Error('No text content found in this video')
    }

    const { data, error } = await supabase
      .from('contents')
      .insert({
        user_id: userId,
        url,
        title: extracted.title || 'Video',
        type: 'video',
        platform,
        sentences: extracted.sentences,
      })
      .select()
      .single()

    if (error) throw error

    return {
      ...data,
      totalSentences: extracted.sentences.length,
    }
  },

  async list(token?: string): Promise<(Content & { totalSentences: number })[]> {
    const res = await supabaseFetch('contents?select=*&order=created_at.desc', {}, token)
    const data = await res.json()

    return (data || []).map((c: Content) => ({
      ...c,
      totalSentences: c.sentences.length,
    }))
  },

  async get(id: string): Promise<Content> {
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },
}

// ============================================
// Reading API
// ============================================

// Fetch helper for Supabase REST API
async function supabaseFetch(path: string, options: RequestInit = {}, token?: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const authToken = token || supabaseKey

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  return response
}

export const reading = {
  async record(contentId: string, sentenceIndex: number, sentenceText: string, userSpeech: string, userId?: string, token?: string) {
    if (!userId) throw new Error('Not authenticated')

    console.log('[record] Starting with userId:', userId, 'token:', token ? 'yes' : 'no')

    // 使用改进的匹配算法
    const { isMatch, score } = matchSpeech(sentenceText, userSpeech)
    console.log('[record] Match result:', { isMatch, score })

    // 检查是否已有记录
    const existingRes = await supabaseFetch(
      `reading_records?user_id=eq.${userId}&content_id=eq.${contentId}&sentence_index=eq.${sentenceIndex}&select=*`,
      {},
      token
    )
    const existingData = await existingRes.json()
    const existing = existingData?.[0]

    let carrotsEarned = 0
    let attempts = 1
    const wasCorrectBefore = existing?.is_correct

    if (existing) {
      attempts = (existing.attempts || 0) + 1
      await supabaseFetch(`reading_records?id=eq.${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          user_speech: userSpeech,
          is_correct: isMatch,
          attempts,
        }),
      }, token)

      // 之前错误现在正确，奖励萝卜
      if (isMatch && !wasCorrectBefore) {
        carrotsEarned = 1
      }
    } else {
      await supabaseFetch('reading_records', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          content_id: contentId,
          sentence_index: sentenceIndex,
          sentence_text: sentenceText,
          user_speech: userSpeech,
          is_correct: isMatch,
        }),
      }, token)

      if (isMatch) {
        carrotsEarned = 1
      }
    }

    // 更新萝卜数
    if (carrotsEarned > 0) {
      console.log('[record] Updating carrots, earned:', carrotsEarned)
      const profileRes = await supabaseFetch(`profiles?id=eq.${userId}&select=carrots`, {}, token)
      const profileData = await profileRes.json()
      const currentCarrots = profileData?.[0]?.carrots || 0
      console.log('[record] Current carrots:', currentCarrots, '-> new:', currentCarrots + carrotsEarned)

      const updateRes = await supabaseFetch(`profiles?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ carrots: currentCarrots + carrotsEarned }),
      }, token)
      console.log('[record] Carrot update status:', updateRes.status)
    }

    // 错误次数超过2次，加入错题本
    if (!isMatch && attempts >= 2) {
      const mistakeRes = await supabaseFetch(
        `mistakes?user_id=eq.${userId}&content_id=eq.${contentId}&sentence_index=eq.${sentenceIndex}&select=id,attempts`,
        {},
        token
      )
      const mistakeData = await mistakeRes.json()
      const existingMistake = mistakeData?.[0]

      if (existingMistake) {
        await supabaseFetch(`mistakes?id=eq.${existingMistake.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ attempts: (existingMistake.attempts || 0) + 1, is_mastered: false }),
        }, token)
      } else {
        await supabaseFetch('mistakes', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            content_id: contentId,
            sentence_index: sentenceIndex,
            sentence_text: sentenceText,
          }),
        }, token)
      }
    }

    console.log('[record] Done:', { isMatch, score, carrotsEarned, attempts })
    return { isMatch, score, carrotsEarned, attempts }
  },

  async progress(contentId: string) {
    const recordsRes = await supabaseFetch(
      `reading_records?content_id=eq.${contentId}&select=sentence_index,is_correct,attempts`
    )
    const records = await recordsRes.json()

    const contentRes = await supabaseFetch(`contents?id=eq.${contentId}&select=sentences`)
    const contentData = await contentRes.json()

    const totalSentences = contentData?.[0]?.sentences?.length || 0
    const typedRecords = (records || []) as ProgressRecord[]
    const completed = typedRecords.filter((r: ProgressRecord) => r.is_correct).length

    return {
      completed,
      total: totalSentences,
      percentage: totalSentences > 0 ? Math.round((completed / totalSentences) * 100) : 0,
      records: typedRecords,
    }
  },

  async mistakes(includeMastered = false, token?: string) {
    let path = 'mistakes?select=*&order=created_at.desc'
    if (!includeMastered) {
      path += '&is_mastered=eq.false'
    }

    const res = await supabaseFetch(path, {}, token)
    const data = await res.json()
    return data || []
  },

  async masterMistake(id: string) {
    const { error } = await supabase
      .from('mistakes')
      .update({ is_mastered: true })
      .eq('id', id)

    if (error) throw error
    return { success: true }
  },

  async stats(userId?: string, token?: string) {
    if (!userId) throw new Error('Not authenticated')

    // 使用 Prefer: count=exact 获取计数
    const headers = { 'Prefer': 'count=exact' }

    const [totalRes, correctRes, contentsRes, mistakesRes, danceRes] = await Promise.all([
      supabaseFetch(`reading_records?user_id=eq.${userId}&select=id`, { headers }, token),
      supabaseFetch(`reading_records?user_id=eq.${userId}&is_correct=eq.true&select=id`, { headers }, token),
      supabaseFetch(`contents?user_id=eq.${userId}&select=id`, { headers }, token),
      supabaseFetch(`mistakes?user_id=eq.${userId}&is_mastered=eq.false&select=id`, { headers }, token),
      supabaseFetch(`dance_records?user_id=eq.${userId}&select=id`, { headers }, token),
    ])

    // 从 content-range header 获取计数
    const getCount = (res: Response) => {
      const range = res.headers.get('content-range')
      if (range) {
        const match = range.match(/\/(\d+)/)
        return match ? parseInt(match[1]) : 0
      }
      return 0
    }

    const totalReadings = getCount(totalRes)
    const correctReadings = getCount(correctRes)

    return {
      totalReadings,
      correctReadings,
      accuracy: totalReadings ? Math.round((correctReadings / totalReadings) * 100) : 0,
      totalContents: getCount(contentsRes),
      mistakesCount: getCount(mistakesRes),
      danceCount: getCount(danceRes),
    }
  },

  async dance() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) throw new Error('Not authenticated')

    const DANCE_COST = 10

    // 使用原子操作扣费（修复竞态条件）
    // 方法1: 使用 RPC 函数
    const { data: rpcResult, error: rpcError } = await supabase.rpc('redeem_dance', {
      user_id: user.id,
      cost: DANCE_COST,
    })

    // 如果 RPC 存在且成功
    if (!rpcError && rpcResult !== null) {
      return {
        success: true,
        carrotsRemaining: rpcResult,
      }
    }

    // RPC 不存在时的降级处理
    if (rpcError?.code === '42883') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('carrots')
        .eq('id', user.id)
        .single()

      if (!profile || profile.carrots < DANCE_COST) {
        throw new Error(`Not enough carrots. Need ${DANCE_COST}, have ${profile?.carrots || 0}`)
      }

      await supabase
        .from('profiles')
        .update({ carrots: profile.carrots - DANCE_COST })
        .eq('id', user.id)

      await supabase
        .from('dance_records')
        .insert({
          user_id: user.id,
          carrots_spent: DANCE_COST,
        })

      return {
        success: true,
        carrotsRemaining: profile.carrots - DANCE_COST,
      }
    }

    throw rpcError || new Error('Dance redemption failed')
  },
}
