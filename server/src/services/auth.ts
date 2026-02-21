import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { prepare, saveDb } from '../db/schema.js'

const JWT_SECRET = process.env.JWT_SECRET || 'mememeow-secret-key-change-in-production'

interface User {
  id: string
  email: string
  password: string
  carrots: number
  created_at: string
}

export async function register(email: string, password: string) {
  const existingUser = prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (existingUser) {
    throw new Error('Email already registered')
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const id = uuidv4()

  prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)').run(id, email, hashedPassword)

  const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' })
  return { id, email, token, carrots: 0 }
}

export async function login(email: string, password: string) {
  const user = prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined
  if (!user) {
    throw new Error('Invalid email or password')
  }

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) {
    throw new Error('Invalid email or password')
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
  return { id: user.id, email: user.email, token, carrots: user.carrots }
}

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string }
}

export function getUser(userId: string) {
  return prepare('SELECT id, email, carrots, created_at FROM users WHERE id = ?').get(userId)
}

export function addCarrots(userId: string, amount: number) {
  prepare('UPDATE users SET carrots = carrots + ? WHERE id = ?').run(amount, userId)
  const user = prepare('SELECT carrots FROM users WHERE id = ?').get(userId) as { carrots: number }
  return user.carrots
}

export function spendCarrots(userId: string, amount: number) {
  const user = prepare('SELECT carrots FROM users WHERE id = ?').get(userId) as { carrots: number }
  if (user.carrots < amount) {
    throw new Error('Not enough carrots')
  }
  prepare('UPDATE users SET carrots = carrots - ? WHERE id = ?').run(amount, userId)
  return user.carrots - amount
}
