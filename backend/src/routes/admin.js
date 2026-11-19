import { randomUUID } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { CONTACT_FIELDS, CONTACT_SETTING_KEY } from '../contactSettings.js'
import { addToSearchBlocklist, searchTermBlocker } from '../searchFilter.js'

const router = Router()
router.use(requireAdmin)

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function bangkokDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return new Date(`${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}T00:00:00.000Z`)
}

function currentBangkokMonth() {
  return bangkokDay(new Date()).toISOString().slice(0, 7)
}

function formatMonthLabel(ym) {
  const [yearStr, monthStr] = String(ym || '').split('-')
  const year = Number(yearStr)
  const monthIdx = Number(monthStr) - 1
  if (!Number.isInteger(year) || monthIdx < 0 || monthIdx > 11) return ym
  return `${THAI_MONTHS[monthIdx]} ${year}`
}

async function buildMonthlyReport(rawMonth) {
  const defaultMonth = currentBangkokMonth()
  const month = typeof rawMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth.trim())
    ? rawMonth.trim()
    : defaultMonth
  const [yearNum, monthNum] = month.split('-').map(Number)
  const startDay = new Date(Date.UTC(yearNum, monthNum - 1, 1))
  const endExclusive = new Date(Date.UTC(yearNum, monthNum, 1))
  const bangkokOffsetMs = 7 * 60 * 60 * 1000
  const tsStart = new Date(startDay.getTime() - bangkokOffsetMs)
  const tsEnd = new Date(endExclusive.getTime() - bangkokOffsetMs)

  const [
    dailyRows,
    articleDailyTotals,
    articlesInRange,
    allArticleDates,
    earliestDailyView,
    searchesInMonth,
    feedbackInMonthRows,
  ] = await Promise.all([
    prisma.articleViewDaily.findMany({
      where: { day: { gte: startDay, lt: endExclusive } },
      select: { day: true, count: true },
    }),
    prisma.articleViewDaily.groupBy({
      by: ['articleId'],
      where: { day: { gte: startDay, lt: endExclusive } },
      _sum: { count: true },
      orderBy: { _sum: { count: 'desc' } },
    }),
    prisma.article.findMany({
      where: {
        OR: [
          { publishedAt: { gte: tsStart, lt: tsEnd } },
          { createdAt: { gte: tsStart, lt: tsEnd } },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        articleId: true,
        title: true,
        status: true,
        viewCount: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        image: true,
        images: true,
        pdfFile: true,
        category: { select: { categoryId: true, categoryName: true } },
      },
    }),
    prisma.article.findMany({
      select: { publishedAt: true, createdAt: true },
    }),
    prisma.articleViewDaily.findFirst({
      orderBy: { day: 'asc' },
      select: { day: true },
    }),
    prisma.searchLog.count({
      where: { createdAt: { gte: tsStart, lt: tsEnd } },
    }),
    prisma.articleFeedback.groupBy({
      by: ['helpful'],
      where: { createdAt: { gte: tsStart, lt: tsEnd } },
      _count: { _all: true },
    }),
  ])

  const totalMonthViews = dailyRows.reduce((sum, row) => sum + (row.count || 0), 0)
  const monthViewsByArticle = new Map(articleDailyTotals.map((row) => [row.articleId, row._sum.count || 0]))

  const involvedIds = [...new Set([
    ...articlesInRange.map((a) => a.articleId),
    ...articleDailyTotals.slice(0, 10).map((r) => r.articleId),
  ])]
  const [feedbackRows, topViewedArticles] = involvedIds.length
    ? await Promise.all([
      prisma.articleFeedback.groupBy({
        by: ['articleId', 'helpful'],
        where: { articleId: { in: involvedIds } },
        _count: { _all: true },
      }),
      prisma.article.findMany({
        where: { articleId: { in: articleDailyTotals.slice(0, 10).map((r) => r.articleId) } },
        select: {
          articleId: true,
          title: true,
          status: true,
          viewCount: true,
          publishedAt: true,
          createdAt: true,
          category: { select: { categoryId: true, categoryName: true } },
        },
      }),
    ])
    : [[], []]

  const feedbackByArticle = new Map()
  for (const row of feedbackRows) {
    const item = feedbackByArticle.get(row.articleId) || { feedbackCount: 0, helpfulCount: 0 }
    item.feedbackCount += row._count._all
    if (row.helpful) item.helpfulCount += row._count._all
    feedbackByArticle.set(row.articleId, item)
  }

  const publishedInMonthCount = articlesInRange.filter((article) => {
    if (article.status !== 'PUBLISHED') return false
    const refDate = article.publishedAt || article.createdAt
    return refDate && refDate >= tsStart && refDate < tsEnd
  }).length
  const createdInMonthCount = articlesInRange.filter((article) => article.createdAt >= tsStart && article.createdAt < tsEnd).length

  const articlesInMonth = articlesInRange.map((article) => {
    const fb = feedbackByArticle.get(article.articleId) || { feedbackCount: 0, helpfulCount: 0 }
    const imgs = Array.isArray(article.images) && article.images.length ? article.images : (article.image ? [article.image] : [])
    const publishedInThisMonth = article.status === 'PUBLISHED' && (article.publishedAt || article.createdAt) >= tsStart && (article.publishedAt || article.createdAt) < tsEnd
    return {
      articleId: article.articleId,
      title: article.title,
      status: article.status,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      viewCount: article.viewCount,
      monthViews: monthViewsByArticle.get(article.articleId) || 0,
      feedbackCount: fb.feedbackCount,
      helpfulCount: fb.helpfulCount,
      helpfulPercent: fb.feedbackCount ? Math.round((fb.helpfulCount * 100) / fb.feedbackCount) : 0,
      imagesCount: imgs.length,
      hasPdf: Boolean(article.pdfFile),
      publishedInThisMonth,
      category: article.category,
    }
  })

  const topArticleMap = new Map(topViewedArticles.map((a) => [a.articleId, a]))
  const topViewedInMonth = articleDailyTotals
    .slice(0, 10)
    .map((row) => {
      const info = topArticleMap.get(row.articleId)
      if (!info) return null
      return {
        ...info,
        monthViews: row._sum.count || 0,
      }
    })
    .filter(Boolean)

  let monthFeedbackTotal = 0
  let monthFeedbackHelpful = 0
  for (const row of feedbackInMonthRows) {
    monthFeedbackTotal += row._count._all
    if (row.helpful) monthFeedbackHelpful += row._count._all
  }

  // Build available months list (last 12 months + any months with data in DB)
  const monthSet = new Set([month, defaultMonth])
  const nowDay = bangkokDay(new Date())
  for (let offset = 0; offset < 12; offset += 1) {
    const d = new Date(Date.UTC(nowDay.getUTCFullYear(), nowDay.getUTCMonth() - offset, 1))
    monthSet.add(d.toISOString().slice(0, 7))
  }
  for (const item of allArticleDates) {
    if (item.publishedAt) monthSet.add(bangkokDay(item.publishedAt).toISOString().slice(0, 7))
    if (item.createdAt) monthSet.add(bangkokDay(item.createdAt).toISOString().slice(0, 7))
  }
  if (earliestDailyView?.day) {
    monthSet.add(earliestDailyView.day.toISOString().slice(0, 7))
  }
  const availableMonths = [...monthSet]
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: formatMonthLabel(value) }))

  return {
    month,
    monthLabel: formatMonthLabel(month),
    availableMonths,
    publishedInMonthCount,
    createdInMonthCount,
    totalArticlesInMonth: articlesInMonth.length,
    totalMonthViews,
    totalSearchesInMonth: searchesInMonth,
    feedbackInMonth: {
      total: monthFeedbackTotal,
      helpful: monthFeedbackHelpful,
      helpfulPercent: monthFeedbackTotal ? Math.round((monthFeedbackHelpful * 100) / monthFeedbackTotal) : 0,
    },
    articlesInMonth,
    topViewedInMonth,
  }
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
    const [isBlocked, zeroRows, termRows, dailyRows] = await Promise.all([
      searchTermBlocker(),
      prisma.searchLog.groupBy({ by: ['term'], where: { createdAt: { gte: searchStart, lt: searchEnd }, resultCount: 0 }, _count: { _all: true }, _max: { createdAt: true }, orderBy: [{ _count: { term: 'desc' } }, { _max: { createdAt: 'desc' } }], take: 30 }),
      prisma.searchLog.groupBy({ by: ['term'], where: { createdAt: { gte: searchStart, lt: searchEnd } }, _count: { _all: true }, _avg: { resultCount: true }, orderBy: [{ _count: { term: 'desc' } }, { term: 'asc' }], take: 30 }),
      prisma.articleViewDaily.findMany({ where: { day: { gte: startDay, lt: endExclusive } }, select: { day: true, count: true } }),
    ])
    const cleanZeroRows = zeroRows.filter((row) => !isBlocked(row.term)).slice(0, 10)
    const cleanTermRows = termRows.filter((row) => !isBlocked(row.term)).slice(0, 10)
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
      zeroResultTerms: cleanZeroRows.map((row) => ({ term: row.term, count: row._count._all, lastSearched: row._max.createdAt })),
      topTerms: cleanTermRows.map((row) => ({ term: row.term, count: row._count._all, avgResults: Number((row._avg.resultCount || 0).toFixed(1)) })),
      viewsByDay,
      topArticlesInRange,
    })
  } catch (error) { next(error) }
})

router.delete('/search-logs', async (req, res, next) => {
  const rawTerm = typeof (req.body?.term ?? req.query?.term) === 'string'
    ? (req.body?.term ?? req.query?.term).trim()
    : ''
  if (!rawTerm || rawTerm.length > 120) {
    return res.status(400).json({ message: 'กรุณาระบุคำค้นหาที่ต้องการลบ' })
  }
  const shouldBlock = req.body?.block !== false && req.query?.block !== '0'
  try {
    const deleted = await prisma.searchLog.deleteMany({
      where: { term: { equals: rawTerm, mode: 'insensitive' } },
    })
    if (shouldBlock) {
      await addToSearchBlocklist(rawTerm)
    }
    res.json({
      message: `ลบคำค้นหา “${rawTerm}” เรียบร้อยแล้ว`,
      deletedCount: deleted.count,
      blocked: shouldBlock,
    })
  } catch (error) { next(error) }
})

router.get('/reports/monthly', async (req, res, next) => {
  if (req.query.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month).trim())) {
    return res.status(400).json({ message: 'รูปแบบเดือนไม่ถูกต้อง (ใช้ YYYY-MM เช่น 2026-11)' })
  }
  try {
    const report = await buildMonthlyReport(req.query.month)
    res.json(report)
  } catch (error) { next(error) }
})

router.get('/reports/monthly.csv', async (req, res, next) => {
  if (req.query.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month).trim())) {
    return res.status(400).json({ message: 'รูปแบบเดือนไม่ถูกต้อง (ใช้ YYYY-MM เช่น 2026-11)' })
  }
  try {
    const report = await buildMonthlyReport(req.query.month)
    const statusText = { PUBLISHED: 'เผยแพร่แล้ว', DRAFT: 'ฉบับร่าง', HIDDEN: 'ซ่อนอยู่' }
    const quote = (value) => {
      const text = String(value ?? '')
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const formatDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '—')
    const rows = [
      ['รายงานสรุปผลงานคลังความรู้ ICT ประจำเดือน', report.monthLabel],
      ['หน่วยงาน', 'ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น (KKICT)'],
      [],
      ['หัวข้อสรุปประจำเดือน', 'จำนวน'],
      ['จำนวนบทความที่เผยแพร่ในเดือนนี้ (บทความ)', report.publishedInMonthCount],
      ['จำนวนบทความที่สร้างในเดือนนี้ทั้งหมด (บทความ)', report.createdInMonthCount],
      ['ยอดเข้าชมบทความรวมเฉพาะในเดือนนี้ (ครั้ง)', report.totalMonthViews],
      ['จำนวนการค้นหาคู่มือในเดือนนี้ (ครั้ง)', report.totalSearchesInMonth],
      ['ผลประเมินความพึงพอใจในเดือนนี้ (%)', `${report.feedbackInMonth.helpfulPercent}% (${report.feedbackInMonth.helpful}/${report.feedbackInMonth.total})`],
      [],
      ['รายชื่อบทความที่สร้างหรือเผยแพร่ในเดือนนี้'],
      ['รหัสบทความ', 'ชื่อบทความ', 'หมวดหมู่', 'สถานะ', 'วันที่เผยแพร่', 'วันที่สร้าง', 'ยอดเข้าชมในเดือนนี้ (ครั้ง)', 'ยอดเข้าชมสะสม (ครั้ง)', 'ความพึงพอใจ (%)', 'จำนวนรูปภาพ', 'มีไฟล์ PDF'],
    ]

    if (report.articlesInMonth.length === 0) {
      rows.push(['—', 'ไม่มีบทความที่สร้างหรือเผยแพร่ในเดือนนี้', '—', '—', '—', '—', 0, 0, '—', 0, '—'])
    } else {
      for (const article of report.articlesInMonth) {
        rows.push([
          article.articleId,
          article.title,
          article.category?.categoryName || '—',
          statusText[article.status] || article.status,
          formatDate(article.publishedAt),
          formatDate(article.createdAt),
          article.monthViews,
          article.viewCount,
          article.feedbackCount ? `${article.helpfulPercent}% (${article.helpfulCount}/${article.feedbackCount})` : 'ยังไม่มีผลประเมิน',
          article.imagesCount,
          article.hasPdf ? 'มี' : 'ไม่มี',
        ])
      }
    }

    rows.push(
      [],
      ['อันดับบทความที่มียอดเข้าชมสูงสุดเฉพาะในเดือนนี้'],
      ['อันดับ', 'รหัสบทความ', 'ชื่อบทความ', 'หมวดหมู่', 'ยอดเข้าชมในเดือนนี้ (ครั้ง)', 'ยอดเข้าชมสะสม (ครั้ง)'],
    )
    if (report.topViewedInMonth.length === 0) {
      rows.push(['—', '—', 'ยังไม่มีข้อมูลการเข้าชมรายวันในเดือนนี้', '—', 0, 0])
    } else {
      report.topViewedInMonth.forEach((article, idx) => {
        rows.push([
          idx + 1,
          article.articleId,
          article.title,
          article.category?.categoryName || '—',
          article.monthViews,
          article.viewCount,
        ])
      })
    }

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ict-monthly-report-${report.month}.csv"`,
    })
    res.send(`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`)
  } catch (error) { next(error) }
})

const routeDir = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.resolve(routeDir, '../../uploads')
await mkdir(uploadDir, { recursive: true })
const IMAGE_TYPES = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']])
const PDF_TYPES = new Map([['.pdf', 'application/pdf']])
const MAX_IMAGES_PER_ARTICLE = 5
const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, uploadDir),
  filename: (_req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
})
const upload = multer({
  storage,
  limits: { files: MAX_IMAGES_PER_ARTICLE + 1, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const isImageField = file.fieldname === 'image' || file.fieldname === 'images'
    const expected = isImageField ? IMAGE_TYPES.get(ext) : file.fieldname === 'pdfFile' ? PDF_TYPES.get(ext) : null
    if (!expected || expected !== file.mimetype) return done(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname))
    done(null, true)
  },
})

function uploadFiles(req, res, next) {
  upload.fields([
    { name: 'image', maxCount: MAX_IMAGES_PER_ARTICLE },
    { name: 'images', maxCount: MAX_IMAGES_PER_ARTICLE },
    { name: 'pdfFile', maxCount: 1 },
  ])(req, res, async (error) => {
    if (error) {
      await removeNewFiles(req.files)
      if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'ไฟล์ไม่ถูกชนิดหรือมีขนาดใหญ่เกินกำหนด (รูปไม่เกิน 5 รูป รูปละไม่เกิน 5 MB, PDF ไม่เกิน 15 MB)' })
      return next(error)
    }
    try {
      const imageFiles = [...(req.files?.images || []), ...(req.files?.image || [])]
      if (imageFiles.length > MAX_IMAGES_PER_ARTICLE) {
        throw Object.assign(new Error('TOO_MANY_IMAGES'), { status: 400 })
      }
      const files = Object.values(req.files || {}).flat()
      for (const file of files) {
        const isImage = file.fieldname === 'image' || file.fieldname === 'images'
        if (isImage && file.size > 5 * 1024 * 1024) throw Object.assign(new Error('IMAGE_TOO_LARGE'), { status: 413 })
        const bytes = await readMagicBytes(file.path)
        if (!validSignature(file, bytes)) throw Object.assign(new Error('INVALID_FILE_SIGNATURE'), { status: 400 })
      }
      next()
    } catch (validationError) {
      await removeNewFiles(req.files)
      const message = validationError.message === 'TOO_MANY_IMAGES'
        ? 'สามารถแนบรูปภาพประกอบได้สูงสุดไม่เกิน 5 รูป'
        : validationError.status === 413
          ? 'รูปภาพแต่ละรูปต้องมีขนาดไม่เกิน 5 MB'
          : 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่อนุญาต'
      res.status(validationError.status || 400).json({ message })
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
function uploadedImageList(req) {
  const files = [...(req.files?.images || []), ...(req.files?.image || [])]
  return files.map((file) => storedUpload(file.filename)).filter(Boolean)
}

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
      prisma.article.findMany({ orderBy: { updatedAt: 'desc' }, select: { articleId: true, title: true, status: true, viewCount: true, updatedAt: true, image: true, images: true, pdfFile: true, category: { select: { categoryName: true } } } }),
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
      const imgCount = Array.isArray(article.images) && article.images.length ? article.images.length : (article.image ? 1 : 0)
      rows.push([article.articleId, article.title, article.category.categoryName, article.status, article.viewCount, votes.helpful, votes.total, votes.total ? Math.round(votes.helpful * 100 / votes.total) : 0, imgCount ? `มี (${imgCount} รูป)` : 'ไม่มี', article.pdfFile ? 'มี' : 'ไม่มี', article.updatedAt.toISOString()])
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
    const images = uploadedImageList(req)
    if (images.length > MAX_IMAGES_PER_ARTICLE) {
      await removeNewFiles(req.files)
      return res.status(400).json({ message: 'สามารถแนบรูปภาพประกอบได้สูงสุดไม่เกิน 5 รูป' })
    }
    const article = await prisma.article.create({ data: {
      ...parsed.data,
      image: images[0] || null,
      images,
      pdfFile: optionalUpload(req, 'pdfFile'),
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
    const existing = await prisma.article.findUnique({ where: { articleId }, select: { image: true, images: true, pdfFile: true, publishedAt: true } })
    if (!existing) { await removeNewFiles(req.files); return res.status(404).json({ message: 'ไม่พบบทความนี้' }) }
    const category = await prisma.category.findUnique({ where: { categoryId: parsed.data.categoryId }, select: { categoryId: true } })
    if (!category) { await removeNewFiles(req.files); return res.status(400).json({ message: 'ไม่พบหมวดหมู่ที่เลือก' }) }

    const currentImages = Array.isArray(existing.images) && existing.images.length > 0
      ? existing.images
      : existing.image ? [existing.image] : []

    let keptImages = currentImages
    if (typeof req.body.keptImages === 'string') {
      try {
        const parsedKept = JSON.parse(req.body.keptImages)
        if (Array.isArray(parsedKept)) {
          keptImages = [...new Set(parsedKept.filter((u) => typeof u === 'string' && currentImages.includes(u)))]
        }
      } catch {
        keptImages = []
      }
    } else if (req.body.removeImage === 'true') {
      keptImages = []
    } else if (req.files?.image?.length && !req.files?.images?.length) {
      keptImages = []
    }

    const newImages = uploadedImageList(req)
    const combinedImages = [...keptImages, ...newImages]
    if (combinedImages.length > MAX_IMAGES_PER_ARTICLE) {
      await removeNewFiles(req.files)
      return res.status(400).json({ message: 'สามารถแนบรูปภาพประกอบได้สูงสุดไม่เกิน 5 รูป' })
    }

    const image = combinedImages[0] || null
    const pdfFile = optionalUpload(req, 'pdfFile') || (req.body.removePdf === 'true' ? null : existing.pdfFile)
    const article = await prisma.article.update({ where: { articleId }, data: {
      ...parsed.data,
      image,
      images: combinedImages,
      pdfFile,
      publishedAt: parsed.data.status === 'PUBLISHED' ? existing.publishedAt || new Date() : existing.publishedAt,
    }, include: { category: { select: { categoryId: true, categoryName: true } } } })

    const removedOldImages = currentImages.filter((url) => !combinedImages.includes(url))
    await Promise.all(removedOldImages.map((url) => removeStoredUpload(url)))
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
    const article = await prisma.article.delete({ where: { articleId }, select: { image: true, images: true, pdfFile: true } })
    const allImages = new Set([...(Array.isArray(article.images) ? article.images : []), article.image].filter(Boolean))
    await Promise.all([...[...allImages].map((img) => removeStoredUpload(img)), removeStoredUpload(article.pdfFile)])
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
