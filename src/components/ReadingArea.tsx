import { useState, useEffect } from 'react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import type { CatMood, ReadingResult } from '../types'
import './ReadingArea.css'

interface ReadingAreaProps {
  sentences: string[]
  contentId: string
  onRecord: (sentenceIndex: number, sentenceText: string, userSpeech: string) => Promise<ReadingResult>
  onMoodChange: (mood: CatMood, message?: string) => void
  onComplete: () => void
  initialProgress?: { sentence_index: number; is_correct: number }[]
}

export function ReadingArea({
  sentences,
  contentId: _contentId,
  onRecord,
  onMoodChange,
  onComplete,
  initialProgress = []
}: ReadingAreaProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedIndexes, setCompletedIndexes] = useState<Set<number>>(new Set())
  const [lastResult, setLastResult] = useState<ReadingResult | null>(null)
  const [combo, setCombo] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const { isListening, transcript, toggleListening, stopListening, resetTranscript, isSupported } = useSpeechRecognition()

  // 初始化进度
  useEffect(() => {
    const completed = new Set(
      initialProgress
        .filter(p => p.is_correct)
        .map(p => p.sentence_index)
    )
    setCompletedIndexes(completed)

    // 找到第一个未完成的句子
    const firstIncomplete = sentences.findIndex((_, i) => !completed.has(i))
    if (firstIncomplete !== -1) {
      setCurrentIndex(firstIncomplete)
    }
  }, [initialProgress, sentences])

  useEffect(() => {
    if (isListening) {
      onMoodChange('listening', '我在听...')
    }
  }, [isListening, onMoodChange])

  // 点击按钮切换录音状态
  const handleToggleRecording = async () => {
    if (isListening) {
      // 停止录音并处理
      stopListening()

      if (!transcript.trim()) {
        onMoodChange('encouraging', '没听清楚，再说一次？')
        return
      }

      setIsProcessing(true)

      try {
        const result = await onRecord(currentIndex, sentences[currentIndex], transcript)
        setLastResult(result)

        if (result.isMatch) {
          const newCompleted = new Set(completedIndexes)
          newCompleted.add(currentIndex)
          setCompletedIndexes(newCompleted)

          const newCombo = combo + 1
          setCombo(newCombo)

          let message = '你真棒！'
          if (newCombo >= 5) message = `${newCombo}连击！太厉害了！`
          else if (newCombo >= 3) message = `${newCombo}连击！继续保持！`
          else if (result.carrotsEarned > 0) message = `+${result.carrotsEarned}🥕 你真棒！`

          onMoodChange('happy', message)

          // 检查是否全部完成
          if (newCompleted.size === sentences.length) {
            setTimeout(() => {
              onComplete()
            }, 1500)
          } else {
            // 自动跳转到下一句
            setTimeout(() => {
              const nextIncomplete = sentences.findIndex((_, i) => !newCompleted.has(i))
              if (nextIncomplete !== -1) {
                setCurrentIndex(nextIncomplete)
                onMoodChange('idle')
              }
            }, 2000)
          }
        } else {
          setCombo(0)
          const attempts = result.attempts
          let message = '再试一次！'
          if (attempts >= 3) message = '没关系，慢慢来~'
          else if (result.score >= 60) message = `差一点点！${result.score}分`

          onMoodChange('encouraging', message)
        }
      } catch (error) {
        onMoodChange('encouraging', '出错了，再试一次？')
      } finally {
        setIsProcessing(false)
        resetTranscript()
      }
    } else {
      // 开始录音
      resetTranscript()
      toggleListening()
    }
  }

  const goToSentence = (index: number) => {
    setCurrentIndex(index)
    resetTranscript()
    setLastResult(null)
    onMoodChange('idle')
  }

  if (!isSupported) {
    return (
      <div className="reading-area reading-area--error">
        <p>你的浏览器不支持语音识别</p>
        <p>请使用 Chrome 或 Edge 浏览器</p>
      </div>
    )
  }

  const progress = Math.round((completedIndexes.size / sentences.length) * 100)

  return (
    <div className="reading-area">
      {/* 进度条 */}
      <div className="reading-area__progress">
        <div className="reading-area__progress-bar">
          <div
            className="reading-area__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="reading-area__progress-text">
          {completedIndexes.size}/{sentences.length} ({progress}%)
        </span>
        {combo >= 2 && (
          <span className="reading-area__combo">🔥 {combo}连击</span>
        )}
      </div>

      {/* 句子导航 */}
      <div className="reading-area__nav">
        {sentences.map((_, index) => (
          <button
            key={index}
            className={`reading-area__nav-dot ${
              completedIndexes.has(index) ? 'completed' : ''
            } ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToSentence(index)}
          >
            {completedIndexes.has(index) ? '✓' : index + 1}
          </button>
        ))}
      </div>

      {/* 当前句子 */}
      <div className="reading-area__sentence">
        <span className="reading-area__sentence-number">#{currentIndex + 1}</span>
        <p className="reading-area__sentence-text">{sentences[currentIndex]}</p>
      </div>

      {/* 录音按钮 - 点击开始/结束 */}
      <button
        className={`reading-area__record-btn ${isListening ? 'recording' : ''}`}
        onClick={handleToggleRecording}
        disabled={isProcessing}
      >
        {isProcessing ? '处理中...' : isListening ? '🎤 点击结束' : '🎤 点击开始'}
      </button>

      <p className="reading-area__tip">匹配度 ≥80% 得 1🥕 · 集满 10🥕 看猫跳舞</p>

      {/* 识别结果 */}
      {transcript && (
        <div className="reading-area__transcript">
          <span className="reading-area__transcript-label">你说的:</span>
          <span className="reading-area__transcript-text">{transcript}</span>
        </div>
      )}

      {/* 结果反馈 */}
      {lastResult && (
        <div className={`reading-area__result ${lastResult.isMatch ? 'success' : 'fail'}`}>
          {lastResult.isMatch ? (
            <>
              <span className="reading-area__result-icon">✅</span>
              <span>正确！得分: {lastResult.score}%</span>
              {lastResult.carrotsEarned > 0 && (
                <span className="reading-area__result-carrot">+{lastResult.carrotsEarned}🥕</span>
              )}
            </>
          ) : (
            <>
              <span className="reading-area__result-icon">❌</span>
              <span>再试试！匹配度: {lastResult.score}%</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
