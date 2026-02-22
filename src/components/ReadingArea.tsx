import { useState, useEffect, useCallback, useRef } from 'react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import type { CatMood, ReadingResult, ProgressRecord } from '../types'
import './ReadingArea.css'

interface ReadingAreaProps {
  sentences: string[]
  contentId: string
  onRecord: (sentenceIndex: number, sentenceText: string, userSpeech: string) => Promise<ReadingResult>
  onMoodChange: (mood: CatMood, message?: string) => void
  onComplete: () => void
  initialProgress?: ProgressRecord[]
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

  // 使用 ref 保持回调函数的最新引用
  const onMoodChangeRef = useRef(onMoodChange)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onMoodChangeRef.current = onMoodChange
  }, [onMoodChange])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

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

  // 监听状态变化
  useEffect(() => {
    if (isListening) {
      onMoodChangeRef.current('listening', '我在听...')
    }
  }, [isListening])

  // 检测是否为英文（主要是ASCII字母）
  const isEnglishText = (text: string): boolean => {
    // 移除标点和空格后，检查是否主要是英文字母
    const letters = text.replace(/[^a-zA-Z\u4e00-\u9fff]/g, '')
    if (letters.length === 0) return true
    const englishLetters = letters.replace(/[^a-zA-Z]/g, '')
    return englishLetters.length / letters.length > 0.5
  }

  // 处理录音结束
  const handleToggleRecording = useCallback(async () => {
    if (isListening) {
      stopListening()

      if (!transcript.trim()) {
        onMoodChangeRef.current('encouraging', '没听清楚，再说一次？')
        return
      }

      // 检测是否为英文
      if (!isEnglishText(transcript)) {
        onMoodChangeRef.current('encouraging', '目前只支持英文哦~')
        resetTranscript()
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

          let message = '你真棒!'
          if (newCombo >= 5) message = `${newCombo}连击! 太厉害了!`
          else if (newCombo >= 3) message = `${newCombo}连击! 继续保持!`
          else if (result.carrotsEarned > 0) message = `+${result.carrotsEarned}🥕 你真棒!`

          onMoodChangeRef.current('happy', message)

          // 检查是否全部完成
          if (newCompleted.size === sentences.length) {
            setTimeout(() => {
              onCompleteRef.current()
            }, 1500)
          } else {
            // 自动跳转到下一句
            setTimeout(() => {
              const nextIncomplete = sentences.findIndex((_, i) => !newCompleted.has(i))
              if (nextIncomplete !== -1) {
                setCurrentIndex(nextIncomplete)
                onMoodChangeRef.current('idle')
              }
            }, 2000)
          }
        } else {
          setCombo(0)
          const attempts = result.attempts
          let message = '再试一次!'
          if (attempts >= 3) message = '没关系，慢慢来~'
          else if (result.score >= 60) message = `差一点点! ${result.score}分`

          onMoodChangeRef.current('encouraging', message)
        }
      } catch {
        onMoodChangeRef.current('encouraging', '出错了，再试一次？')
      } finally {
        setIsProcessing(false)
        resetTranscript()
      }
    } else {
      resetTranscript()
      toggleListening()
    }
  }, [isListening, transcript, currentIndex, sentences, completedIndexes, combo, onRecord, stopListening, resetTranscript, toggleListening])

  const goToSentence = useCallback((index: number) => {
    setCurrentIndex(index)
    resetTranscript()
    setLastResult(null)
    onMoodChangeRef.current('idle')
  }, [resetTranscript])

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

      {/* 录音按钮 */}
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
              <span>正确! 得分: {lastResult.score}%</span>
              {lastResult.carrotsEarned > 0 && (
                <span className="reading-area__result-carrot">+{lastResult.carrotsEarned}🥕</span>
              )}
            </>
          ) : (
            <>
              <span className="reading-area__result-icon">❌</span>
              <span>再试试! 匹配度: {lastResult.score}%</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
