export interface Content {
  id: string
  user_id: string
  url: string
  title: string
  type: 'video' | 'article'
  platform: string
  sentences: string[]
  created_at: string
}

export interface ReadingRecord {
  id: string
  user_id: string
  content_id: string
  sentence_index: number
  sentence_text: string
  user_speech: string
  is_correct: boolean
  attempts: number
  created_at: string
}

export interface ProgressRecord {
  sentence_index: number
  is_correct: boolean
  attempts: number
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
  records: ProgressRecord[]
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
  user_id: string
  content_id: string
  sentence_index: number
  sentence_text: string
  attempts: number
  is_mastered: boolean
  created_at: string
}

export interface Profile {
  id: string
  email?: string
  carrots: number
}

export type CatMood = 'idle' | 'listening' | 'happy' | 'encouraging' | 'dancing' | 'highfive'
