import { Router, Request, Response, NextFunction } from 'express'
import { register, login, verifyToken, getUser } from '../services/auth.js'

const router = Router()

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const result = await register(email, password)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const result = await login(email, password)
    res.json(result)
  } catch (error: any) {
    res.status(400).json({ error: error.message })
  }
})

// 认证中间件
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.substring(7)
  try {
    const { userId } = verifyToken(token)
    req.userId = userId
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// 获取当前用户
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const user = getUser(req.userId!)
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }
  res.json(user)
})

export default router
