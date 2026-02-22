import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { CarrotCat } from '../components/CarrotCat'
import { LinkInput } from '../components/LinkInput'
import { ReadingArea } from '../components/ReadingArea'
import { DancingCat } from '../components/DancingCat'
import type { MusicStyle } from '../components/DancingCat'
import { content, reading } from '../api/client'
import type { CatMood, Content, ReadingResult, Stats, Mistake, ProgressRecord } from '../types'
import './Home.css'

type View = 'home' | 'reading' | 'dancing' | 'history' | 'mistakes' | 'stats' | 'music-select'

export function Home() {
  const { user, profile, accessToken, logout, updateCarrots } = useAuth()
  const [view, setView] = useState<View>('home')
  const [catMood, setCatMood] = useState<CatMood>('idle')
  const [catMessage, setCatMessage] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 内容相关
  const [currentContent, setCurrentContent] = useState<Content | null>(null)
  const [contentList, setContentList] = useState<Content[]>([])
  const [initialProgress, setInitialProgress] = useState<ProgressRecord[]>([])

  // 统计
  const [stats, setStats] = useState<Stats | null>(null)
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [selectedMusic, setSelectedMusic] = useState<MusicStyle>('disco')

  const loadContentList = useCallback(async () => {
    if (!user?.id) return
    try {
      const list = await content.list(user.id, accessToken || undefined)
      setContentList(list)
    } catch (err) {
      // Silent fail for background loading
    }
  }, [user?.id, accessToken])

  useEffect(() => {
    if (accessToken) {
      loadContentList()
    }
  }, [accessToken, loadContentList])

  const loadStats = useCallback(async () => {
    try {
      const s = await reading.stats(user?.id, accessToken || undefined)
      setStats(s)
    } catch (err) {
      // Silent fail
    }
  }, [user?.id, accessToken])

  const loadMistakes = useCallback(async () => {
    if (!user?.id) return
    try {
      const m = await reading.mistakes(user.id, false, accessToken || undefined)
      setMistakes(m)
    } catch (err) {
      // Silent fail
    }
  }, [user?.id, accessToken])

  const handleSubmitUrl = useCallback(async (url: string) => {
    setIsLoading(true)
    setError('')
    setCatMood('listening')
    setCatMessage('正在提取内容...')

    try {
      const result = await content.extract(url, user?.id)
      setCurrentContent(result as Content)

      const progress = await reading.progress(result.id, user?.id, accessToken || undefined)
      setInitialProgress(progress.records)

      setView('reading')
      setCatMood('idle')
      setCatMessage(`共${result.totalSentences}句，开始跟读吧!`)
      loadContentList()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setCatMood('encouraging')
      setCatMessage('提取失败，换个链接试试？')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, loadContentList])

  const handlePasteText = useCallback(async (title: string, text: string) => {
    console.log('[handlePasteText] Starting...', { title, text: text.slice(0, 50) })
    setIsLoading(true)
    setError('')

    try {
      console.log('[handlePasteText] Calling content.paste with userId:', user?.id, 'token:', accessToken ? 'yes' : 'no')
      const result = await content.paste(title, text, user?.id, accessToken || undefined)
      console.log('[handlePasteText] Got result:', result)
      setCurrentContent(result as Content)
      setInitialProgress([])
      setView('reading')
      setCatMood('idle')
      setCatMessage(`共${result.totalSentences}句，开始跟读吧!`)
      loadContentList()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, accessToken, loadContentList])

  const handleRecord = useCallback(async (
    sentenceIndex: number,
    sentenceText: string,
    userSpeech: string
  ): Promise<ReadingResult> => {
    const result = await reading.record(
      currentContent!.id,
      sentenceIndex,
      sentenceText,
      userSpeech,
      user?.id,
      accessToken || undefined
    )

    if (result.carrotsEarned > 0) {
      console.log('[handleRecord] Updating UI carrots:', profile?.carrots, '+', result.carrotsEarned)
      updateCarrots((profile?.carrots || 0) + result.carrotsEarned)
    }

    return result
  }, [currentContent, user?.id, accessToken, profile?.carrots, updateCarrots])

  const handleMoodChange = useCallback((mood: CatMood, message?: string) => {
    setCatMood(mood)
    setCatMessage(message)
  }, [])

  const handleReadingComplete = useCallback(() => {
    setCatMood('happy')
    setCatMessage('太棒了! 你完成了所有句子!')
    loadContentList()
  }, [loadContentList])

  const handleHighFive = useCallback(() => {
    setCatMood('highfive')
    setCatMessage('耶! 击掌成功!')
    setTimeout(() => {
      setCatMood('idle')
      setCatMessage(undefined)
    }, 1500)
  }, [])

  const handleDance = useCallback(async () => {
    if ((profile?.carrots || 0) < 10) {
      setCatMood('encouraging')
      setCatMessage('萝卜不够哦，需要10个🥕')
      return
    }
    // 先选音乐风格
    setView('music-select')
  }, [profile?.carrots])

  const startDance = useCallback(async (style: MusicStyle) => {
    setSelectedMusic(style)
    try {
      const result = await reading.dance()
      updateCarrots(result.carrotsRemaining)
      setView('dancing')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setCatMood('encouraging')
      setCatMessage(message)
      setView('home')
    }
  }, [updateCarrots])

  const handleDanceComplete = useCallback(() => {
    setView('home')
    setCatMood('happy')
    setCatMessage('跳完啦! 好开心~')
  }, [])

  const openContent = useCallback(async (c: Content) => {
    setCurrentContent(c)
    const progress = await reading.progress(c.id, user?.id, accessToken || undefined)
    setInitialProgress(progress.records)
    setView('reading')
    setCatMood('idle')
  }, [user?.id, accessToken])

  const handleCancel = useCallback(() => {
    setIsLoading(false)
    setError('')
    setCatMood('idle')
    setCatMessage(undefined)
  }, [])

  const renderContent = () => {
    switch (view) {
      case 'music-select':
        return (
          <div className="home__music-select">
            <h2>选择音乐风格 🎵</h2>
            <div className="home__music-options">
              <button onClick={() => startDance('disco')} className="home__music-btn">
                🕺 Disco
              </button>
              <button onClick={() => startDance('edm')} className="home__music-btn">
                🎧 EDM
              </button>
              <button onClick={() => startDance('chill')} className="home__music-btn">
                😌 Chill
              </button>
              <button onClick={() => startDance('cute')} className="home__music-btn">
                🐱 可爱
              </button>
            </div>
            <button onClick={() => setView('home')} className="home__back-btn">
              ← 返回
            </button>
          </div>
        )

      case 'dancing':
        return <DancingCat musicStyle={selectedMusic} onComplete={handleDanceComplete} />

      case 'reading':
        return currentContent ? (
          <div className="home__reading">
            <div className="home__reading-header">
              <button className="home__back-btn" onClick={() => setView('home')}>
                ← 返回
              </button>
              <h2 className="home__reading-title">{currentContent.title}</h2>
            </div>
            <ReadingArea
              sentences={currentContent.sentences}
              contentId={currentContent.id}
              onRecord={handleRecord}
              onMoodChange={handleMoodChange}
              onComplete={handleReadingComplete}
              initialProgress={initialProgress}
            />
          </div>
        ) : null

      case 'history':
        return (
          <div className="home__history">
            <div className="home__section-header">
              <button className="home__back-btn" onClick={() => setView('home')}>
                ← 返回
              </button>
              <h2>历史记录</h2>
            </div>
            {contentList.length === 0 ? (
              <p className="home__empty">还没有跟读记录</p>
            ) : (
              <div className="home__list">
                {contentList.map(c => (
                  <div key={c.id} className="home__list-item" onClick={() => openContent(c)}>
                    <div className="home__list-item-icon">
                      {c.type === 'video' ? '📹' : '📄'}
                    </div>
                    <div className="home__list-item-content">
                      <div className="home__list-item-title">{c.title}</div>
                      <div className="home__list-item-meta">
                        {c.platform} · {c.sentences.length}句
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 'mistakes':
        return (
          <div className="home__mistakes">
            <div className="home__section-header">
              <button className="home__back-btn" onClick={() => setView('home')}>
                ← 返回
              </button>
              <h2>错题本</h2>
            </div>
            {mistakes.length === 0 ? (
              <p className="home__empty">没有错题，太棒了!</p>
            ) : (
              <div className="home__list">
                {mistakes.map(m => (
                  <div key={m.id} className="home__list-item">
                    <div className="home__list-item-content">
                      <div className="home__list-item-title">{m.sentence_text}</div>
                      <div className="home__list-item-meta">
                        错误{m.attempts}次
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 'stats':
        return (
          <div className="home__stats">
            <div className="home__section-header">
              <button className="home__back-btn" onClick={() => setView('home')}>
                ← 返回
              </button>
              <h2>我的统计</h2>
            </div>
            {stats && (
              <div className="home__stats-grid">
                <div className="home__stat-card">
                  <div className="home__stat-value">{stats.totalReadings}</div>
                  <div className="home__stat-label">总跟读次数</div>
                </div>
                <div className="home__stat-card">
                  <div className="home__stat-value">{stats.accuracy}%</div>
                  <div className="home__stat-label">正确率</div>
                </div>
                <div className="home__stat-card">
                  <div className="home__stat-value">{stats.totalContents}</div>
                  <div className="home__stat-label">学习内容</div>
                </div>
                <div className="home__stat-card">
                  <div className="home__stat-value">{stats.danceCount}</div>
                  <div className="home__stat-label">跳舞次数</div>
                </div>
              </div>
            )}
          </div>
        )

      default:
        return (
          <>
            <CarrotCat
              mood={catMood}
              message={catMessage}
              onHighFive={handleHighFive}
              carrots={profile?.carrots || 0}
            />

            <LinkInput
              onSubmit={handleSubmitUrl}
              onPaste={handlePasteText}
              onFile={handlePasteText}
              isLoading={isLoading}
              onCancel={handleCancel}
              error={error}
            />

            {/* 快捷操作 */}
            <div className="home__actions">
              <button
                className="home__action-btn home__action-btn--dance"
                onClick={handleDance}
                disabled={(profile?.carrots || 0) < 10}
              >
                💃 看猫跳舞 (10🥕)
              </button>
            </div>

            {/* 导航菜单 */}
            <div className="home__nav">
              <button onClick={() => { setView('history'); loadContentList(); }}>
                📚 历史记录
              </button>
              <button onClick={() => { setView('mistakes'); loadMistakes(); }}>
                📝 错题本
              </button>
              <button onClick={() => { setView('stats'); loadStats(); }}>
                📊 统计
              </button>
            </div>
          </>
        )
    }
  }

  return (
    <div className="home">
      <header className="home__header">
        <h1 className="home__logo">🥕 MeMeMeow</h1>
        <div className="home__user">
          <span>{user?.email}</span>
          <button onClick={logout} className="home__logout">退出</button>
        </div>
      </header>

      <main className="home__main">
        {renderContent()}
      </main>
    </div>
  )
}
