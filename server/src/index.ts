import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initDb } from './db/schema.js'
import authRoutes from './routes/auth.js'
import contentRoutes from './routes/content.js'
import readingRoutes from './routes/reading.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json())

// 路由
app.use('/api/auth', authRoutes)
app.use('/api/content', contentRoutes)
app.use('/api/reading', readingRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MeMeMeow server is running! 🥕🐱' })
})

// 启动服务器
async function start() {
  await initDb()

  app.listen(PORT, () => {
    console.log(`
  🥕🐱 MeMeMeow Server Started!

  http://localhost:${PORT}

  API Endpoints:
  - POST /api/auth/register
  - POST /api/auth/login
  - GET  /api/auth/me
  - POST /api/content/extract
  - POST /api/content/paste
  - GET  /api/content
  - GET  /api/content/:id
  - POST /api/reading/record
  - GET  /api/reading/progress/:contentId
  - GET  /api/reading/mistakes
  - GET  /api/reading/stats
  - POST /api/reading/dance
    `)
  })
}

start().catch(console.error)
