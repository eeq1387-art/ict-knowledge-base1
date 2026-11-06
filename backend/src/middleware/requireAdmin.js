import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'

const ADMIN_CACHE_TTL_MS = 60 * 1000
const adminPresenceCache = new Map()
const unauthorizedMessage = 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่'

function cachedAdminPresence(adminId) {
  const cached = adminPresenceCache.get(adminId)
  if (!cached) return undefined
  if (cached.expiresAt <= Date.now()) {
    adminPresenceCache.delete(adminId)
    return undefined
  }
  return cached.exists
}

function cacheAdminPresence(adminId, exists) {
  if (adminPresenceCache.size > 5000) {
    const now = Date.now()
    for (const [id, cached] of adminPresenceCache) if (cached.expiresAt <= now) adminPresenceCache.delete(id)
  }
  adminPresenceCache.set(adminId, { exists, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
}

export async function requireAdmin(req, res, next) {
  const authHeader = req.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบเจ้าหน้าที่' })
  let claims
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ message: unauthorizedMessage })
  }
  if (!claims || typeof claims !== 'object' || claims.role !== 'admin') return res.status(401).json({ message: unauthorizedMessage })
  const adminId = Number(claims.sub)
  if (!Number.isInteger(adminId) || adminId < 1) return res.status(401).json({ message: unauthorizedMessage })

  try {
    let exists = cachedAdminPresence(adminId)
    if (exists === undefined) {
      exists = Boolean(await prisma.admin.findUnique({ where: { adminId }, select: { adminId: true } }))
      cacheAdminPresence(adminId, exists)
    }
    if (!exists) return res.status(401).json({ message: unauthorizedMessage })
    req.admin = { adminId, username: claims.username }
    return next()
  } catch (error) {
    return next(error)
  }
}
