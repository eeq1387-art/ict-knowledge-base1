import { prisma } from '../db.js'
import { CONTACT_SETTING_KEY, DEFAULT_KKICT_CONTACT } from '../contactSettings.js'

try {
  const [articles, dailyViews, feedback, searches] = await prisma.$transaction([
    prisma.article.updateMany({ data: { viewCount: 0 } }),
    prisma.articleViewDaily.deleteMany(),
    prisma.articleFeedback.deleteMany(),
    prisma.searchLog.deleteMany(),
    prisma.siteSetting.upsert({
      where: { key: CONTACT_SETTING_KEY },
      create: { key: CONTACT_SETTING_KEY, value: DEFAULT_KKICT_CONTACT },
      update: { value: DEFAULT_KKICT_CONTACT },
    }),
  ])
  console.log(`Reset statistics to 0: ${articles.count} articles zeroed, ${dailyViews.count} daily view rows, ${feedback.count} feedback votes, and ${searches.count} search logs cleared.`)
} catch (error) {
  console.error('Could not reset statistics:', error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
