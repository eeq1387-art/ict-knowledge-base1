import { prisma } from '../db.js'

const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
try {
  const result = await prisma.searchLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  console.log(`ลบประวัติคำค้นเก่ากว่า 180 วันแล้ว ${result.count.toLocaleString('th-TH')} รายการ`)
} catch (error) {
  console.error('ไม่สามารถลบประวัติคำค้นได้', error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
