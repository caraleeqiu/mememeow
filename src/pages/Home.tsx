import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { CarrotCat } from '../components/CarrotCat'
import { LinkInput } from '../components/LinkInput'
import { ReadingArea } from '../components/ReadingArea'
import { DancingCat } from '../components/DancingCat'
import { content, reading } from '../api/client'
import { CatMood, Content, ReadingResult, Stats } from '../types'
import './Home.css'

type View = 'home' | 'reading' | 'dancing' | 'history' | 'mistakes' | 'stats'

export function Home() {
  const { user, profile, logout, updateCarrots } = useAuth()
  const [view, setView] = useState<View>('home')
  const [catMood, setCatMood] = useState<CatMood>('idle')
  const [catMessage, setCatMessage] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 内容相关
  const [currentContent, setCurrentContent] = useState<Content | null>(null)
  const [contentList, setContentList] = useState<Content[]>([])
  const [initialProgress, setInitialProgress] = useState<any[]>([])

  // 统计
  const [stats, setStats] = useState<Stats | null>(null)
  const [mistakes, setMistakes] = useState<any[]>([])

  useEffect(() => {
    loadContentList()
  }, [])

  const loadContentList = async () => {
    try {
      const list = await content.list()
      setContentList(list)
    } catch (err) {
      console.error('Failed to load content list:', err)
    }
  }

  const loadStats = async () => {
    try {
      const s = await reading.stats()
      setStats(s)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  const loadMistakes = async () => {
    try {
      const m = await reading.mistakes()
      setMistakes(m)
    } catch (err) {
      console.error('Failed to load mistakes:', err)
    }
  }

  const handleSubmitUrl = async (url: string) => {
    setIsLoading(true)
    setError('')
    setCatMood('listening')
    setCatMessage('正在提取内容...')

    try {
      const result = await content.extract(url)
      setCurrentContent(result as Content)

      // 加载进度
      const progress = await reading.progress(result.id)
      setInitialProgress(progress.records)

      setView('reading')
      setCatMood('idle')
      setCatMessage(`共${result.totalSentences}句，开始跟读吧！`)
      loadContentList()
    } catch (err: any) {
      setError(err.message)
      setCatMood('encouraging')
      setCatMessage('提取失败，换个链接试试？')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasteText = async (title: string, text: string) => {
    setIsLoading(true)
    setError('')

    try {
      const result = await content.paste(title, text)
      setCurrentContent(result as Content)
      setInitialProgress([])
      setView('reading')
      setCatMood('idle')
      setCatMessage(`共${result.totalSentences}句，开始跟读吧！`)
      loadContentList()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecord = async (
    sentenceIndex: number,
    sentenceText: string,
    userSpeech: string
  ): Promise<ReadingResult> => {
    const result = await reading.record(
      currentContent!.id,
      sentenceIndex,
      sentenceText,
      userSpeech
    )

    if (result.carrotsEarned > 0) {
      updateCarrots((profile?.carrots || 0) + result.carrotsEarned)
    }

    return result
  }

  const handleMoodChange = (mood: CatMood, message?: string) => {
    setCatMood(mood)
    setCatMessage(message)
  }

  const handleReadingComplete = () => {
    setCatMood('happy')
    setCatMessage('太棒了！你完成了所有句子！')
    loadContentList()
  }

  const handleHighFive = () => {
    setCatMood('highfive')
    setCatMessage('耶！击掌成功！')
    setTimeout(() => {
      setCatMood('idle')
      setCatMessage(undefined)
    }, 1500)
  }

  const handleDance = async () => {
    if ((profile?.carrots || 0) < 10) {
      setCatMood('encouraging')
      setCatMessage('萝卜不够哦，需要10个🥕')
      return
    }

    try {
      const result = await reading.dance()
      updateCarrots(result.carrotsRemaining)
      setView('dancing')
    } catch (err: any) {
      setCatMood('encouraging')
      setCatMessage(err.message)
    }
  }

  const handleDanceComplete = () => {
    setView('home')
    setCatMood('happy')
    setCatMessage('跳完啦！好开心～')
  }

  const openContent = async (c: Content) => {
    setCurrentContent(c)
    const progress = await reading.progress(c.id)
    setInitialProgress(progress.records)
    setView('reading')
    setCatMood('idle')
  }

  const renderContent = () => {
    switch (view) {
      case 'dancing':
        return <DancingCat onComplete={handleDanceComplete} />

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
                        {c.platform} · {c.totalSentences}句
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
              <p className="home__empty">没有错题，太棒了！</p>
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
              isLoading={isLoading}
            />

            {error && <p className="home__error">{error}</p>}

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
