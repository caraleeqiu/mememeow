import { useState, useEffect, useRef } from 'react'
import './DancingCat.css'

interface DancingCatProps {
  duration?: number
  onComplete: () => void
}

export function DancingCat({ duration = 15, onComplete }: DancingCatProps) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const onCompleteRef = useRef(onComplete)
  const isMountedRef = useRef(true)

  // 保持 onComplete 引用最新，但不触发 effect 重新运行
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    isMountedRef.current = true

    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer)
          // 使用 setTimeout 确保状态更新完成后再调用
          setTimeout(() => {
            if (isMountedRef.current) {
              onCompleteRef.current()
            }
          }, 500)
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => {
      isMountedRef.current = false
      clearInterval(timer)
    }
  }, []) // 空依赖，只在挂载时运行

  const progressPercentage = (timeLeft / duration) * 100

  return (
    <div className="dancing-cat">
      <div className="dancing-cat__stage">
        {/* 迪斯科灯光 */}
        <div className="dancing-cat__lights">
          <div className="dancing-cat__light dancing-cat__light--1" />
          <div className="dancing-cat__light dancing-cat__light--2" />
          <div className="dancing-cat__light dancing-cat__light--3" />
        </div>

        {/* 跳舞的猫 */}
        <div className="dancing-cat__cat">
          <img
            src="/carrot-cat.jpg"
            alt="萝卜猫跳舞"
            className="dancing-cat__image"
          />
        </div>

        {/* 音符特效 */}
        <div className="dancing-cat__notes">
          {['♪', '♫', '♬', '♩'].map((note, i) => (
            <span
              key={i}
              className="dancing-cat__note"
              style={{
                left: `${20 + i * 20}%`,
                animationDelay: `${i * 0.2}s`
              }}
            >
              {note}
            </span>
          ))}
        </div>
      </div>

      {/* 倒计时 */}
      <div className="dancing-cat__timer">
        <span className="dancing-cat__timer-text">{timeLeft}s</span>
        <div className="dancing-cat__timer-bar">
          <div
            className="dancing-cat__timer-fill"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <p className="dancing-cat__message">萝卜猫正在跳舞!</p>
    </div>
  )
}
