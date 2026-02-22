import { useState, useEffect, useRef } from 'react'
import './DancingCat.css'

export type MusicStyle = 'disco' | 'chill' | 'edm' | 'cute'

interface DancingCatProps {
  duration?: number
  musicStyle?: MusicStyle
  onComplete: () => void
}

const MUSIC_TRACKS: Record<MusicStyle, { url: string; name: string }> = {
  disco: {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    name: '🕺 Disco'
  },
  chill: {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    name: '😌 Chill'
  },
  edm: {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    name: '🎧 EDM'
  },
  cute: {
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    name: '🐱 可爱'
  }
}

export function DancingCat({ duration = 15, musicStyle = 'disco', onComplete }: DancingCatProps) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const [danceMove, setDanceMove] = useState(0)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onCompleteRef = useRef(onComplete)
  const isMountedRef = useRef(true)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // 播放音乐
  useEffect(() => {
    const track = MUSIC_TRACKS[musicStyle]
    audioRef.current = new Audio(track.url)
    audioRef.current.volume = 0.6
    audioRef.current.loop = true

    audioRef.current.play()
      .then(() => setMusicPlaying(true))
      .catch(() => {
        // 自动播放可能被阻止
        setMusicPlaying(false)
      })

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [musicStyle])

  // 随机移动
  useEffect(() => {
    const moveInterval = setInterval(() => {
      setPosition({
        x: 15 + Math.random() * 70,
        y: 15 + Math.random() * 70,
      })
      setRotation((Math.random() - 0.5) * 60)
      setScale(0.8 + Math.random() * 0.6)
      setDanceMove(m => (m + 1) % 4)
    }, 800)

    return () => clearInterval(moveInterval)
  }, [])

  // 倒计时
  useEffect(() => {
    isMountedRef.current = true

    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer)
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
  }, [])

  // 手动播放音乐（如果自动播放被阻止）
  const handlePlayMusic = () => {
    if (audioRef.current && !musicPlaying) {
      audioRef.current.play()
        .then(() => setMusicPlaying(true))
        .catch(() => {})
    }
  }

  const progressPercentage = (timeLeft / duration) * 100

  const danceEmojis = ['💃', '🕺', '🩰', '🎤']
  const currentEmoji = danceEmojis[danceMove]

  return (
    <div className="dancing-cat-fullscreen" onClick={handlePlayMusic}>
      {/* 迪斯科背景 */}
      <div className="disco-bg">
        <div className="disco-ball" />
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="disco-ray"
            style={{
              transform: `rotate(${i * 18}deg)`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      {/* 乱跳的猫 */}
      <div
        className="dancing-cat-wild"
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
        }}
      >
        <img
          src="/cat.jpg"
          alt="萝卜猫跳舞"
          className="dancing-cat-wild__image"
        />
        <span className="dancing-cat-wild__emoji">{currentEmoji}</span>
      </div>

      {/* 飘浮的音符和萝卜 */}
      <div className="floating-stuff">
        {['♪', '♫', '♬', '🥕', '✨', '🎵', '💫', '🥕'].map((item, i) => (
          <span
            key={i}
            className="floating-item"
            style={{
              left: `${10 + i * 12}%`,
              animationDelay: `${i * 0.3}s`,
              fontSize: `${24 + Math.random() * 20}px`,
            }}
          >
            {item}
          </span>
        ))}
      </div>

      {/* 底部 UI */}
      <div className="dancing-cat-ui">
        <div className="dancing-cat-ui__message">
          🎉 萝卜猫正在跳舞！{currentEmoji}
          {!musicPlaying && <span className="dancing-cat-ui__tap"> (点击播放音乐)</span>}
        </div>
        <div className="dancing-cat-ui__music">
          🎵 {MUSIC_TRACKS[musicStyle].name}
        </div>
        <div className="dancing-cat-ui__timer">
          <span className="dancing-cat-ui__time">{timeLeft}s</span>
          <div className="dancing-cat-ui__bar">
            <div
              className="dancing-cat-ui__fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
