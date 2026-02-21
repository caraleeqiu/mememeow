import { Router, Request, Response } from 'express'
import { authMiddleware } from './auth.js'
import {
  recordReading,
  getContentProgress,
  getMistakes,
  markMistakeMastered,
  getUserStats,
  redeemDance
} from '../services/reading.js'

const router = Router()

router.use(authMiddleware)

// 记录跟读
router.post('/record', (req: Request, res: Response) => {
  try {
    const { contentId, sentenceIndex, sentenceText, userSpeech } = req.body

    if (!contentId || sentenceIndex === undefined || !sentenceText || !userSpeech) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const result = recordReading(
      req.userId!,
      contentId,
      sentenceIndex,
      sentenceText,
      userSpeech
    )

    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// 获取内容进度
router.get('/progress/:contentId', (req: Request, res: Response) => {
  const progress = getContentProgress(req.userId!, req.params.contentId)
  res.json(progress)
})

// 获取错题本
router.get('/mistakes', (req: Request, res: Response) => {
  const includeMastered = req.query.includeMastered === 'true'
  const mistakes = getMistakes(req.userId!, includeMastered)
  res.json(mistakes)
})

// 标记错题已掌握
router.post('/mistakes/:id/master', (req: Request, res: Response) => {
  try {
    markMistakeMastered(req.userId!, req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// 获取用户统计
router.get('/stats', (req: Request, res: Response) => {
  const stats = getUserStats(req.userId!)
  res.json(stats)
})

// 兑换跳舞
router.post('/dance', (req: Request, res: Response) => {
  try {
    const result = redeemDance(req.userId!)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

export default router
