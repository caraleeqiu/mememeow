export interface User {
  id: string
  email: string
  carrots: number
  token: string
}

export interface Sentence {
  index: number
  text: string
  isCompleted: boolean
  attempts: number
}

export interface Content {
  id: string
  url: string
  title: string
  type: 'video' | 'article'
  platform: string
  sentences: string[]
  totalSentences: number
  created_at: string
}

export interface ReadingResult {
  isMatch: boolean
  score: number
  carrotsEarned: number
  attempts: number
}

export interface Progress {
  completed: number
  total: number
  percentage: number
}

export interface Stats {
  totalReadings: number
  correctReadings: number
  accuracy: number
  totalContents: number
  mistakesCount: number
  danceCount: number
}

export interface Mistake {
  id: string
  content_id: string
  sentence_index: number
  sentence_text: string
  attempts: number
  is_mastered: number
}

export type CatMood = 'idle' | 'listening' | 'happy' | 'encouraging' | 'dancing' | 'highfive'
