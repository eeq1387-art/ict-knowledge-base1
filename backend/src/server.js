import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import publicRoutes from './routes/public.js'
import adminRoutes, { uploadErrorHandler } from './routes/admin.js'
import authRoutes from './routes/auth.js'
import { prisma } from './db.js'

const app = express()
const backendDir = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT) || 3000
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const jwtSecret = typeof process.env.JWT_SECRET === 'string' ? process.env.JWT_SECRET.trim() : ''
if (jwtSecret.length < 32 || /^replace-/i.test(jwtSecret) || /replace-this/i.test(jwtSecret)) {
  throw new Error('ค่า JWT_SECRET ไม่ถูกต้อง ต้องมีอย่างน้อย 32 ตัวอักษรและห้ามใช้ค่าตัวอย่าง สร้างค่าใหม่ด้วยคำสั่ง: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"')
}
const trustProxy = process.env.TRUST_PROXY?.trim()
const parsedTrustProxy = trustProxy
  ? trustProxy.toLowerCase() === 'true' ? true : trustProxy.toLowerCase() === 'false' ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy
  : false
const tooManyPublicRequests = (_req, res) => res.status(429).json({ message: 'มีการเรียกใช้งานระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง' })
const publicApiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, handler: tooManyPublicRequests })

app.disable('x-powered-by')
app.set('trust proxy', parsedTrustProxy)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: allowedOrigin }))
app.use(express.json({ limit: '32kb' }))
app.use('/uploads', express.static(path.resolve(backendDir, '../uploads'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}))
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api', (req, res, next) => {
  if (req.path === '/auth' || req.path.startsWith('/auth/') || req.path === '/admin' || req.path.startsWith('/admin/')) return next()
  return publicApiLimiter(req, res, next)
}, publicRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use((req, res) => res.status(404).json({ message: 'ไม่พบเส้นทางที่ร้องขอ' }))
app.use(uploadErrorHandler)
app.use((error, _req, res, _next) => {
  console.error('API error:', error.message)
  const status = Number(error.status ?? error.statusCode)
  const httpStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
  const message = httpStatus === 400
    ? 'รูปแบบคำขอไม่ถูกต้อง กรุณาตรวจสอบข้อมูลที่ส่ง'
    : httpStatus === 413
      ? 'ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด'
      : 'เกิดข้อผิดพลาดภายในระบบ'
  res.status(httpStatus).json({ message })
})

const server = app.listen(port, () => console.log(`ICT Knowledge API listening on port ${port}`))

async function shutdown() {
  server.close(async () => { await prisma.$disconnect(); process.exit(0) })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
