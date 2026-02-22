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
  async paste(title: string, text: string, userId?: string): Promise<Content & { totalSentences: number }> {
    console.log('[paste] Starting with userId:', userId)

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
    const { data, error } = await supabase
      .from('contents')
      .insert({
        user_id: userId,
        url: 'pasted',
        title: title || 'Pasted Text',
        type: 'article',
        platform: 'paste',
        sentences,
      })
      .select()
      .single()

    if (error) throw error

    return {
      ...data,
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

  async list(): Promise<(Content & { totalSentences: number })[]> {
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

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

export const reading = {
  async record(contentId: string, sentenceIndex: number, sentenceText: string, userSpeech: string) {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) throw new Error('Not authenticated')

    // 使用改进的匹配算法
    const { isMatch, score } = matchSpeech(sentenceText, userSpeech)

    // 检查是否已有记录
    const { data: existing } = await supabase
      .from('reading_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('content_id', contentId)
      .eq('sentence_index', sentenceIndex)
      .maybeSingle()

    let carrotsEarned = 0
    let attempts = 1
    const wasCorrectBefore = existing?.is_correct

    if (existing) {
      attempts = (existing.attempts || 0) + 1
      await supabase
        .from('reading_records')
        .update({
          user_speech: userSpeech,
          is_correct: isMatch,
          attempts,
        })
        .eq('id', existing.id)

      // 之前错误现在正确，奖励萝卜
      if (isMatch && !wasCorrectBefore) {
        carrotsEarned = 1
      }
    } else {
      await supabase
        .from('reading_records')
        .insert({
          user_id: user.id,
          content_id: contentId,
          sentence_index: sentenceIndex,
          sentence_text: sentenceText,
          user_speech: userSpeech,
          is_correct: isMatch,
        })

      if (isMatch) {
        carrotsEarned = 1
      }
    }

    // 使用原子操作更新萝卜数（修复竞态条件）
    if (carrotsEarned > 0) {
      // 方法1: 使用 RPC 函数（需要在 Supabase 中创建）
      const { error: rpcError } = await supabase.rpc('increment_carrots', {
        user_id: user.id,
        amount: carrotsEarned,
      })

      // 如果 RPC 不存在，降级到普通更新（不完美但兼容）
      if (rpcError?.code === '42883') {
        // Function does not exist - fallback
        const { data: profile } = await supabase
          .from('profiles')
          .select('carrots')
          .eq('id', user.id)
          .single()

        if (profile) {
          await supabase
            .from('profiles')
            .update({ carrots: (profile.carrots || 0) + carrotsEarned })
            .eq('id', user.id)
        }
      }
    }

    // 错误次数超过2次，加入错题本
    if (!isMatch && attempts >= 2) {
      const { data: existingMistake } = await supabase
        .from('mistakes')
        .select('id, attempts')
        .eq('user_id', user.id)
        .eq('content_id', contentId)
        .eq('sentence_index', sentenceIndex)
        .maybeSingle()

      if (existingMistake) {
        await supabase
          .from('mistakes')
          .update({ attempts: (existingMistake.attempts || 0) + 1, is_mastered: false })
          .eq('id', existingMistake.id)
      } else {
        await supabase
          .from('mistakes')
          .insert({
            user_id: user.id,
            content_id: contentId,
            sentence_index: sentenceIndex,
            sentence_text: sentenceText,
          })
      }
    }

    return { isMatch, score, carrotsEarned, attempts }
  },

  async progress(contentId: string) {
    const { data: records, error } = await supabase
      .from('reading_records')
      .select('sentence_index, is_correct, attempts')
      .eq('content_id', contentId)

    if (error) throw error

    const { data: contentData } = await supabase
      .from('contents')
      .select('sentences')
      .eq('id', contentId)
      .single()

    const totalSentences = contentData?.sentences?.length || 0
    const typedRecords = (records || []) as ProgressRecord[]
    const completed = typedRecords.filter(r => r.is_correct).length

    return {
      completed,
      total: totalSentences,
      percentage: totalSentences > 0 ? Math.round((completed / totalSentences) * 100) : 0,
      records: typedRecords,
    }
  },

  async mistakes(includeMastered = false) {
    let query = supabase.from('mistakes').select('*').order('created_at', { ascending: false })

    if (!includeMastered) {
      query = query.eq('is_mastered', false)
    }

    const { data, error } = await query
    if (error) throw error
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

  async stats() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) throw new Error('Not authenticated')

    const [totalRes, correctRes, contentsRes, mistakesRes, danceRes] = await Promise.all([
      supabase.from('reading_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('reading_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_correct', true),
      supabase.from('contents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('mistakes').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_mastered', false),
      supabase.from('dance_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ])

    const totalReadings = totalRes.count || 0
    const correctReadings = correctRes.count || 0

    return {
      totalReadings,
      correctReadings,
      accuracy: totalReadings ? Math.round((correctReadings / totalReadings) * 100) : 0,
      totalContents: contentsRes.count || 0,
      mistakesCount: mistakesRes.count || 0,
      danceCount: danceRes.count || 0,
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
