import initSqlJs, { Database } from 'sql.js'
import fs from 'fs'
import path from 'path'

let db: Database

const dbPath = path.join(process.cwd(), 'mememeow.db')

export async function initDb() {
  const SQL = await initSqlJs()

  // 尝试加载现有数据库
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // 用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      carrots INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 文章/视频表
  db.run(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      type TEXT NOT NULL,
      platform TEXT NOT NULL,
      sentences TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // 跟读记录表
  db.run(`
    CREATE TABLE IF NOT EXISTS reading_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      sentence_text TEXT NOT NULL,
      user_speech TEXT,
      is_correct INTEGER NOT NULL,
      attempts INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (content_id) REFERENCES contents(id)
    )
  `)

  // 错题本
  db.run(`
    CREATE TABLE IF NOT EXISTS mistakes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      sentence_text TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      is_mastered INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (content_id) REFERENCES contents(id)
    )
  `)

  // 跳舞记录
  db.run(`
    CREATE TABLE IF NOT EXISTS dance_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      carrots_spent INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  saveDb()
  console.log('Database initialized!')
}

export function saveDb() {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

export function getDb() {
  return db
}

// 辅助函数
export function prepare(sql: string) {
  return {
    run: (...params: any[]) => {
      db.run(sql, params)
      saveDb()
    },
    get: (...params: any[]) => {
      const stmt = db.prepare(sql)
      stmt.bind(params)
      if (stmt.step()) {
        const row = stmt.getAsObject()
        stmt.free()
        return row
      }
      stmt.free()
      return undefined
    },
    all: (...params: any[]) => {
      const stmt = db.prepare(sql)
      stmt.bind(params)
      const results: any[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject())
      }
      stmt.free()
      return results
    }
  }
}
