import { useState, useCallback } from 'react'
import './LinkInput.css'

interface LinkInputProps {
  onSubmit: (url: string) => Promise<void>
  onPaste: (title: string, text: string) => Promise<void>
  onFile: (title: string, text: string) => Promise<void>
  isLoading: boolean
  onCancel?: () => void
  error?: string
}

export function LinkInput({ onSubmit, onPaste, onFile, isLoading, onCancel, error }: LinkInputProps) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'url' | 'paste' | 'file'>('url')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteText, setPasteText] = useState('')

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    await onFile(file.name.replace(/\.[^/.]+$/, ''), text)
    e.target.value = ''
  }, [onFile])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || isLoading) return
    await onSubmit(url.trim())
    setUrl('')
  }, [url, isLoading, onSubmit])

  const handlePaste = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteText.trim() || isLoading) return
    await onPaste(pasteTitle.trim(), pasteText.trim())
    setPasteTitle('')
    setPasteText('')
    setMode('url')
  }, [pasteTitle, pasteText, isLoading, onPaste])

  return (
    <div className="link-input">
      {/* Mode tabs */}
      <div className="link-input__tabs">
        <button
          type="button"
          className={`link-input__tab ${mode === 'url' ? 'link-input__tab--active' : ''}`}
          onClick={() => setMode('url')}
        >
          链接
        </button>
        <button
          type="button"
          className={`link-input__tab ${mode === 'paste' ? 'link-input__tab--active' : ''}`}
          onClick={() => setMode('paste')}
        >
          粘贴文字
        </button>
        <button
          type="button"
          className={`link-input__tab ${mode === 'file' ? 'link-input__tab--active' : ''}`}
          onClick={() => setMode('file')}
        >
          上传文件
        </button>
      </div>

      {/* URL mode */}
      {mode === 'url' && (
        <form onSubmit={handleSubmit} className="link-input__form">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴视频链接... YouTube, TikTok, Instagram..."
            className="link-input__field"
            disabled={isLoading}
          />
          <button type="submit" className="link-input__btn" disabled={isLoading || !url.trim()}>
            {isLoading ? '提取中...' : '开始'}
          </button>
          {isLoading && onCancel && (
            <button type="button" className="link-input__cancel" onClick={onCancel}>
              取消
            </button>
          )}
        </form>
      )}

      {/* Paste mode */}
      {mode === 'paste' && (
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
            placeholder="直接粘贴英文内容..."
            className="link-input__textarea"
            rows={5}
            disabled={isLoading}
          />
          <button type="submit" className="link-input__btn" disabled={isLoading || !pasteText.trim()}>
            {isLoading ? '处理中...' : '开始跟读'}
          </button>
        </form>
      )}

      {/* File mode */}
      {mode === 'file' && (
        <div className="link-input__file">
          <label className="link-input__file-label">
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleFileChange}
              disabled={isLoading}
              className="link-input__file-input"
            />
            <span className="link-input__file-btn">
              {isLoading ? '处理中...' : '选择文件 (.txt, .md)'}
            </span>
          </label>
        </div>
      )}

      {error && (
        <div className="link-input__error">
          {error}
        </div>
      )}

      <div className="link-input__supported">
        支持: YouTube · TikTok · Instagram · Twitter · 仅限英文内容
      </div>
    </div>
  )
}
