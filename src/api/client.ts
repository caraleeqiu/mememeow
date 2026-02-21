const API_BASE = 'http://localhost:3002/api'

function getToken(): string | null {
  return localStorage.getItem('mememeow_token')
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

// Auth
export const auth = {
  register: (email: string, password: string) =>
    request<{ id: string; email: string; token: string; carrots: number }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ id: string; email: string; token: string; carrots: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ id: string; email: string; carrots: number }>('/auth/me'),
}

// Content
export const content = {
  extract: (url: string) =>
    request<{
      id: string
      title: string
      type: string
      platform: string
      sentences: string[]
      totalSentences: number
    }>('/content/extract', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  paste: (title: string, text: string) =>
    request<{
      id: string
      title: string
      type: string
      platform: string
      sentences: string[]
      totalSentences: number
    }>('/content/paste', {
      method: 'POST',
      body: JSON.stringify({ title, text }),
    }),

  list: () =>
    request<
      {
        id: string
        url: string
        title: string
        type: string
        platform: string
        sentences: string[]
        totalSentences: number
        created_at: string
      }[]
    >('/content'),

  get: (id: string) =>
    request<{
      id: string
      url: string
      title: string
      type: string
      platform: string
      sentences: string[]
    }>(`/content/${id}`),
}

// Reading
export const reading = {
  record: (contentId: string, sentenceIndex: number, sentenceText: string, userSpeech: string) =>
    request<{
      isMatch: boolean
      score: number
      carrotsEarned: number
      attempts: number
    }>('/reading/record', {
      method: 'POST',
      body: JSON.stringify({ contentId, sentenceIndex, sentenceText, userSpeech }),
    }),

  progress: (contentId: string) =>
    request<{
      completed: number
      total: number
      percentage: number
      records: { sentence_index: number; is_correct: number; attempts: number }[]
    }>(`/reading/progress/${contentId}`),

  mistakes: (includeMastered = false) =>
    request<
      {
        id: string
        content_id: string
        sentence_index: number
        sentence_text: string
        attempts: number
        is_mastered: number
      }[]
    >(`/reading/mistakes?includeMastered=${includeMastered}`),

  masterMistake: (id: string) =>
    request<{ success: boolean }>(`/reading/mistakes/${id}/master`, { method: 'POST' }),

  stats: () =>
    request<{
      totalReadings: number
      correctReadings: number
      accuracy: number
      totalContents: number
      mistakesCount: number
      danceCount: number
    }>('/reading/stats'),

  dance: () => request<{ success: boolean; carrotsRemaining: number }>('/reading/dance', { method: 'POST' }),
}
