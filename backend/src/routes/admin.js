import { randomUUID } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { CONTACT_FIELDS, CONTACT_SETTING_KEY } from '../contactSettings.js'

const router = Router()
router.use(requireAdmin)

function bangkokDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return new Date(`${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}T00:00:00.000Z`)
}

router.get('/insights', async (req, res, next) => {
  const days = Number(req.query.days || 30)
  if (![7, 30, 90].includes(days)) return res.status(400).json({ message: 'จำนวนวันต้องเป็น 7, 30 หรือ 90 วัน' })
  try {
    const endDay = bangkokDay(new Date())
    const startDay = new Date(endDay)
    startDay.setUTCDate(startDay.getUTCDate() - days + 1)
    const endExclusive = new Date(endDay)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const bangkokOffsetMs = 7 * 60 * 60 * 1000
    const searchStart = new Date(startDay.getTime() - bangkokOffsetMs)
    const searchEnd = new Date(endExclusive.getTime() - bangkokOffsetMs)
    const [zeroRows, termRows, dailyRows] = await Promise.all([
      prisma.searchLog.groupBy({ by: ['term'], where: { createdAt: { gte: searchStart, lt: searchEnd }, resultCount: 0 }, _count: { _all: true }, _max: { createdAt: true }, orderBy: [{ _count: { term: 'desc' } }, { _max: { createdAt: 'desc' } }], take: 10 }),
      prisma.searchLog.groupBy({ by: ['term'], where: { createdAt: { gte: searchStart, lt: searchEnd } }, _count: { _all: true }, _avg: { resultCount: true }, orderBy: [{ _count: { term: 'desc' } }, { term: 'asc' }], take: 10 }),
      prisma.articleViewDaily.findMany({ where: { day: { gte: startDay, lt: endExclusive } }, select: { day: true, count: true } }),
    ])
    const viewsByDate = new Map()
    for (const row of dailyRows) {
      const key = row.day.toISOString().slice(0, 10)
      viewsByDate.set(key, (viewsByDate.get(key) || 0) + row.count)
    }
    const viewsByDay = Array.from({ length: days }, (_, index) => {
      const date = new Date(startDay)
      date.setUTCDate(date.getUTCDate() + index)
      const day = date.toISOString().slice(0, 10)
      return { day, views: viewsByDate.get(day) || 0 }
    })
    const articleTotals = await prisma.articleViewDaily.groupBy({ by: ['articleId'], where: { day: { gte: startDay, lt: endExclusive } }, _sum: { count: true }, orderBy: { _sum: { count: 'desc' } }, take: 5 })
    const articles = articleTotals.length ? await prisma.article.findMany({ where: { articleId: { in: articleTotals.map((row) => row.articleId) } }, select: { articleId: true, title: true } }) : []
    const articleMap = new Map(articles.map((article) => [article.articleId, article]))
    const topArticlesInRange = articleTotals.map((row) => ({ ...articleMap.get(row.articleId), views: row._sum.count || 0 })).filter((article) => article.articleId)
    res.json({
      zeroResultTerms: zeroRows.map((row) => ({ term: row.term, count: row._count._all, lastSearched: row._max.createdAt })),
      topTerms: termRows.map((row) => ({ term: row.term, count: row._count._all, avgResults: Number((row._avg.resultCount || 0).toFixed(1)) })),
      viewsByDay,
      topArticlesInRange,
    })
  } catch (error) { next(error) }
})

const routeDir = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.resolve(routeDir, '../../uploads')
await mkdir(uploadDir, { recursive: true })
const IMAGE_TYPES = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']])
const PDF_TYPES = new Map([['.pdf', 'application/pdf']])
const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, uploadDir),
  filename: (_req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
})
const upload = multer({
  storage,
  limits: { files: 2, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const expected = file.fieldname === 'image' ? IMAGE_TYPES.get(ext) : file.fieldname === 'pdfFile' ? PDF_TYPES.get(ext) : null
    if (!expected || expected !== file.mimetype) return done(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname))
    done(null, true)
  },
})

function uploadFiles(req, res, next) {
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdfFile', maxCount: 1 }])(req, res, async (error) => {
    if (error) {
      await removeNewFiles(req.files)
      if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'ไฟล์ไม่ถูกชนิดหรือมีขนาดใหญ่เกินกำหนด (รูปไม่เกิน 5 MB, PDF ไม่เกิน 15 MB)' })
      return next(error)
    }
    try {
      const files = Object.values(req.files || {}).flat()
      for (const file of files) {
        if (file.fieldname === 'image' && file.size > 5 * 1024 * 1024) throw Object.assign(new Error('IMAGE_TOO_LARGE'), { status: 413 })
        const bytes = await readMagicBytes(file.path)
        if (!validSignature(file, bytes)) throw Object.assign(new Error('INVALID_FILE_SIGNATURE'), { status: 400 })
      }
      next()
    } catch (validationError) {
      await removeNewFiles(req.files)
      res.status(validationError.status || 400).json({ message: validationError.status === 413 ? 'รูปภาพต้องมีขนาดไม่เกิน 5 MB' : 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่อนุญาต' })
    }
  })
}

async function readMagicBytes(filePath) {
  const handle = await open(filePath, 'r')
  try {
    const bytes = Buffer.alloc(12)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    return bytes.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function validSignature(file, bytes) {
  if (file.fieldname === 'pdfFile') return bytes.subarray(0, 5).toString('ascii') === '%PDF-'
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (file.mimetype === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

async function removeNewFiles(fileGroups = {}) {
  await Promise.all(Object.values(fileGroups || {}).flat().map((file) => unlink(file.path).catch(() => {})))
}

function storedUpload(filename) { return filename ? `/uploads/${filename}` : null }
function uploadFilename(value) {
  const name = path.basename(value || '')
  return /^[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(name) ? name : null
}
async function removeStoredUpload(value) {
  const filename = uploadFilename(value)
  if (filename) await unlink(path.join(uploadDir, filename)).catch(() => {})
}
function optionalUpload(req, field) { return req.files?.[field]?.[0] ? storedUpload(req.files[field][0].filename) : null }

router.put('/settings/contact', async (req, res, next) => {
  const input = req.body
  if (!input || typeof input !== 'object' || Array.isArray(input) || CONTACT_FIELDS.some((field) => typeof input[field] !== 'string' || input[field].length > 300)) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลติดต่อทุกช่องเป็นข้อความไม่เกิน 300 ตัวอักษร' })
  }
  const contact = Object.fromEntries(CONTACT_FIELDS.map((field) => [field, input[field].trim()]))
  const validEmail = /^[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i
  if (contact.email && !validEmail.test(contact.email)) return res.status(400).json({ message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  if (contact.lineUrl) {
    try {
      const url = new URL(contact.lineUrl)
      if (!contact.lineUrl.toLowerCase().startsWith('https://') || url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('INVALID_HTTPS_URL')
    } catch { return res.status(400).json({ message: 'ลิงก์ LINE ต้องเป็น URL ที่ขึ้นต้นด้วย https://' }) }
  }
  try {
    await prisma.siteSetting.upsert({
      where: { key: CONTACT_SETTING_KEY },
      create: { key: CONTACT_SETTING_KEY, value: contact },
      update: { value: contact },
    })
    res.json({ message: 'บันทึกข้อมูลติดต่อเรียบร้อยแล้ว' })
  } catch (error) { next(error) }
})

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [articleCount, categoryCount, publishedCount, draftCount, hiddenCount, views, topArticles, feedbackRows, recentArticles, pendingDrafts, categories, categoryViews, negativeRows] = await Promise.all([
      prisma.article.count(),
      prisma.category.count(),
      prisma.article.count({ where: { status: 'PUBLISHED' } }),
      prisma.article.count({ where: { status: 'DRAFT' } }),
      prisma.article.count({ where: { status: 'HIDDEN' } }),
      prisma.article.aggregate({ _sum: { viewCount: true } }),
      prisma.article.findMany({
        where: { status: 'PUBLISHED' }, orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }], take: 5,
        select: { articleId: true, title: true, viewCount: true, category: { select: { categoryName: true } } },
      }),
      prisma.articleFeedback.groupBy({ by: ['articleId', 'helpful'], _count: { _all: true } }),
      prisma.article.findMany({ orderBy: { updatedAt: 'desc' }, take: 5, select: { articleId: true, title: true, status: true, updatedAt: true } }),
      prisma.article.findMany({ where: { status: 'DRAFT' }, orderBy: { updatedAt: 'desc' }, take: 5, select: { articleId: true, title: true, updatedAt: true, category: { select: { categoryName: true } } } }),
      prisma.category.findMany({ orderBy: { categoryName: 'asc' }, select: { categoryId: true, categoryName: true, _count: { select: { articles: true } } } }),
      prisma.article.groupBy({ by: ['categoryId'], _sum: { viewCount: true } }),
      prisma.articleFeedback.groupBy({ by: ['articleId'], where: { helpful: false }, _count: { _all: true }, orderBy: { _count: { articleId: 'desc' } }, take: 5 }),
    ])
    const feedbackByArticle = new Map()
    let feedbackCount = 0
    let helpfulCount = 0
    for (const row of feedbackRows) {
      const count = row._count._all
      feedbackCount += count
      if (row.helpful) helpfulCount += count
      const stats = feedbackByArticle.get(row.articleId) || { feedbackCount: 0, helpfulCount: 0 }
      stats.feedbackCount += count
      if (row.helpful) stats.helpfulCount += count
      feedbackByArticle.set(row.articleId, stats)
    }
    const [negativeArticles] = negativeRows.length ? await Promise.all([
      prisma.article.findMany({ where: { articleId: { in: negativeRows.map((row) => row.articleId) } }, select: { articleId: true, title: true, viewCount: true, category: { select: { categoryName: true } } } }),
    ]) : [[]]
    const negativeArticleById = new Map(negativeArticles.map((article) => [article.articleId, article]))
    const negativeFeedback = negativeRows.flatMap((row) => {
      const article = negativeArticleById.get(row.articleId)
      return article ? [{ ...article, notHelpfulCount: row._count._all, ...(feedbackByArticle.get(row.articleId) || { helpfulCount: 0, feedbackCount: 0 }) }] : []
    })
    const categoryViewMap = new Map(categoryViews.map((row) => [row.categoryId, row._sum.viewCount || 0]))
    const categoriesWithViews = categories.map((category) => ({ ...category, totalViews: categoryViewMap.get(category.categoryId) || 0 }))
    const topArticlesWithFeedback = topArticles.map((article) => {
      const stats = feedbackByArticle.get(article.articleId) || { feedbackCount: 0, helpfulCount: 0 }
      return { ...article, ...stats, helpfulPercent: stats.feedbackCount ? Math.round(stats.helpfulCount * 100 / stats.feedbackCount) : 0 }
    })
    res.json({ articleCount, categoryCount, publishedCount, draftCount, hiddenCount, totalViews: views._sum.viewCount || 0, feedbackCount, helpfulCount, helpfulPercent: feedbackCount ? Math.round(helpfulCount * 100 / feedbackCount) : 0, topArticles: topArticlesWithFeedback, recentArticles, pendingDrafts, categories: categoriesWithViews, negativeFeedback })
  } catch (error) { next(error) }
})

router.get('/reports/articles.csv', async (_req, res, next) => {
  try {
    const [articles, feedbackRows] = await Promise.all([
      prisma.article.findMany({ orderBy: { updatedAt: 'desc' }, select: { articleId: true, title: true, status: true, viewCount: true, updatedAt: true, image: true, pdfFile: true, category: { select: { categoryName: true } } } }),
      prisma.articleFeedback.groupBy({ by: ['articleId', 'helpful'], _count: { _all: true } }),
    ])
    const feedback = new Map()
    for (const row of feedbackRows) {
      const value = feedback.get(row.articleId) || { helpful: 0, total: 0 }
      value.total += row._count._all
      if (row.helpful) value.helpful += row._count._all
      feedback.set(row.articleId, value)
    }
    const quote = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const rows = [['รหัสบทความ', 'ชื่อบทความ', 'หมวดหมู่', 'สถานะ', 'ยอดเข้าชม', 'โหวตมีประโยชน์', 'โหวตทั้งหมด', 'ความพึงพอใจ (%)', 'มีรูปภาพ', 'มีไฟล์ PDF', 'อัปเดตล่าสุด']]
    for (const article of articles) {
      const votes = feedback.get(article.articleId) || { helpful: 0, total: 0 }
      rows.push([article.articleId, article.title, article.category.categoryName, article.status, article.viewCount, votes.helpful, votes.total, votes.total ? Math.round(votes.helpful * 100 / votes.total) : 0, article.image ? 'มี' : 'ไม่มี', article.pdfFile ? 'มี' : 'ไม่มี', article.updatedAt.toISOString()])
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ict-knowledge-articles.csv"' })
    res.send(`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`)
  } catch (error) { next(error) }
})

router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { categoryName: 'asc' }, include: { _count: { select: { articles: true } } } })
    res.json(categories)
  } catch (error) { next(error) }
})

router.post('/categories', async (req, res, next) => {
  const categoryName = typeof req.body?.categoryName === 'string' ? req.body.categoryName.trim() : ''
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  if (!categoryName || categoryName.length > 160 || description.length > 2000) return res.status(400).json({ message: 'กรุณาระบุชื่อหมวดหมู่ไม่เกิน 160 ตัวอักษร และคำอธิบายไม่เกิน 2,000 ตัวอักษร' })
  try {
    const category = await prisma.category.create({ data: { categoryName, description: description || null } })
    res.status(201).json(category)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'มีชื่อหมวดหมู่นี้แล้ว' })
    next(error)
  }
})

router.patch('/categories/:id', async (req, res, next) => {
  const categoryId = Number.parseInt(req.params.id, 10)
  const categoryName = typeof req.body?.categoryName === 'string' ? req.body.categoryName.trim() : ''
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'รหัสหมวดหมู่ไม่ถูกต้อง' })
  if (!categoryName || categoryName.length > 160 || description.length > 2000) return res.status(400).json({ message: 'กรุณาระบุชื่อหมวดหมู่ไม่เกิน 160 ตัวอักษร และคำอธิบายไม่เกิน 2,000 ตัวอักษร' })
  try {
    const category = await prisma.category.update({ where: { categoryId }, data: { categoryName, description: description || null } })
    res.json(category)
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'มีชื่อหมวดหมู่นี้แล้ว' })
    if (error.code === 'P2025') return res.status(404).json({ message: 'ไม่พบหมวดหมู่นี้' })
    next(error)
  }
})

router.delete('/categories/:id', async (req, res, next) => {
  const categoryId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(categoryId) || categoryId < 1) return res.status(400).json({ message: 'รหัสหมวดหมู่ไม่ถูกต้อง' })
  try {
    const category = await prisma.category.findUnique({ where: { categoryId }, select: { categoryId: true } })
    if (!category) return res.status(404).json({ message: 'ไม่พบหมวดหมู่นี้' })
    const articleCount = await prisma.article.count({ where: { categoryId } })
    if (articleCount > 0) return res.status(409).json({ message: 'ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากยังมีบทความใช้งานอยู่ กรุณาย้ายหรือลบบทความก่อน' })
    await prisma.category.delete({ where: { categoryId } })
    res.json({ message: 'ลบหมวดหมู่แล้ว' })
  } catch (error) {
    if (error.code === 'P2003') return res.status(409).json({ message: 'ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากยังมีบทความใช้งานอยู่ กรุณาย้ายหรือลบบทความก่อน' })
    next(error)
  }
})

router.get('/articles', async (req, res, next) => {
  try {
    const where = {}
    if (['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(req.query.status)) where.status = req.query.status
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
    const categoryId = Number.parseInt(req.query.category, 10)
    if (req.query.category && Number.isInteger(categoryId) && categoryId > 0) where.categoryId = categoryId
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
      { keywords: { has: search } },
    ]
    const articles = await prisma.article.findMany({ where, orderBy: { updatedAt: 'desc' }, include: { category: { select: { categoryId: true, categoryName: true } } }, take: 100 })
    const feedback = articles.length ? await prisma.articleFeedback.groupBy({ by: ['articleId', 'helpful'], where: { articleId: { in: articles.map((article) => article.articleId) } }, _count: { _all: true } }) : []
    const stats = new Map()
    for (const row of feedback) {
      const item = stats.get(row.articleId) || { feedbackCount: 0, helpfulCount: 0 }
      item.feedbackCount += row._count._all
      if (row.helpful) item.helpfulCount += row._count._all
      stats.set(row.articleId, item)
    }
    res.json(articles.map((article) => {
      const item = stats.get(article.articleId) || { feedbackCount: 0, helpfulCount: 0 }
      return { ...article, ...item, helpfulPercent: item.feedbackCount ? Math.round(item.helpfulCount * 100 / item.feedbackCount) : 0 }
    }))
  } catch (error) { next(error) }
})

router.get('/articles/:id', async (req, res, next) => {
  const articleId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(articleId) || articleId < 1) return res.status(400).json({ message: 'รหัสบทความไม่ถูกต้อง' })
  try {
    const article = await prisma.article.findUnique({ where: { articleId }, include: { category: { select: { categoryId: true, categoryName: true } } } })
    if (!article) return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    res.json(article)
  } catch (error) { next(error) }
})

function parseArticleInput(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const categoryId = Number.parseInt(body.categoryId, 10)
  const status = ['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(body.status) ? body.status : 'DRAFT'
  const keywords = typeof body.keywords === 'string' ? [...new Set(body.keywords.split(',').map((word) => word.trim()).filter(Boolean))].slice(0, 20) : []
  const steps = typeof body.steps === 'string' ? body.steps.split(/\r?\n/).map((step) => step.trim()).filter(Boolean).slice(0, 100) : []
  if (!title || title.length > 240 || !content || content.length > 100000 || !Number.isInteger(categoryId) || categoryId < 1 || keywords.some((word) => word.length > 80)) return { error: 'กรุณาตรวจชื่อบทความ (ไม่เกิน 240 ตัวอักษร), เนื้อหา, หมวดหมู่ และคำค้น' }
  return { data: { title, content, categoryId, status, keywords, steps, featured: body.featured === 'true' || body.featured === true } }
}

router.post('/articles', uploadFiles, async (req, res, next) => {
  const parsed = parseArticleInput(req.body || {})
  if (parsed.error) { await removeNewFiles(req.files); return res.status(400).json({ message: parsed.error }) }
  try {
    const category = await prisma.category.findUnique({ where: { categoryId: parsed.data.categoryId }, select: { categoryId: true } })
    if (!category) { await removeNewFiles(req.files); return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' }) }
    const article = await prisma.article.create({ data: {
      ...parsed.data, image: optionalUpload(req, 'image'), pdfFile: optionalUpload(req, 'pdfFile'),
      publishedAt: parsed.data.status === 'PUBLISHED' ? new Date() : null,
    }, include: { category: { select: { categoryId: true, categoryName: true } } } })
    res.status(201).json(article)
  } catch (error) { await removeNewFiles(req.files); next(error) }
})

router.patch('/articles/:id', uploadFiles, async (req, res, next) => {
  const articleId = Number.parseInt(req.params.id, 10)
  const parsed = parseArticleInput(req.body || {})
  if (!Number.isInteger(articleId) || articleId < 1) { await removeNewFiles(req.files); return res.status(400).json({ message: 'รหัสบทความไม่ถูกต้อง' }) }
  if (parsed.error) { await removeNewFiles(req.files); return res.status(400).json({ message: parsed.error }) }
  try {
    const existing = await prisma.article.findUnique({ where: { articleId }, select: { image: true, pdfFile: true, publishedAt: true } })
    if (!existing) { await removeNewFiles(req.files); return res.status(404).json({ message: 'ไม่พบบทความนี้' }) }
    const category = await prisma.category.findUnique({ where: { categoryId: parsed.data.categoryId }, select: { categoryId: true } })
    if (!category) { await removeNewFiles(req.files); return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' }) }
    const image = optionalUpload(req, 'image') || (req.body.removeImage === 'true' ? null : existing.image)
    const pdfFile = optionalUpload(req, 'pdfFile') || (req.body.removePdf === 'true' ? null : existing.pdfFile)
    const article = await prisma.article.update({ where: { articleId }, data: {
      ...parsed.data, image, pdfFile,
      publishedAt: parsed.data.status === 'PUBLISHED' ? existing.publishedAt || new Date() : existing.publishedAt,
    }, include: { category: { select: { categoryId: true, categoryName: true } } } })
    if (image !== existing.image) await removeStoredUpload(existing.image)
    if (pdfFile !== existing.pdfFile) await removeStoredUpload(existing.pdfFile)
    res.json(article)
  } catch (error) { await removeNewFiles(req.files); next(error) }
})

router.patch('/articles/:id/status', async (req, res, next) => {
  const articleId = Number.parseInt(req.params.id, 10)
  const status = req.body?.status
  if (!Number.isInteger(articleId) || articleId < 1 || !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(status)) return res.status(400).json({ message: 'ข้อมูลสถานะไม่ถูกต้อง' })
  try {
    const current = await prisma.article.findUnique({ where: { articleId }, select: { publishedAt: true } })
    if (!current) return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    const article = await prisma.article.update({ where: { articleId }, data: { status, publishedAt: status === 'PUBLISHED' ? current.publishedAt || new Date() : current.publishedAt } })
    res.json(article)
  } catch (error) { next(error) }
})

router.delete('/articles/:id', async (req, res, next) => {
  const articleId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(articleId) || articleId < 1) return res.status(400).json({ message: 'รหัสบทความไม่ถูกต้อง' })
  try {
    const article = await prisma.article.delete({ where: { articleId }, select: { image: true, pdfFile: true } })
    await Promise.all([removeStoredUpload(article.image), removeStoredUpload(article.pdfFile)])
    res.json({ message: 'ลบบทความแล้ว' })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'ไม่พบบทความนี้' })
    next(error)
  }
})

export function uploadErrorHandler(error, _req, res, next) {
  if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'ไฟล์ไม่ถูกชนิดหรือมีขนาดใหญ่เกินกำหนด' })
  next(error)
}

export default router
