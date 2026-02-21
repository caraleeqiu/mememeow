import { v4 as uuidv4 } from 'uuid'
import { prepare } from '../db/schema.js'
import { addCarrots } from './auth.js'

interface ReadingRecord {
  id: string
  user_id: string
  content_id: string
  sentence_index: number
  sentence_text: string
  user_speech: string
  is_correct: number
  attempts: number
  created_at: string
}

// 文本匹配算法
export function matchSpeech(original: string, spoken: string): { isMatch: boolean; score: number } {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const originalNorm = normalize(original)
  const spokenNorm = normalize(spoken)

  if (originalNorm === spokenNorm) {
    return { isMatch: true, score: 100 }
  }

  const originalWords = originalNorm.split(' ')
  const spokenWords = spokenNorm.split(' ')

  let matchedWords = 0
  for (const word of spokenWords) {
    if (originalWords.includes(word)) {
      matchedWords++
    }
  }

  const score = Math.round((matchedWords / originalWords.length) * 100)
  return { isMatch: score >= 80, score }
}

// 记录跟读
export function recordReading(
  userId: string,
  contentId: string,
  sentenceIndex: number,
  sentenceText: string,
  userSpeech: string
) {
  const { isMatch, score } = matchSpeech(sentenceText, userSpeech)

  const existing = prepare(`
    SELECT * FROM reading_records
    WHERE user_id = ? AND content_id = ? AND sentence_index = ?
  `).get(userId, contentId, sentenceIndex) as ReadingRecord | undefined

  let carrotsEarned = 0

  if (existing) {
    prepare(`
      UPDATE reading_records
      SET user_speech = ?, is_correct = ?, attempts = attempts + 1
      WHERE id = ?
    `).run(userSpeech, isMatch ? 1 : 0, existing.id)

    if (isMatch && !existing.is_correct) {
      carrotsEarned = 1
      addCarrots(userId, carrotsEarned)
    }
  } else {
    const id = uuidv4()
    prepare(`
      INSERT INTO reading_records (id, user_id, content_id, sentence_index, sentence_text, user_speech, is_correct)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, contentId, sentenceIndex, sentenceText, userSpeech, isMatch ? 1 : 0)

    if (isMatch) {
      carrotsEarned = 1
      addCarrots(userId, carrotsEarned)
    }
  }

  if (!isMatch) {
    const attempts = existing ? existing.attempts + 1 : 1
    if (attempts >= 2) {
      addToMistakes(userId, contentId, sentenceIndex, sentenceText)
    }
  }

  return {
    isMatch,
    score,
    carrotsEarned,
    attempts: existing ? existing.attempts + 1 : 1
  }
}

function addToMistakes(userId: string, contentId: string, sentenceIndex: number, sentenceText: string) {
  const existing = prepare(`
    SELECT * FROM mistakes
    WHERE user_id = ? AND content_id = ? AND sentence_index = ?
  `).get(userId, contentId, sentenceIndex)

  if (existing) {
    prepare(`
      UPDATE mistakes SET attempts = attempts + 1, is_mastered = 0
      WHERE user_id = ? AND content_id = ? AND sentence_index = ?
    `).run(userId, contentId, sentenceIndex)
  } else {
    const id = uuidv4()
    prepare(`
      INSERT INTO mistakes (id, user_id, content_id, sentence_index, sentence_text)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, contentId, sentenceIndex, sentenceText)
  }
}

export function markMistakeMastered(userId: string, mistakeId: string) {
  prepare(`
    UPDATE mistakes SET is_mastered = 1
    WHERE id = ? AND user_id = ?
  `).run(mistakeId, userId)
}

export function getMistakes(userId: string, includeMastered = false) {
  const query = includeMastered
    ? `SELECT * FROM mistakes WHERE user_id = ? ORDER BY created_at DESC`
    : `SELECT * FROM mistakes WHERE user_id = ? AND is_mastered = 0 ORDER BY created_at DESC`

  return prepare(query).all(userId)
}

export function getContentProgress(userId: string, contentId: string) {
  const records = prepare(`
    SELECT sentence_index, is_correct, attempts
    FROM reading_records
    WHERE user_id = ? AND content_id = ?
  `).all(userId, contentId) as { sentence_index: number; is_correct: number; attempts: number }[]

  const completed = records.filter(r => r.is_correct).length
  const total = prepare(`SELECT sentences FROM contents WHERE id = ?`).get(contentId) as { sentences: string }
  const totalSentences = JSON.parse(total.sentences).length

  return {
    completed,
    total: totalSentences,
    percentage: Math.round((completed / totalSentences) * 100),
    records
  }
}

export function getUserStats(userId: string) {
  const totalReadings = prepare(`
    SELECT COUNT(*) as count FROM reading_records WHERE user_id = ?
  `).get(userId) as { count: number }

  const correctReadings = prepare(`
    SELECT COUNT(*) as count FROM reading_records WHERE user_id = ? AND is_correct = 1
  `).get(userId) as { count: number }

  const totalContents = prepare(`
    SELECT COUNT(*) as count FROM contents WHERE user_id = ?
  `).get(userId) as { count: number }

  const totalMistakes = prepare(`
    SELECT COUNT(*) as count FROM mistakes WHERE user_id = ? AND is_mastered = 0
  `).get(userId) as { count: number }

  const danceCount = prepare(`
    SELECT COUNT(*) as count FROM dance_records WHERE user_id = ?
  `).get(userId) as { count: number }

  return {
    totalReadings: totalReadings.count,
    correctReadings: correctReadings.count,
    accuracy: totalReadings.count > 0 ? Math.round((correctReadings.count / totalReadings.count) * 100) : 0,
    totalContents: totalContents.count,
    mistakesCount: totalMistakes.count,
    danceCount: danceCount.count
  }
}

export function redeemDance(userId: string) {
  const DANCE_COST = 10

  const user = prepare(`SELECT carrots FROM users WHERE id = ?`).get(userId) as { carrots: number }
  if (user.carrots < DANCE_COST) {
    throw new Error(`Not enough carrots. Need ${DANCE_COST}, have ${user.carrots}`)
  }

  prepare(`UPDATE users SET carrots = carrots - ? WHERE id = ?`).run(DANCE_COST, userId)

  const id = uuidv4()
  prepare(`INSERT INTO dance_records (id, user_id, carrots_spent) VALUES (?, ?, ?)`).run(id, userId, DANCE_COST)

  return {
    success: true,
    carrotsRemaining: user.carrots - DANCE_COST
  }
}
