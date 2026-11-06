import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { prisma } from '../db.js'
import { CONTACT_SETTING_KEY, normalizeContactSettings } from '../contactSettings.js'

const router = Router()
const feedbackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ message: 'ส่งการประเมินบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }),
})
// Count a view / search log once per visitor per window so refreshes, sort changes and
// React StrictMode double-fetches in development do not inflate statistics.
// Prefer the browser's opaque X-Visitor-Id so staff behind one shared office IP are still counted separately.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000
const DEDUPE_MAX_ENTRIES = 50000
const recentHits = new Map()
function visitorFingerprint(req) {
  const visitor = req.get('x-visitor-id')
  const raw = typeof visitor === 'string' && /^[\w-]{16,80}$/.test(visitor) ? `v:${visitor}` : `ip:${req.ip}|${req.get('user-agent') || ''}`
  return createHash('sha256').update(raw).digest('base64url').slice(0, 22)
}
function firstHitInWindow(key) {
  const now = Date.now()
  const seenAt = recentHits.get(key)
  if (seenAt && now - seenAt < DEDUPE_WINDOW_MS) return false
  if (recentHits.size >= DEDUPE_MAX_ENTRIES) {
    for (const [entry, time] of recentHits) if (now - time >= DEDUPE_WINDOW_MS) recentHits.delete(entry)
    if (recentHits.size >= DEDUPE_MAX_ENTRIES) recentHits.clear()
  }
  recentHits.set(key, now)
  return true
}
const publicArticle = { status: 'PUBLISHED' }
const articleSelect = {
  articleId: true, categoryId: true, title: true, content: true, steps: true,
  keywords: true, image: true, pdfFile: true, viewCount: true, featured: true,
  publishedAt: true, createdAt: true, updatedAt: true,
  category: { select: { categoryId: true, categoryName: true } },
}

router.get('/settings/contact', async (_req, res, next) => {
  try {
    const setting = await prisma.siteSetting.findUnique({ where: { key: CONTACT_SETTING_KEY }, select: { value: true } })
    res.json(normalizeContactSettings(setting?.value))
  } catch (error) { next(error) }
})

router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { categoryId: 'asc' },
      select: { categoryId: true, categoryName: true, description: true, _count: { select: { articles: { where: publicArticle } } } },
    })
    res.json(categories)
  } catch (error) { next(error) }
})

router.get('/articles', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 60)
    const where = { ...publicArticle }
    const categoryId = Number.parseInt(req.query.category, 10)
    if (req.query.category && Number.isInteger(categoryId) && categoryId > 0) where.categoryId = categoryId
    if (req.query.featured === 'true') where.featured = true
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
    if (query) {
      const terms = [...new Set(query.split(/\s+/).filter(Boolean))].slice(0, 8)
      where.OR = terms.flatMap((term) => [
        { title: { contains: term, mode: 'insensitive' } },
        { content: { contains: term, mode: 'insensitive' } },
        { keywords: { has: term } },
      ])
    }
    const orderBy = req.query.sort === 'popular' ? [{ viewCount: 'desc' }, { publishedAt: 'desc' }] : [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
    const articles = await prisma.article.findMany({ where, orderBy, take: limit, select: articleSelect })
    res.json(articles)
  } catch (error) { next(error) }
})

router.get('/articles/search', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
    const terms = [...new Set(query.split(/\s+/).filter(Boolean))].slice(0, 8)
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 100000)
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || 9, 1), 24)
    const categoryId = Number.parseInt(req.query.category, 10)
    const categoryFilter = req.query.category && Number.isInteger(categoryId) && categoryId > 0 ? { categoryId } : {}
    const where = { ...publicArticle, ...categoryFilter }
    if (terms.length) where.OR = terms.flatMap((term) => [
      { title: { contains: term, mode: 'insensitive' } },
      { content: { contains: term, mode: 'insensitive' } },
      { keywords: { has: term } },
    ])
    const categoryClause = Object.hasOwn(categoryFilter, 'categoryId') ? Prisma.sql`AND a.category_id = ${categoryId}` : Prisma.empty
    const termConditions = terms.map((term) => {
      const compact = term.replace(/-/g, '') || term
      return Prisma.sql`(
        position(lower(${term}) in lower(a.title)) > 0 OR
        position(lower(${term}) in lower(a.content)) > 0 OR
        EXISTS (SELECT 1 FROM unnest(a.keywords) AS k(value) WHERE lower(k.value) = lower(${term})) OR
        position(lower(${compact}) in replace(lower(a.title), '-', '')) > 0 OR
        position(lower(${compact}) in replace(lower(a.content), '-', '')) > 0 OR
        EXISTS (SELECT 1 FROM unnest(a.keywords) AS k(value) WHERE replace(lower(k.value), '-', '') = lower(${compact}))
      )`
    })
    const searchClause = terms.length ? Prisma.sql`AND (${Prisma.join(termConditions, ' OR ')})` : Prisma.empty
    let total
    if (terms.length) {
      const [countRow] = await prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM articles a
        WHERE a.status = 'PUBLISHED' ${categoryClause} ${searchClause}
      `)
      total = countRow.total
    } else {
      total = await prisma.article.count({ where })
    }
    if (query && page === 1) {
      const term = query.toLocaleLowerCase('th-TH').trim().slice(0, 120)
      if (firstHitInWindow(`search:${visitorFingerprint(req)}:${term}`)) {
        prisma.searchLog.create({ data: { term, resultCount: total } }).catch(() => {})
      }
    }
    const skip = (page - 1) * pageSize
    const orderBy = req.query.sort === 'popular' ? [{ viewCount: 'desc' }, { publishedAt: 'desc' }] : [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
    let items
    if (terms.length) {
      const compactQuery = query.replace(/-/g, '') || query
      const orderClause = req.query.sort === 'popular'
        ? Prisma.sql`a.view_count DESC, a.published_at DESC`
        : Prisma.sql`CASE
            WHEN lower(a.title) = lower(${query}) OR replace(lower(a.title), '-', '') = lower(${compactQuery}) THEN 0
            WHEN position(lower(${query}) in lower(a.title)) > 0 OR position(lower(${compactQuery}) in replace(lower(a.title), '-', '')) > 0 THEN 1
            WHEN EXISTS (SELECT 1 FROM unnest(a.keywords) AS k(value) WHERE lower(k.value) = lower(${query}) OR replace(lower(k.value), '-', '') = lower(${compactQuery})) THEN 2
            ELSE 3 END ASC, a.published_at DESC`
      const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT a.article_id AS "articleId", a.category_id AS "categoryId", a.title,
          a.content, a.steps, a.keywords, a.image, a.pdf_file AS "pdfFile",
          a.view_count AS "viewCount", a.featured, a.published_at AS "publishedAt",
          a.created_at AS "createdAt", a.updated_at AS "updatedAt",
          c.category_name AS "categoryName"
        FROM articles a JOIN categories c ON c.category_id = a.category_id
        WHERE a.status = 'PUBLISHED' ${categoryClause} ${searchClause}
        ORDER BY ${orderClause}
        LIMIT ${pageSize} OFFSET ${skip}
      `)
      items = rows.map(({ categoryName, ...article }) => ({ ...article, category: { categoryId: article.categoryId, categoryName } }))
    } else {
      items = await prisma.article.findMany({ where, orderBy, skip, take: pageSize, select: articleSelect })
    }
    res.json({ items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) })
  } catch (error) { next(error) }
})

router.get('/articles/:id', async (req, res, next) => {
  try {
    const articleId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(articleId) || articleId < 1) return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    const previewRequested = req.query.preview === '1' || req.get('x-admin-preview') === '1'
    let adminPreview = false
    if (previewRequested) {
      const authorization = req.get('authorization') || ''
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
      if (token) {
        try {
          const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
          const adminId = Number(claims?.sub)
          if (claims?.role === 'admin' && Number.isInteger(adminId) && adminId > 0) {
            adminPreview = Boolean(await prisma.admin.findUnique({ where: { adminId }, select: { adminId: true } }))
          }
        } catch { adminPreview = false }
      }
    }
    const found = await prisma.article.findFirst({ where: adminPreview ? { articleId } : { articleId, ...publicArticle }, select: { articleId: true } })
    if (!found) return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    const userAgent = req.get('user-agent') || ''
    const skipCount = /bot|crawl|spider|preview|headless/i.test(userAgent) || previewRequested
    if (!skipCount && firstHitInWindow(`view:${visitorFingerprint(req)}:${articleId}`)) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
      const dayString = `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`
      const day = new Date(`${dayString}T00:00:00.000Z`)
      // Keep the lifetime counter and the daily statistics consistent with each other.
      await prisma.$transaction([
        prisma.article.update({ where: { articleId }, data: { viewCount: { increment: 1 } }, select: { articleId: true } }),
        prisma.articleViewDaily.upsert({
          where: { articleId_day: { articleId, day } },
          create: { articleId, day, count: 1 },
          update: { count: { increment: 1 } },
        }),
      ])
    }
    const [result, feedback] = await Promise.all([
      prisma.article.findUnique({ where: { articleId }, select: articleSelect }),
      prisma.articleFeedback.groupBy({ by: ['helpful'], where: { articleId }, _count: { _all: true } }),
    ])
    const feedbackCount = feedback.reduce((sum, row) => sum + row._count._all, 0)
    const helpfulCount = feedback.find((row) => row.helpful)?._count._all || 0
    res.json({ ...result, feedbackCount, helpfulCount })
  } catch (error) { next(error) }
})

router.post('/articles/:id/feedback', feedbackLimiter, async (req, res, next) => {
  try {
    const articleId = Number.parseInt(req.params.id, 10)
    const { helpful, voterKey } = req.body || {}
    if (!Number.isInteger(articleId) || articleId < 1 || typeof helpful !== 'boolean' || typeof voterKey !== 'string' || voterKey.length < 16 || voterKey.length > 160) {
      return res.status(400).json({ message: 'ข้อมูลการประเมินไม่ถูกต้อง' })
    }
    const article = await prisma.article.findFirst({ where: { articleId, ...publicArticle }, select: { articleId: true } })
    if (!article) return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    const hashedKey = createHash('sha256').update(voterKey).digest('hex')
    await prisma.articleFeedback.create({ data: { articleId, voterKey: hashedKey, helpful } })
    const [count, helpfulCount] = await Promise.all([
      prisma.articleFeedback.count({ where: { articleId } }),
      prisma.articleFeedback.count({ where: { articleId, helpful: true } }),
    ])
    res.status(201).json({ message: 'บันทึกความคิดเห็นแล้ว', count, helpfulCount })
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'คุณได้ประเมินบทความนี้แล้ว' })
    next(error)
  }
})

export default router
