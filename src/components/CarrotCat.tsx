import { useState, useEffect } from 'react'
import { CatMood } from '../types'
import './CarrotCat.css'

interface CarrotCatProps {
  mood: CatMood
  message?: string
  onHighFive?: () => void
  carrots?: number
}

const catFaces: Record<CatMood, string> = {
  idle: '(=^･ω･^=)',
  listening: '(=^･ｪ･^=)?',
  happy: '(=^▽^=)',
  encouraging: '(=^･ω･^=)ノ',
  dancing: '♪(=^･ω･^=)♪',
  highfive: '(=^･ω･^=)🙌'
}

const defaultMessages: Record<CatMood, string> = {
  idle: '给我一个英文链接吧~',
  listening: '我在听呢...',
  happy: '你真棒！读得很好！',
  encouraging: '再试一次，你可以的！',
  dancing: '耶！跳舞时间！',
  highfive: '击掌！Give me five!'
}

export function CarrotCat({ mood, message, onHighFive, carrots = 0 }: CarrotCatProps) {
  const [showHighFive, setShowHighFive] = useState(false)
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([])

  useEffect(() => {
    if (mood === 'happy') {
      setShowHighFive(true)
      // 添加闪光效果
      const newSparkles = Array.from({ length: 5 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100
      }))
      setSparkles(newSparkles)
      setTimeout(() => setSparkles([]), 1000)
    } else {
      setShowHighFive(false)
    }
  }, [mood])

  const handleHighFive = () => {
    if (onHighFive) {
      onHighFive()
      setShowHighFive(false)
    }
  }

  return (
    <div className={`carrot-cat carrot-cat--${mood}`}>
      {/* 萝卜计数 */}
      <div className="carrot-cat__carrots">
        🥕 {carrots}
      </div>

      <div className="carrot-cat__avatar" onClick={showHighFive ? handleHighFive : undefined}>
        {/* 闪光效果 */}
        {sparkles.map(s => (
          <span
            key={s.id}
            className="carrot-cat__sparkle"
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            ✨
          </span>
        ))}

        {/* 猫猫占位符 */}
        <div className="carrot-cat__placeholder">
          <span className="carrot-cat__face">{catFaces[mood]}</span>
          <div className="carrot-cat__carrot">🥕</div>
        </div>

        {/* 击掌提示 */}
        {showHighFive && (
          <div className="carrot-cat__highfive-hint">
            点我击掌！
          </div>
        )}
      </div>

      <div className="carrot-cat__bubble">
        {message || defaultMessages[mood]}
      </div>
    </div>
  )
}
