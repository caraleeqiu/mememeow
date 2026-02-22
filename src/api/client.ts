import { supabase } from '../lib/supabase'

// Content
export const content = {
  // 粘贴文本创建内容
  async paste(title: string, text: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // 分割句子
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 10 && s.length < 200)

    if (sentences.length === 0) {
      throw new Error('No valid sentences found')
    }

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

    if (error) throw error

    return {
      ...data,
      totalSentences: sentences.length,
    }
  },

  // 从 URL 提取内容（简化版：仅支持文章抓取）
  async extract(url: string) {
    const { data: { user } } = await supabase.auth.getUser()
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

    // 对于视频平台，使用服务端 API 提取
    if (type === 'video') {
      try {
        const apiResponse = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })

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
        throw new Error(`Video extraction failed: ${error.message}. You can paste the transcript directly using the paste option.`)
      }
    }

    // 使用 CORS 代理获取文章内容
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      const response = await fetch(proxyUrl)
      const html = await response.text()

      // 简单提取文本
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      // 移除 script 和 style
      doc.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove())

      // 获取主要内容
      const article = doc.querySelector('article') || doc.querySelector('main') || doc.body
      const text = article?.textContent || ''

      // 分割句子
      const sentences = text
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 20 && s.length < 200)
        .slice(0, 50) // 最多 50 句

      if (sentences.length === 0) {
        throw new Error('Could not extract content from this URL')
      }

      // 获取标题
      const title = doc.querySelector('title')?.textContent || 'Article'

      const { data, error } = await supabase
        .from('contents')
        .insert({
          user_id: user.id,
          url,
          title,
          type,
          platform,
          sentences,
        })
        .select()
        .single()

      if (error) throw error

      return {
        ...data,
        totalSentences: sentences.length,
      }
    } catch (error: any) {
      throw new Error(`Failed to extract content: ${error.message}`)
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
      .single()

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
        .single()

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
