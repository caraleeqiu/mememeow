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

  // 示范朗读状态
  const [isDemoing, setIsDemoing] = useState(false)
  const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1)

  // 使用 ref 防止内存泄漏
  const isMountedRef = useRef(true)
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { isListening, transcript, toggleListening, stopListening, resetTranscript, isSupported } = useSpeechRecognition()

  // 保持回调函数的最新引用
  const onMoodChangeRef = useRef(onMoodChange)
  const onCompleteRef = useRef(onComplete)
  const onRecordRef = useRef(onRecord)

  useEffect(() => {
    onMoodChangeRef.current = onMoodChange
  }, [onMoodChange])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    onRecordRef.current = onRecord
  }, [onRecord])

  // 组件卸载时清理
  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      window.speechSynthesis.cancel()
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current)
      }
    }
  }, [])

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

  // 预加载语音
  useEffect(() => {
    window.speechSynthesis.getVoices()
  }, [])

  // 示范朗读功能
  const handleDemo = useCallback(() => {
    if (isDemoing) {
      // 停止示范
      window.speechSynthesis.cancel()
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current)
        demoTimerRef.current = null
      }
      setIsDemoing(false)
      setHighlightedWordIndex(-1)
      return
    }

    const sentence = sentences[currentIndex]
    const words = sentence.split(/\s+/)

    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = 'en-US'
    utterance.rate = 0.85
    utterance.pitch = 1

    // 选择英语声音
    const voices = window.speechSynthesis.getVoices()
    const englishVoice = voices.find(v => v.lang.startsWith('en-') && v.name.includes('Female')) ||
                         voices.find(v => v.lang.startsWith('en-'))
    if (englishVoice) {
      utterance.voice = englishVoice
    }

    let currentWordIndex = 0
    const wordsCount = words.length
    const estimatedDuration = sentence.length * 60

    setIsDemoing(true)
    setHighlightedWordIndex(0)
    onMoodChangeRef.current('listening', '听示范...')

    const wordInterval = estimatedDuration / wordsCount
    demoTimerRef.current = setInterval(() => {
      currentWordIndex++
      if (currentWordIndex < wordsCount && isMountedRef.current) {
        setHighlightedWordIndex(currentWordIndex)
      }
    }, wordInterval)

    utterance.onend = () => {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current)
        demoTimerRef.current = null
      }
      if (isMountedRef.current) {
        setIsDemoing(false)
        setHighlightedWordIndex(-1)
        onMoodChangeRef.current('idle', '轮到你啦！')
      }
    }

    utterance.onerror = () => {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current)
        demoTimerRef.current = null
      }
      if (isMountedRef.current) {
        setIsDemoing(false)
        setHighlightedWordIndex(-1)
        onMoodChangeRef.current('encouraging', '示范播放失败')
      }
    }

    window.speechSynthesis.speak(utterance)
  }, [isDemoing, sentences, currentIndex])

  // 检测是否为英文
  const isEnglishText = useCallback((text: string): boolean => {
    const letters = text.replace(/[^a-zA-Z\u4e00-\u9fff]/g, '')
    if (letters.length === 0) return true
    const englishLetters = letters.replace(/[^a-zA-Z]/g, '')
    return englishLetters.length / letters.length > 0.5
  }, [])

  // 处理录音结束
  const handleToggleRecording = useCallback(async () => {
    if (isListening) {
      stopListening()

      if (!transcript.trim()) {
        onMoodChangeRef.current('encouraging', '没听清楚，再说一次？')
        return
      }

      if (!isEnglishText(transcript)) {
        onMoodChangeRef.current('encouraging', '目前只支持英文哦~')
        resetTranscript()
        return
      }

      setIsProcessing(true)

      try {
        const result = await onRecordRef.current(currentIndex, sentences[currentIndex], transcript)

        // 检查组件是否仍然挂载
        if (!isMountedRef.current) return

        setLastResult(result)

        if (result.isMatch) {
          setCompletedIndexes(prev => {
            const newCompleted = new Set(prev)
            newCompleted.add(currentIndex)

            // 检查是否全部完成
            if (newCompleted.size === sentences.length) {
              setTimeout(() => {
                if (isMountedRef.current) {
                  onCompleteRef.current()
                }
              }, 1500)
            } else {
              // 自动跳转到下一句
              setTimeout(() => {
                if (isMountedRef.current) {
                  const nextIncomplete = sentences.findIndex((_, i) => !newCompleted.has(i))
                  if (nextIncomplete !== -1) {
                    setCurrentIndex(nextIncomplete)
                    onMoodChangeRef.current('idle')
                  }
                }
              }, 2000)
            }

            return newCompleted
          })

          setCombo(prev => {
            const newCombo = prev + 1
            let message = '你真棒!'
            if (newCombo >= 5) message = `${newCombo}连击! 太厉害了!`
            else if (newCombo >= 3) message = `${newCombo}连击! 继续保持!`
            else if (result.carrotsEarned > 0) message = `+${result.carrotsEarned}🥕 你真棒!`
            onMoodChangeRef.current('happy', message)
            return newCombo
          })
        } else {
          setCombo(0)
          const attempts = result.attempts
          let message = '再试一次!'
          if (attempts >= 3) message = '没关系，慢慢来~'
          else if (result.score >= 60) message = `差一点点! ${result.score}分`
          onMoodChangeRef.current('encouraging', message)
        }
      } catch {
        if (isMountedRef.current) {
          onMoodChangeRef.current('encouraging', '出错了，再试一次？')
        }
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false)
          resetTranscript()
        }
      }
    } else {
      resetTranscript()
      toggleListening()
    }
  }, [isListening, transcript, currentIndex, sentences, isEnglishText, stopListening, resetTranscript, toggleListening])

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
        <p className="reading-area__sentence-text">
          {isDemoing ? (
            sentences[currentIndex].split(/\s+/).map((word, idx) => (
              <span
                key={idx}
                className={`reading-area__word ${idx === highlightedWordIndex ? 'highlighted' : ''} ${idx < highlightedWordIndex ? 'read' : ''}`}
              >
                {word}{' '}
              </span>
            ))
          ) : (
            sentences[currentIndex]
          )}
        </p>
      </div>

      {/* 按钮组 */}
      <div className="reading-area__buttons">
        <button
          className={`reading-area__demo-btn ${isDemoing ? 'playing' : ''}`}
          onClick={handleDemo}
          disabled={isProcessing || isListening}
        >
          {isDemoing ? '⏹️ 停止' : '🔊 示范'}
        </button>

        <button
          className={`reading-area__record-btn ${isListening ? 'recording' : ''}`}
          onClick={handleToggleRecording}
          disabled={isProcessing || isDemoing}
        >
          {isProcessing ? '处理中...' : isListening ? '🎤 结束' : '🎤 跟读'}
        </button>
      </div>

      <p className="reading-area__tip">匹配度 ≥80% 得 1🥕 · 集满 10🥕 看猫跳舞</p>

      {transcript && (
        <div className="reading-area__transcript">
          <span className="reading-area__transcript-label">你说的:</span>
          <span className="reading-area__transcript-text">{transcript}</span>
        </div>
      )}

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
