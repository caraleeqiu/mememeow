import { supabase } from '../lib/supabase'

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
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please try again')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Content
export const content = {
  // 粘贴文本创建内容
  async paste(title: string, text: string) {
    console.log('[paste] Starting...')

    const { data: { user } } = await supabase.auth.getUser()
    console.log('[paste] Got user:', user?.id)

    if (!user) throw new Error('Not authenticated')

    // 分割句子 - 更宽松的过滤
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 5) // 放宽限制
      .slice(0, 50) // 最多50句

    console.log('[paste] Sentences:', sentences.length)

    if (sentences.length === 0) {
      throw new Error('No valid sentences found. Make sure the text contains complete sentences.')
    }

    console.log('[paste] Inserting to Supabase...')
    const { data, error } = await supabase
      .from('contents')
      .insert({
        user_id: user.id,
        url: 'pasted',
        title: title || 'Pasted Text',
        type: 'article',
        platform: 'paste',
        sentences,
      })
      .select()
      .single()

    console.log('[paste] Insert result:', { data, error })

    if (error) throw error

    return {
      ...data,
      totalSentences: sentences.length,
    }
  },

  // 从 URL 提取内容
  async extract(url: string) {
    console.log('[extract] Starting extraction for:', url)

    // 添加超时保护
    const userPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Auth timeout')), 5000)
    )

    let user
    try {
      const result = await Promise.race([userPromise, timeoutPromise]) as any
      user = result.data?.user
      console.log('[extract] Got user:', user?.id)
    } catch (e) {
      console.error('[extract] Auth failed:', e)
      throw new Error('认证超时，请刷新页面重试')
    }

    if (!user) throw new Error('Not authenticated')

    // 检测平台
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
    } else if (urlLower.includes('medium.com')) {
      platform = 'medium'
    }

    // 只支持视频平台
    if (type !== 'video') {
      throw new Error('目前只支持视频平台（TikTok、YouTube、Instagram、Twitter）。其他内容请使用"粘贴文字"或"上传文件"功能。')
    }

    // 使用服务端 API 提取视频内容
    try {
      console.log('[extract] Calling API...')
      const apiResponse = await fetchWithTimeout('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }, 90000) // 90秒超时
      console.log('[extract] API response:', apiResponse.status)

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
          user_id: user.id,
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
    } catch (error: any) {
      throw new Error(`提取失败: ${error.message}`)
    }
  },

  // 获取用户所有内容
  async list() {
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return data.map((c: { sentences: string[] }) => ({
      ...c,
      totalSentences: c.sentences.length,
    }))
  },

  // 获取单个内容
  async get(id: string) {
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },
}

// Reading
export const reading = {
  // 记录跟读
  async record(contentId: string, sentenceIndex: number, sentenceText: string, userSpeech: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // 匹配算法
    const normalize = (text: string) =>
      text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

    const originalNorm = normalize(sentenceText)
    const spokenNorm = normalize(userSpeech)

    let score = 0
    let isMatch = false

    if (originalNorm === spokenNorm) {
      score = 100
      isMatch = true
    } else {
      const originalWords = originalNorm.split(' ')
      const spokenWords = spokenNorm.split(' ')
      let matchedWords = 0
      for (const word of spokenWords) {
        if (originalWords.includes(word)) matchedWords++
      }
      score = Math.round((matchedWords / originalWords.length) * 100)
      isMatch = score >= 80
    }

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

    if (existing) {
      attempts = existing.attempts + 1
      // 更新记录
      await supabase
        .from('reading_records')
        .update({
          user_speech: userSpeech,
          is_correct: isMatch,
          attempts,
        })
        .eq('id', existing.id)

      // 如果之前错误现在正确，给萝卜
      if (isMatch && !existing.is_correct) {
        carrotsEarned = 1
      }
    } else {
      // 创建新记录
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

    // 更新萝卜
    if (carrotsEarned > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('carrots')
        .eq('id', user.id)
        .single()

      if (profile) {
        await supabase
          .from('profiles')
          .update({ carrots: profile.carrots + carrotsEarned })
          .eq('id', user.id)
      }
    }

    // 错误次数超过2次，加入错题本
    if (!isMatch && attempts >= 2) {
      const { data: existingMistake } = await supabase
        .from('mistakes')
        .select('*')
        .eq('user_id', user.id)
        .eq('content_id', contentId)
        .eq('sentence_index', sentenceIndex)
        .maybeSingle()

      if (existingMistake) {
        await supabase
          .from('mistakes')
          .update({ attempts: existingMistake.attempts + 1, is_mastered: false })
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

  // 获取内容进度
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
    const completed = records?.filter((r: { is_correct: boolean }) => r.is_correct).length || 0

    return {
      completed,
      total: totalSentences,
      percentage: totalSentences > 0 ? Math.round((completed / totalSentences) * 100) : 0,
      records: records || [],
    }
  },

  // 获取错题本
  async mistakes(includeMastered = false) {
    let query = supabase.from('mistakes').select('*').order('created_at', { ascending: false })

    if (!includeMastered) {
      query = query.eq('is_mastered', false)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  // 标记错题已掌握
  async masterMistake(id: string) {
    const { error } = await supabase
      .from('mistakes')
      .update({ is_mastered: true })
      .eq('id', id)

    if (error) throw error
    return { success: true }
  },

  // 获取统计
  async stats() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { count: totalReadings } = await supabase
      .from('reading_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: correctReadings } = await supabase
      .from('reading_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', true)

    const { count: totalContents } = await supabase
      .from('contents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: mistakesCount } = await supabase
      .from('mistakes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_mastered', false)

    const { count: danceCount } = await supabase
      .from('dance_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    return {
      totalReadings: totalReadings || 0,
      correctReadings: correctReadings || 0,
      accuracy: totalReadings ? Math.round(((correctReadings || 0) / totalReadings) * 100) : 0,
      totalContents: totalContents || 0,
      mistakesCount: mistakesCount || 0,
      danceCount: danceCount || 0,
    }
  },

  // 兑换跳舞
  async dance() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const DANCE_COST = 10

    const { data: profile } = await supabase
      .from('profiles')
      .select('carrots')
      .eq('id', user.id)
      .single()

    if (!profile || profile.carrots < DANCE_COST) {
      throw new Error(`Not enough carrots. Need ${DANCE_COST}, have ${profile?.carrots || 0}`)
    }

    // 扣除萝卜
    await supabase
      .from('profiles')
      .update({ carrots: profile.carrots - DANCE_COST })
      .eq('id', user.id)

    // 记录跳舞
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
  },
}
