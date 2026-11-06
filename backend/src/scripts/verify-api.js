import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import { prisma } from '../db.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(scriptDir, '../..')
const testPort = Number(process.env.TEST_PORT) || 3099
const BASE = `http://localhost:${testPort}`
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'

async function waitForServer(proc) {
  for (let i = 0; i < 35; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  proc.kill()
  throw new Error('Test server failed to start')
}

const serverProc = spawn(process.execPath, ['src/server.js'], {
  cwd: backendDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(testPort) },
})

const savedContact = await prisma.siteSetting.findUnique({ where: { key: 'contact' } })
const maxSearchLogBefore = (await prisma.searchLog.aggregate({ _max: { id: true } }))._max.id || 0
let targetArticleId = null
let originalViewCount = null
let originalDailyViews = []
const uniqueTerm = 'คำค้นทดสอบอัตโนมัติ_xyz987'
const testVoterKey = 'automated-test-voter-key-20261106'
const tempAdminUsername = 'verify_script_temp_admin'

try {
  await waitForServer(serverProc)

  // 1. Public endpoints & case/hyphen-insensitive search
  const catRes = await fetch(`${BASE}/api/categories`, { headers: { 'User-Agent': UA_BROWSER } })
  assert.equal(catRes.status, 200)
  assert.equal(Number(catRes.headers.get('ratelimit-limit')), 600)
  const categories = await catRes.json()
  assert.ok(categories.length >= 5)

  const artRes = await fetch(`${BASE}/api/articles`, { headers: { 'User-Agent': UA_BROWSER } })
  assert.equal(artRes.status, 200)
  const articles = await artRes.json()
  assert.ok(articles.length > 0)

  async function searchAllPages(q) {
    const r1 = await fetch(`${BASE}/api/articles/search?q=${encodeURIComponent(q)}&page=1&pageSize=2`, { headers: { 'User-Agent': UA_BROWSER } })
    const d1 = await r1.json()
    const items = [...(d1.items || [])]
    for (let p = 2; p <= (d1.pageCount || 1); p += 1) {
      const rp = await fetch(`${BASE}/api/articles/search?q=${encodeURIComponent(q)}&page=${p}&pageSize=2`, { headers: { 'User-Agent': UA_BROWSER } })
      const dp = await rp.json()
      items.push(...(dp.items || []))
    }
    return { total: d1.total, summed: items.length }
  }

  const sLower = await searchAllPages('wifi')
  const sUpper = await searchAllPages('WIFI')
  const sHyphen = await searchAllPages('Wi-Fi')
  assert.equal(sLower.total, sLower.summed)
  assert.equal(sUpper.total, sUpper.summed)
  assert.equal(sLower.total, sUpper.total)
  assert.equal(sLower.total, sHyphen.total)
  assert.ok(sLower.total >= 2, 'Should match all Wi-Fi guides regardless of hyphen or case')
  const hyphenOnly = await (await fetch(`${BASE}/api/articles/search?q=---`, { headers: { 'User-Agent': UA_BROWSER } })).json()
  assert.equal(hyphenOnly.total, 0, 'A hyphen-only query must not match every article')
  console.log('✓ [5a/6] Public categories, articles, search pagination & rate-limit (600/min)')

  // 2. Auth & login rate limit
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA_BROWSER },
    body: JSON.stringify({
      username: process.env.ADMIN_INITIAL_USERNAME?.trim(),
      password: process.env.ADMIN_INITIAL_PASSWORD,
    }),
  })
  assert.equal(loginRes.status, 200)
  const { token: adminToken } = await loginRes.json()
  assert.ok(adminToken)

  for (let i = 1; i <= 11; i += 1) {
    const wrongRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA_BROWSER },
      body: JSON.stringify({ username: 'verify_script_bruteforce_user', password: 'wrong_password' }),
    })
    assert.equal(wrongRes.status, i <= 10 ? 401 : 429)
  }

  const fakeAuthRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: 'Bearer invalid.jwt.token', 'User-Agent': UA_BROWSER },
  })
  assert.equal(fakeAuthRes.status, 401)
  console.log('✓ [5b] Admin login, brute-force protection (11th -> 429) & invalid JWT (401)')

  // 3. Contact settings
  await prisma.siteSetting.deleteMany({ where: { key: 'contact' } })
  const emptyContact = await (await fetch(`${BASE}/api/settings/contact`)).json()
  const fields = ['phone', 'lineId', 'lineUrl', 'email', 'location', 'hours', 'note']
  assert.ok(fields.every((f) => emptyContact[f] === '') && Object.keys(emptyContact).length === 7)

  const payload = {
    phone: '043-221-555', lineId: '@ictkk', lineUrl: 'https://line.me/R/ti/p/@ictkk',
    email: 'ict@khonkaen.go.th', location: 'ศูนย์ ICT ขอนแก่น', hours: '08:30-16:30', note: 'หมายเหตุทดสอบ',
  }
  assert.equal((await fetch(`${BASE}/api/admin/settings/contact`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 401)
  assert.equal((await fetch(`${BASE}/api/admin/settings/contact`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(payload) })).status, 200)
  assert.equal((await fetch(`${BASE}/api/admin/settings/contact`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ ...payload, email: 'bad-email' }) })).status, 400)
  assert.equal((await fetch(`${BASE}/api/admin/settings/contact`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ ...payload, lineUrl: 'http://line.me/ti' }) })).status, 400)
  assert.equal((await fetch(`${BASE}/api/admin/settings/contact`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ ...payload, note: 'ก'.repeat(301) }) })).status, 400)
  console.log('✓ [5c] Contact settings GET/PUT, auth guard & validation')

  // 4. SearchLog, ArticleViewDaily, Bot filtering & Admin Insights
  targetArticleId = articles[0].articleId
  const artSnap = await prisma.article.findUnique({ where: { articleId: targetArticleId }, select: { viewCount: true } })
  originalViewCount = artSnap.viewCount
  originalDailyViews = await prisma.articleViewDaily.findMany({ where: { articleId: targetArticleId } })

  await prisma.searchLog.deleteMany({ where: { term: uniqueTerm } })
  await fetch(`${BASE}/api/articles/search?q=${encodeURIComponent(uniqueTerm)}&page=1`, { headers: { 'User-Agent': UA_BROWSER } })
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(await prisma.searchLog.count({ where: { term: uniqueTerm } }), 1)
  await fetch(`${BASE}/api/articles/search?q=${encodeURIComponent(uniqueTerm)}&page=2`, { headers: { 'User-Agent': UA_BROWSER } })
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(await prisma.searchLog.count({ where: { term: uniqueTerm } }), 1)
  await fetch(`${BASE}/api/articles/search?q=${encodeURIComponent(uniqueTerm)}&page=1&sort=popular`, { headers: { 'User-Agent': UA_BROWSER } })
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(await prisma.searchLog.count({ where: { term: uniqueTerm } }), 1, 'Same visitor repeating a search within 10 minutes is logged once')

  const dailyBefore = (await prisma.articleViewDaily.aggregate({ where: { articleId: targetArticleId }, _sum: { count: true } }))._sum.count || 0
  await fetch(`${BASE}/api/articles/${targetArticleId}`, { headers: { 'User-Agent': UA_BROWSER } })
  let viewAfterNormal = (await prisma.article.findUnique({ where: { articleId: targetArticleId }, select: { viewCount: true } })).viewCount
  const dailyAfterNormal = (await prisma.articleViewDaily.aggregate({ where: { articleId: targetArticleId }, _sum: { count: true } }))._sum.count || 0
  assert.equal(viewAfterNormal, originalViewCount + 1)
  assert.equal(dailyAfterNormal, dailyBefore + 1)

  await fetch(`${BASE}/api/articles/${targetArticleId}`, { headers: { 'User-Agent': UA_BROWSER } })
  assert.equal((await prisma.article.findUnique({ where: { articleId: targetArticleId }, select: { viewCount: true } })).viewCount, originalViewCount + 1, 'Refresh by the same visitor is not counted twice')
  await fetch(`${BASE}/api/articles/${targetArticleId}`, { headers: { 'User-Agent': UA_BROWSER, 'X-Visitor-Id': 'automated-test-visitor-b-000001' } })
  viewAfterNormal = (await prisma.article.findUnique({ where: { articleId: targetArticleId }, select: { viewCount: true } })).viewCount
  assert.equal(viewAfterNormal, originalViewCount + 2, 'A different browser behind the same office IP is counted')
  assert.equal((await prisma.articleViewDaily.aggregate({ where: { articleId: targetArticleId }, _sum: { count: true } }))._sum.count || 0, dailyBefore + 2)

  await fetch(`${BASE}/api/articles/${targetArticleId}`, { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } })
  assert.equal((await prisma.article.findUnique({ where: { articleId: targetArticleId }, select: { viewCount: true } })).viewCount, viewAfterNormal)

  for (const d of [7, 30, 90]) {
    const insRes = await fetch(`${BASE}/api/admin/insights?days=${d}`, { headers: { Authorization: `Bearer ${adminToken}` } })
    assert.equal(insRes.status, 200)
    const ins = await insRes.json()
    assert.equal(ins.viewsByDay.length, d)
  }
  console.log('✓ [5d] SearchLog page 1 only, ArticleViewDaily increment, Googlebot skip & insights (7/30/90 days)')

  // 5. Preview mode (new tab without token & draft preview with admin token)
  const previewNoAuthRes = await fetch(`${BASE}/api/articles/${targetArticleId}?preview=1`, { headers: { 'User-Agent': UA_BROWSER } })
  assert.equal(previewNoAuthRes.status, 200)
  assert.equal((await prisma.article.findUnique({ where: { articleId: targetArticleId }, select: { viewCount: true } })).viewCount, viewAfterNormal)

  const draftArticle = await prisma.article.findFirst({ where: { status: 'DRAFT' }, select: { articleId: true } })
  if (draftArticle) {
    assert.equal((await fetch(`${BASE}/api/articles/${draftArticle.articleId}?preview=1`, { headers: { 'User-Agent': UA_BROWSER } })).status, 404)
    assert.equal((await fetch(`${BASE}/api/articles/${draftArticle.articleId}?preview=1`, { headers: { Authorization: `Bearer ${adminToken}`, 'User-Agent': UA_BROWSER } })).status, 200)
  }
  console.log('✓ [5e] Admin preview skips viewCount in new tab and supports authenticated draft preview')

  // 6. Feedback & rate limit header
  const fb1 = await fetch(`${BASE}/api/articles/${targetArticleId}/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ helpful: true, voterKey: testVoterKey }),
  })
  assert.equal(fb1.status, 201)
  assert.equal(Number(fb1.headers.get('ratelimit-limit')), 60)
  assert.equal((await fetch(`${BASE}/api/articles/${targetArticleId}/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ helpful: false, voterKey: testVoterKey }),
  })).status, 409)
  assert.equal((await fetch(`${BASE}/api/articles/${targetArticleId}/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ helpful: 'bad', voterKey: 'short' }),
  })).status, 400)
  console.log('✓ [5f/6] Feedback vote (201), duplicate (409), invalid (400) & rate-limit (60/10min)')

  // 7. Upload signature & size limit
  const uploadDir = path.resolve(backendDir, 'uploads')
  const filesBefore = fs.readdirSync(uploadDir).sort()

  const fakeForm = new FormData()
  fakeForm.append('title', 'ทดสอบไฟล์ปลอม'); fakeForm.append('content', 'เนื้อหา'); fakeForm.append('categoryId', String(categories[0].categoryId))
  fakeForm.append('image', new Blob([Buffer.from('not-an-image')], { type: 'image/jpeg' }), 'fake.jpg')
  assert.equal((await fetch(`${BASE}/api/admin/articles`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fakeForm })).status, 400)
  assert.deepEqual(fs.readdirSync(uploadDir).sort(), filesBefore)

  const bigBuf = Buffer.alloc(5 * 1024 * 1024 + 1024, 0)
  bigBuf[0] = 0xff; bigBuf[1] = 0xd8; bigBuf[2] = 0xff
  const bigForm = new FormData()
  bigForm.append('title', 'ทดสอบไฟล์ใหญ่'); bigForm.append('content', 'เนื้อหา'); bigForm.append('categoryId', String(categories[0].categoryId))
  bigForm.append('image', new Blob([bigBuf], { type: 'image/jpeg' }), 'large.jpg')
  assert.equal((await fetch(`${BASE}/api/admin/articles`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: bigForm })).status, 413)
  assert.deepEqual(fs.readdirSync(uploadDir).sort(), filesBefore)
  console.log('✓ [5g] Upload magic-bytes verification (400), >5MB limit (413) & zero leftover files')

  // 8. Change password (uses a temporary admin so the real account is never touched)
  const tempPassword = 'Temp-Verify-Password-01'
  const newTempPassword = 'Temp-Verify-Password-02'
  await prisma.admin.deleteMany({ where: { username: tempAdminUsername } })
  await prisma.admin.create({ data: { username: tempAdminUsername, fullname: 'Verify Script', password: await bcrypt.hash(tempPassword, 12) } })
  const login = async (password) => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: tempAdminUsername, password }) })
  const tempToken = (await (await login(tempPassword)).json()).token
  const changePassword = (body, token = tempToken) => fetch(`${BASE}/api/auth/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  assert.equal((await changePassword({ currentPassword: tempPassword, newPassword: newTempPassword }, '')).status, 401)
  assert.equal((await changePassword({ currentPassword: 'wrong-password-xx', newPassword: newTempPassword })).status, 400)
  assert.equal((await changePassword({ currentPassword: tempPassword, newPassword: 'short' })).status, 400)
  assert.equal((await changePassword({ currentPassword: tempPassword, newPassword: tempPassword })).status, 400)
  assert.equal((await changePassword({ currentPassword: tempPassword, newPassword: newTempPassword })).status, 200)
  assert.equal((await login(tempPassword)).status, 401)
  assert.equal((await login(newTempPassword)).status, 200)
  console.log('✓ [8] Change password: auth guard (401), wrong/short/same password (400), success (200) & new password works')

  console.log('\nALL VERIFICATION CHECKS PASSED!')
} finally {
  serverProc.kill()
  await prisma.admin.deleteMany({ where: { username: tempAdminUsername } })
  await prisma.searchLog.deleteMany({ where: { id: { gt: maxSearchLogBefore } } })
  const hashedVoter = createHash('sha256').update(testVoterKey).digest('hex')
  if (targetArticleId) {
    await prisma.articleFeedback.deleteMany({ where: { articleId: targetArticleId, voterKey: hashedVoter } })
    if (originalViewCount !== null) {
      await prisma.article.update({ where: { articleId: targetArticleId }, data: { viewCount: originalViewCount } })
    }
    await prisma.articleViewDaily.deleteMany({ where: { articleId: targetArticleId } })
    if (originalDailyViews.length > 0) {
      await prisma.articleViewDaily.createMany({ data: originalDailyViews })
    }
  }
  if (savedContact) {
    await prisma.siteSetting.upsert({
      where: { key: 'contact' },
      create: { key: 'contact', value: savedContact.value },
      update: { value: savedContact.value },
    })
  } else {
    await prisma.siteSetting.deleteMany({ where: { key: 'contact' } })
  }
  await prisma.$disconnect()
}
