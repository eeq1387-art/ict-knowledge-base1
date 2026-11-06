import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()
const WINDOW_MS = 15 * 60 * 1000
const rateLimitMessage = 'เข้าสู่ระบบบ่อยเกินไป โปรดลองใหม่ภายหลัง'
const loginIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ message: rateLimitMessage }),
})
const loginIdentityLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const address = ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1')
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 80) : ''
    return `${address}:${username}`
  },
  handler: (_req, res) => res.status(429).json({ message: rateLimitMessage }),
})
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-only-placeholder-never-used-as-a-credential', 12)

router.post('/login', loginIpLimiter, loginIdentityLimiter, async (req, res, next) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!username || username.length > 80 || !password || password.length > 200) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })

  try {
    const admin = await prisma.admin.findUnique({ where: { username } })
    const validPassword = await bcrypt.compare(password, admin?.password || DUMMY_PASSWORD_HASH)
    if (!admin || !validPassword) return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
    const token = jwt.sign({ role: 'admin', username: admin.username }, process.env.JWT_SECRET, { subject: String(admin.adminId), expiresIn: '8h', algorithm: 'HS256' })
    res.json({ token, admin: { adminId: admin.adminId, username: admin.username, fullname: admin.fullname } })
  } catch (error) { next(error) }
})

router.get('/me', requireAdmin, async (req, res, next) => {
  try {
    const admin = await prisma.admin.findUnique({ where: { adminId: req.admin.adminId }, select: { adminId: true, username: true, fullname: true } })
    if (!admin) return res.status(401).json({ message: 'ไม่พบบัญชีเจ้าหน้าที่นี้' })
    res.json({ admin })
  } catch (error) { next(error) }
})

// JWT is stateless: clients discard the token at logout; it expires after eight hours.
router.post('/logout', requireAdmin, (_req, res) => res.json({ message: 'ออกจากระบบแล้ว' }))

const passwordChangeLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ message: 'ลองเปลี่ยนรหัสผ่านบ่อยเกินไป โปรดลองใหม่ภายหลัง' }),
})

// Wrong current password returns 400 (not 401) so the browser keeps the still-valid session.
// If currentPassword is omitted by an already-authenticated admin, allow setting a new password directly.
router.put('/password', requireAdmin, passwordChangeLimiter, async (req, res, next) => {
  const hasCurrent = req.body?.currentPassword !== undefined && req.body?.currentPassword !== null
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  if (hasCurrent && (!currentPassword || currentPassword.length > 200)) return res.status(400).json({ message: 'กรุณากรอกรหัสผ่านปัจจุบัน' })
  if (newPassword.length < 12 || newPassword.length > 200) return res.status(400).json({ message: 'รหัสผ่านใหม่ต้องมีความยาว 12–200 ตัวอักษร' })
  if (hasCurrent && newPassword === currentPassword) return res.status(400).json({ message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน' })
  try {
    const admin = await prisma.admin.findUnique({ where: { adminId: req.admin.adminId }, select: { password: true } })
    if (!admin) return res.status(401).json({ message: 'ไม่พบบัญชีเจ้าหน้าที่นี้' })
    if (hasCurrent && !(await bcrypt.compare(currentPassword, admin.password))) return res.status(400).json({ message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
    await prisma.admin.update({ where: { adminId: req.admin.adminId }, data: { password: await bcrypt.hash(newPassword, 12) } })
    res.json({ message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' })
  } catch (error) { next(error) }
})

router.post('/reset-password', loginIpLimiter, passwordChangeLimiter, async (req, res, next) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const fullname = typeof req.body?.fullname === 'string' ? req.body.fullname.trim().replace(/\s+/g, ' ') : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  if (!username || username.length > 80 || !fullname || fullname.length > 160) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และชื่อ-นามสกุลเจ้าหน้าที่ให้ครบถ้วน' })
  }
  if (newPassword.length < 12 || newPassword.length > 200) {
    return res.status(400).json({ message: 'รหัสผ่านใหม่ต้องมีความยาว 12–200 ตัวอักษร' })
  }
  try {
    const admin = await prisma.admin.findUnique({ where: { username } })
    const registeredName = (admin?.fullname || '').trim().replace(/\s+/g, ' ')
    if (!admin || registeredName.toLowerCase() !== fullname.toLowerCase()) {
      await bcrypt.compare(newPassword, DUMMY_PASSWORD_HASH)
      return res.status(400).json({ message: 'ข้อมูลยืนยันตัวตนไม่ตรงกับบัญชีเจ้าหน้าที่ในระบบ' })
    }
    await prisma.admin.update({ where: { adminId: admin.adminId }, data: { password: await bcrypt.hash(newPassword, 12) } })
    res.json({ message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว สามารถใช้เข้าสู่ระบบได้ทันที' })
  } catch (error) { next(error) }
})

export default router
