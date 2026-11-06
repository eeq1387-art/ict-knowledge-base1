import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { Router } from 'express'
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
    const termConditions = terms.map((term) => Prisma.sql`(
      position(lower(${term}) in lower(a.title)) > 0 OR
      position(lower(${term}) in lower(a.content)) > 0 OR
      EXISTS (SELECT 1 FROM unnest(a.keywords) AS k(value) WHERE lower(k.value) = lower(${term}))
    )`)
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
      prisma.searchLog.create({ data: { term, resultCount: total } }).catch(() => {})
    }
    const skip = (page - 1) * pageSize
    const orderBy = req.query.sort === 'popular' ? [{ viewCount: 'desc' }, { publishedAt: 'desc' }] : [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
    let items
    if (terms.length) {
      const orderClause = req.query.sort === 'popular'
        ? Prisma.sql`a.view_count DESC, a.published_at DESC`
        : Prisma.sql`CASE
            WHEN lower(a.title) = lower(${query}) THEN 0
            WHEN position(lower(${query}) in lower(a.title)) > 0 THEN 1
            WHEN EXISTS (SELECT 1 FROM unnest(a.keywords) AS k(value) WHERE lower(k.value) = lower(${query})) THEN 2
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
    const found = await prisma.article.findFirst({ where: { articleId, ...publicArticle }, select: { articleId: true } })
    if (!found) return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    const userAgent = req.get('user-agent') || ''
    const previewRequested = req.query.preview === '1' || req.get('x-admin-preview') === '1'
    const skipCount = /bot|crawl|spider|preview|headless/i.test(userAgent) || previewRequested
    if (!skipCount) {
      await prisma.article.update({ where: { articleId }, data: { viewCount: { increment: 1 } }, select: { articleId: true } })
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
      const dayString = `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`
      const day = new Date(`${dayString}T00:00:00.000Z`)
      await prisma.articleViewDaily.upsert({
        where: { articleId_day: { articleId, day } },
        create: { articleId, day, count: 1 },
        update: { count: { increment: 1 } },
      })
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
