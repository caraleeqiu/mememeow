import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware } from './auth.js'
import { extractContent, getUserContents, getContent } from '../services/content.js'
import { prepare } from '../db/schema.js'

const router = Router()

router.use(authMiddleware)

// 提取内容
router.post('/extract', async (req: Request, res: Response) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL required' })
    }

    const result = await extractContent(url, req.userId!)
    res.json(result)
  } catch (error: any) {
    console.error('Extract error:', error)
    res.status(400).json({ error: error.message })
  }
})

// 粘贴文本直接创建内容
router.post('/paste', async (req: Request, res: Response) => {
  try {
    const { title, text } = req.body

    if (!text) {
      return res.status(400).json({ error: 'Text required' })
    }

    // 分割句子
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 10 && s.length < 200)

    if (sentences.length === 0) {
      return res.status(400).json({ error: 'No valid sentences found' })
    }

    const id = uuidv4()
    prepare(`
      INSERT INTO contents (id, user_id, url, title, type, platform, sentences)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.userId!, 'pasted', title || 'Pasted Text', 'article', 'paste', JSON.stringify(sentences))

    res.json({
      id,
      title: title || 'Pasted Text',
      type: 'article',
      platform: 'paste',
      sentences,
      totalSentences: sentences.length
    })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// 获取用户所有内容
router.get('/', (req: Request, res: Response) => {
  const contents = getUserContents(req.userId!)
  res.json(contents)
})

// 获取单个内容
router.get('/:id', (req: Request, res: Response) => {
  try {
    const content = getContent(req.params.id)
    res.json(content)
  } catch (error: any) {
    res.status(404).json({ error: error.message })
  }
})

export default router
