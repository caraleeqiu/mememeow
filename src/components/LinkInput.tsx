import { useState } from 'react'
import './LinkInput.css'

interface LinkInputProps {
  onSubmit: (url: string) => Promise<void>
  onPaste: (title: string, text: string) => Promise<void>
  isLoading: boolean
}

export function LinkInput({ onSubmit, onPaste, isLoading }: LinkInputProps) {
  const [url, setUrl] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteText, setPasteText] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || isLoading) return
    await onSubmit(url.trim())
    setUrl('')
  }

  const handlePaste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteText.trim() || isLoading) return
    await onPaste(pasteTitle.trim(), pasteText.trim())
    setPasteTitle('')
    setPasteText('')
    setShowPaste(false)
  }

  return (
    <div className="link-input">
      {!showPaste ? (
        <form onSubmit={handleSubmit} className="link-input__form">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴英文链接... YouTube, Medium, TikTok..."
            className="link-input__field"
            disabled={isLoading}
          />
          <button type="submit" className="link-input__btn" disabled={isLoading || !url.trim()}>
            {isLoading ? '加载中...' : '开始'}
          </button>
        </form>
      ) : (
        <form onSubmit={handlePaste} className="link-input__paste-form">
          <input
            type="text"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="标题（可选）"
            className="link-input__field"
            disabled={isLoading}
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="直接粘贴英文文章内容..."
            className="link-input__textarea"
            rows={5}
            disabled={isLoading}
          />
          <button type="submit" className="link-input__btn" disabled={isLoading || !pasteText.trim()}>
            {isLoading ? '处理中...' : '开始跟读'}
          </button>
        </form>
      )}

      <button
        type="button"
        className="link-input__toggle"
        onClick={() => setShowPaste(!showPaste)}
      >
        {showPaste ? '← 输入链接' : '或者直接粘贴文字 →'}
      </button>

      <div className="link-input__supported">
        支持: YouTube · TikTok · Instagram · X · Medium · 新闻网站
      </div>
    </div>
  )
}
