import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, assetUrl } from '../services/api'

function useAdminData(path, refresh = 0) {
  const [response, setResponse] = useState({ path: '', refresh: -1, data: null, error: '' })
  useEffect(() => {
    if (!path) return undefined
    let active = true
    api.get(path).then((data) => { if (active) setResponse({ path, refresh, data, error: '' }) }).catch((error) => { if (active) setResponse({ path, refresh, data: null, error: error.message }) })
    return () => { active = false }
  }, [path, refresh])
  const current = response.path === path && response.refresh === refresh
  return { data: current ? response.data : null, error: current ? response.error : '', loading: !current }
}

const statusLabel = { DRAFT: 'ฉบับร่าง', PUBLISHED: 'เผยแพร่แล้ว', HIDDEN: 'ซ่อนอยู่' }
const dateLabel = (value) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value)) : '—'
const contactFields = [
  ['phone', 'เบอร์โทรศัพท์'],
  ['lineId', 'ไอดี LINE'],
  ['lineUrl', 'ลิงก์ LINE'],
  ['email', 'อีเมล'],
  ['location', 'ที่ตั้งศูนย์ ICT'],
  ['hours', 'เวลาทำการ'],
]
const emptyContact = { phone: '', lineId: '', lineUrl: '', email: '', location: '', hours: '', note: '' }

function StatusBadge({ status }) { return <span className={`status-badge status-${status?.toLowerCase()}`}>{statusLabel[status] || status}</span> }
function Alert({ type = 'error', children }) { return children ? <div className={`admin-alert admin-alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div> : null }

function DailyViewsChart({ rows }) {
  const width = 720
  const height = 220
  const padding = 24
  const maximum = Math.max(1, ...rows.map((row) => row.views))
  const coordinates = rows.map((row, index) => {
    const x = padding + (rows.length > 1 ? index * (width - padding * 2) / (rows.length - 1) : (width - padding * 2) / 2)
    const y = height - padding - row.views * (height - padding * 2) / maximum
    return { x, y, ...row }
  })
  const total = rows.reduce((sum, row) => sum + row.views, 0)
  return <div className="insights-chart-wrap"><svg className="insights-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`กราฟยอดเข้าชมรวม ${total.toLocaleString('th-TH')} ครั้ง ใน ${rows.length} วัน`}>
    <title>{`ยอดเข้าชมรายวัน ${rows.length} วัน รวม ${total.toLocaleString('th-TH')} ครั้ง`}</title>
    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="insights-chart-axis"/>
    <polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} className="insights-chart-line"/>
    {coordinates.map((row) => <circle key={row.day} cx={row.x} cy={row.y} r="4" className="insights-chart-point"><title>{`${row.day}: ${row.views.toLocaleString('th-TH')} ครั้ง`}</title></circle>)}
  </svg><div className="insights-chart-summary"><span>{rows[0]?.day}</span><b>รวม {total.toLocaleString('th-TH')} ครั้ง</b><span>{rows.at(-1)?.day}</span></div></div>
}

export function ContactSettings() {
  const { data, loading, error } = useAdminData('/settings/contact')
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const form = draft || data || emptyContact

  function setField(field) {
    return (event) => setDraft((current) => ({ ...(current || data || emptyContact), [field]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setNotice('')
    setActionError('')
    const emailPattern = /^[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i
    if (form.email && !emailPattern.test(form.email.trim())) return setActionError('รูปแบบอีเมลไม่ถูกต้อง')
    if (form.lineUrl && !/^https:\/\//i.test(form.lineUrl.trim())) return setActionError('ลิงก์ LINE ต้องขึ้นต้นด้วย https://')
    setBusy(true)
    try {
      await api.put('/admin/settings/contact', Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])))
      setNotice('บันทึกข้อมูลติดต่อเรียบร้อยแล้ว')
    } catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  return <section className="admin-content">
    <div className="admin-title-row"><div><span className="eyebrow">ช่องทางติดต่อ</span><h1>ตั้งค่าข้อมูลติดต่อ</h1><p className="admin-muted">ข้อมูลนี้จะแสดงในหน้าคลังความรู้และคู่มือ</p></div></div>
    <Alert type="success">{notice}</Alert><Alert>{actionError || error}</Alert>
    {loading ? <p className="admin-loading">กำลังโหลดข้อมูลติดต่อ...</p> : <form className="admin-form contact-settings-form" onSubmit={submit}>
      <div className="admin-form-grid">{contactFields.map(([field, label]) => <label key={field}>{label}<input type="text" maxLength={300} value={form[field]} onChange={setField(field)} placeholder={`ระบุ${label}`}/></label>)}</div>
      <label>หมายเหตุ <small>ไม่เกิน 300 ตัวอักษร</small><textarea rows={3} maxLength={300} value={form.note} onChange={setField('note')} placeholder="ข้อมูลเพิ่มเติมสำหรับผู้ติดต่อ"/></label>
      <div className="admin-form-actions"><button className="admin-primary-link" disabled={busy || Boolean(error)}>{busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูลติดต่อ'}</button></div>
    </form>}
  </section>
}

export function AdminHome() {
  const [refresh, setRefresh] = useState(0)
  const { data, loading, error } = useAdminData('/admin/dashboard', refresh)
  const [insightDays, setInsightDays] = useState(30)
  const insights = useAdminData(`/admin/insights?days=${insightDays}`)
  const [actionError, setActionError] = useState('')
  const dashboard = data || {}
  async function publishNow(article) {
    setActionError('')
    try { await api.patch(`/admin/articles/${article.articleId}/status`, { status: 'PUBLISHED' }); setRefresh((value) => value + 1) }
    catch (err) { setActionError(err.message) }
  }
  async function exportCsv() {
    setActionError('')
    try { await api.download('/admin/reports/articles.csv', 'รายงานคลังความรู้.csv') }
    catch (err) { setActionError(err.message) }
  }
  const categoryRows = dashboard.categories || []
  const maxCategoryCount = Math.max(1, ...categoryRows.map((category) => category._count?.articles || 0))
  return <section className="admin-content">
    <div className="admin-title-row"><div><span className="eyebrow">STAFF DASHBOARD</span><h1>ภาพรวมคลังความรู้</h1><p className="admin-muted">ข้อมูลสรุปจากบทความ การเข้าชม และผลประเมิน</p></div></div>
    <Alert>{error || actionError}</Alert>
    {loading ? <p className="admin-loading">กำลังโหลดข้อมูล...</p> : <>
      <div className="dashboard-quick-actions"><Link className="admin-primary-link" to="/admin/articles/new">＋ เขียนบทความใหม่</Link><Link className="admin-secondary-link" to="/admin/categories">จัดการหมวดหมู่</Link><Link className="admin-secondary-link" to="/" target="_blank">เปิดดูหน้าเว็บไซต์จริง ↗</Link><button className="admin-secondary-link" onClick={exportCsv}>ดาวน์โหลดรายงานสถิติ (CSV)</button></div>
      <div className="dashboard-cards">
        <div><span>บทความทั้งหมด</span><b>{Number(dashboard.articleCount || 0).toLocaleString('th-TH')}</b><small>รวมทุกสถานะ</small></div>
        <div><span>เผยแพร่แล้ว</span><b>{Number(dashboard.publishedCount || 0).toLocaleString('th-TH')}</b><small>พร้อมให้บริการอ่าน</small></div>
        <div><span>ฉบับร่าง / ซ่อน</span><b>{(Number(dashboard.draftCount || 0) + Number(dashboard.hiddenCount || 0)).toLocaleString('th-TH')}</b><small>ร่าง {dashboard.draftCount || 0} · ซ่อน {dashboard.hiddenCount || 0}</small></div>
        <div><span>หมวดหมู่ทั้งหมด</span><b>{Number(dashboard.categoryCount || 0).toLocaleString('th-TH')}</b><small>หมวดความรู้ด้าน ICT</small></div>
        <div><span>ยอดเข้าชมรวมทั้งหมด</span><b>{Number(dashboard.totalViews || 0).toLocaleString('th-TH')}</b><small>รวมทุกบทความ</small></div>
        <div className="satisfaction-card"><span>อัตราความพึงพอใจรวม</span><b>{Number(dashboard.helpfulPercent || 0)}%</b><small>มีประโยชน์ {dashboard.helpfulCount || 0} จาก {dashboard.feedbackCount || 0} โหวต</small></div>
      </div>
      <div className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">CATEGORY BREAKDOWN</span><h2>สัดส่วนบทความตามหมวดหมู่</h2></div><Link to="/admin/categories">จัดการหมวดหมู่ →</Link></div><div className="admin-table-wrap"><table className="admin-table dashboard-table"><thead><tr><th>หมวดหมู่</th><th>จำนวนบทความ</th><th>ยอดเข้าชม</th><th>สัดส่วน</th><th>เปิดรายการ</th></tr></thead><tbody>{categoryRows.map((category) => { const count = category._count?.articles || 0; return <tr key={category.categoryId}><td>{category.categoryName}</td><td>{count}</td><td>{Number(category.totalViews || 0).toLocaleString('th-TH')}</td><td><div className="progress-track"><span style={{ width: `${Math.round(count * 100 / maxCategoryCount)}%` }}/></div></td><td><Link to={`/admin/articles?category=${category.categoryId}`}>ดูบทความ</Link></td></tr> })}</tbody></table></div></div>
      <div className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">MOST VIEWED</span><h2>5 อันดับบทความยอดนิยม</h2></div><Link to="/admin/articles">จัดการบทความ →</Link></div>{(dashboard.topArticles || []).length ? <div className="admin-table-wrap"><table className="admin-table dashboard-table"><thead><tr><th>ชื่อบทความ</th><th>หมวดหมู่</th><th>ยอดวิว</th><th>ความพึงพอใจ</th><th>ทางลัด</th></tr></thead><tbody>{(dashboard.topArticles || []).map((article, index) => <tr key={article.articleId}><td><b>{index + 1}. {article.title}</b></td><td>{article.category?.categoryName || '—'}</td><td>{Number(article.viewCount || 0).toLocaleString('th-TH')}</td><td>{article.feedbackCount ? `${article.helpfulPercent}% (${article.helpfulCount}/${article.feedbackCount})` : 'ยังไม่มีผลประเมิน'}</td><td><div className="admin-row-actions"><Link to={`/articles/${article.articleId}`} target="_blank">ดูหน้าเว็บ</Link><Link to={`/admin/articles/${article.articleId}/edit`}>แก้ไข</Link></div></td></tr>)}</tbody></table></div> : <div className="dashboard-empty">ยังไม่มีบทความเผยแพร่</div>}</div>
      <div className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">NO RESULT SEARCHES</span><h2>คำค้นที่หาไม่เจอ</h2></div></div>{insights.loading ? <p className="dashboard-empty">กำลังโหลดสถิติคำค้น...</p> : insights.error ? <p className="dashboard-empty" role="alert">{insights.error}</p> : insights.data?.zeroResultTerms?.length ? <div className="recent-article-list">{insights.data.zeroResultTerms.map((item) => <div className="recent-article-row" key={item.term}><span><b>{item.term}</b><small>ค้นหา {item.count.toLocaleString('th-TH')} ครั้ง · ล่าสุด {dateLabel(item.lastSearched)}</small></span><Link to={`/admin/articles/new?title=${encodeURIComponent(item.term)}`}>เขียนคู่มือเรื่องนี้</Link></div>)}</div> : <p className="dashboard-empty">ยังไม่มีคำค้นที่ไม่พบผลลัพธ์</p>}</div>
      <div className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">DAILY ARTICLE VIEWS</span><h2>ยอดเข้าชม {insightDays} วันล่าสุด</h2></div><label>ช่วงเวลา <select aria-label="เลือกช่วงเวลาสถิติยอดเข้าชม" value={insightDays} onChange={(event) => setInsightDays(Number(event.target.value))}><option value={7}>7 วัน</option><option value={30}>30 วัน</option><option value={90}>90 วัน</option></select></label></div>{insights.loading ? <p className="dashboard-empty">กำลังโหลดสถิติยอดเข้าชม...</p> : insights.error ? <p className="dashboard-empty" role="alert">{insights.error}</p> : insights.data?.viewsByDay?.length ? <DailyViewsChart rows={insights.data.viewsByDay}/> : <p className="dashboard-empty">ยังไม่มีข้อมูลยอดเข้าชม</p>}</div>
      <div className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">POPULAR SEARCH TERMS</span><h2>คำค้นยอดนิยม</h2></div></div>{insights.loading ? <p className="dashboard-empty">กำลังโหลดคำค้นยอดนิยม...</p> : insights.error ? <p className="dashboard-empty" role="alert">{insights.error}</p> : insights.data?.topTerms?.length ? <div className="admin-table-wrap"><table className="admin-table dashboard-table"><thead><tr><th>คำค้น</th><th>จำนวนครั้ง</th><th>ผลลัพธ์เฉลี่ย</th></tr></thead><tbody>{insights.data.topTerms.map((item) => <tr key={item.term}><td>{item.term}</td><td>{item.count.toLocaleString('th-TH')}</td><td>{item.avgResults.toLocaleString('th-TH')}</td></tr>)}</tbody></table></div> : <p className="dashboard-empty">ยังไม่มีข้อมูลคำค้น</p>}</div>
      <div className="dashboard-columns"><section className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">PENDING DRAFTS</span><h2>ฉบับร่างที่รอเผยแพร่</h2></div></div>{(dashboard.pendingDrafts || []).length ? <div className="recent-article-list">{(dashboard.pendingDrafts || []).map((article) => <div className="recent-article-row" key={article.articleId}><Link to={`/admin/articles/${article.articleId}/edit`}><span>{article.title}</span><small>{article.category?.categoryName || '—'} · {dateLabel(article.updatedAt)}</small></Link><button onClick={() => publishNow(article)}>เผยแพร่ทันที</button></div>)}</div> : <p className="dashboard-empty">ไม่มีฉบับร่างที่รอเผยแพร่</p>}</section>
        <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">NEEDS IMPROVEMENT</span><h2>ข้อเสนอแนะที่ควรปรับปรุง</h2></div></div>{(dashboard.negativeFeedback || []).length ? <div className="recent-article-list">{(dashboard.negativeFeedback || []).map((article) => <Link key={article.articleId} to={`/admin/articles/${article.articleId}/edit`}><span>{article.title}</span><small>ไม่มีประโยชน์ {article.notHelpfulCount} · มีประโยชน์ {article.helpfulCount}</small></Link>)}</div> : <p className="dashboard-empty">ยังไม่มีบทความที่ได้รับข้อเสนอแนะเชิงลบ</p>}</section></div>
      <div className="dashboard-panel recent-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">RECENT UPDATES</span><h2>บทความที่อัปเดตล่าสุด</h2></div></div><div className="recent-article-list">{(dashboard.recentArticles || []).map((article) => <div className="recent-article-row" key={article.articleId}><Link to={`/admin/articles/${article.articleId}/edit`}><span>{article.title}</span><small><StatusBadge status={article.status}/> · {dateLabel(article.updatedAt)}</small></Link>{article.status === 'DRAFT' && <button onClick={() => publishNow(article)}>เผยแพร่ทันที</button>}</div>)}</div></div>
    </>}
  </section>
}

export function ArticleList() {
  const location = useLocation()
  const [status, setStatus] = useState('ALL')
  const [categoryId, setCategoryId] = useState(() => new URLSearchParams(location.search).get('category') || '')
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const categoriesData = useAdminData('/admin/categories')
  const filterParams = new URLSearchParams()
  if (status !== 'ALL') filterParams.set('status', status)
  if (categoryId) filterParams.set('category', categoryId)
  if (query.trim()) filterParams.set('q', query.trim())
  const path = `/admin/articles${filterParams.size ? `?${filterParams}` : ''}`
  const { data: articles, loading, error } = useAdminData(path, refresh)
  const [notice, setNotice] = useState(location.state?.notice || '')
  const [actionError, setActionError] = useState('')

  async function setArticleStatus(article, nextStatus) {
    setActionError('')
    try { await api.patch(`/admin/articles/${article.articleId}/status`, { status: nextStatus }); setNotice(`เปลี่ยนสถานะ “${article.title}” แล้ว`); setRefresh((value) => value + 1) }
    catch (err) { setActionError(err.message) }
  }
  async function removeArticle(article) {
    if (!window.confirm(`ลบบทความ “${article.title}” ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return
    setActionError('')
    try { await api.delete(`/admin/articles/${article.articleId}`); setNotice('ลบบทความแล้ว'); setRefresh((value) => value + 1) }
    catch (err) { setActionError(err.message) }
  }

  return <section className="admin-content"><div className="admin-title-row"><div><span className="eyebrow">CONTENT MANAGEMENT</span><h1>จัดการบทความ</h1><p className="admin-muted">ดูแลบทความ คู่มือ และสถานะการเผยแพร่</p></div><Link className="admin-primary-link" to="/admin/articles/new">＋ เพิ่มบทความ</Link></div><Alert type="success">{notice}</Alert><Alert>{actionError || error}</Alert>
    <div className="admin-filter-row"><div className="admin-tabs">{[['ALL', 'ทั้งหมด'], ['PUBLISHED', 'เผยแพร่แล้ว'], ['DRAFT', 'ฉบับร่าง'], ['HIDDEN', 'ซ่อน']].map(([value, label]) => <button key={value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setNotice(''); setActionError('') }}>{label}</button>)}</div><span>{articles?.length ?? 0} บทความ</span></div><div className="admin-search-filters"><input aria-label="ค้นหาบทความ" placeholder="ค้นหาชื่อ เนื้อหา หรือคำสำคัญ" value={query} onChange={(event) => setQuery(event.target.value)}/><select aria-label="กรองหมวดหมู่" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">ทุกหมวดหมู่</option>{(categoriesData.data || []).map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select></div>
    {loading ? <p className="admin-loading">กำลังโหลดบทความ...</p> : !(articles || []).length ? <div className="admin-empty"><b>ไม่พบบทความในรายการนี้</b><p>ปรับตัวกรองหรือเพิ่มบทความใหม่</p><Link to="/admin/articles/new">เพิ่มบทความ →</Link></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>บทความ</th><th>หมวดหมู่</th><th>สถานะ</th><th>ยอดวิว</th><th>ผลประเมิน</th><th>ไฟล์แนบ</th><th>อัปเดตล่าสุด</th><th>การจัดการ</th></tr></thead><tbody>{(articles || []).map((article) => <tr key={article.articleId}><td><b>{article.title}</b></td><td>{article.category?.categoryName || '—'}</td><td><StatusBadge status={article.status}/></td><td>{Number(article.viewCount || 0).toLocaleString('th-TH')}</td><td>{article.feedbackCount ? `${article.helpfulPercent}% (${article.helpfulCount}/${article.feedbackCount})` : 'ยังไม่มีผลประเมิน'}</td><td><span title={article.image ? 'มีรูปภาพ' : 'ไม่มีรูปภาพ'}>{article.image ? '🖼 รูป' : '—'}</span> · <span title={article.pdfFile ? 'มีไฟล์ PDF' : 'ไม่มีไฟล์ PDF'}>{article.pdfFile ? 'PDF' : '—'}</span></td><td>{dateLabel(article.updatedAt)}</td><td><div className="admin-row-actions article-row-actions"><div className="admin-row-action-group"><Link to={`/articles/${article.articleId}?preview=1`} target="_blank" rel="opener">ดูตัวอย่าง</Link><Link to={`/admin/articles/${article.articleId}/edit`}>แก้ไข</Link></div><div className="admin-row-action-group">{[['PUBLISHED','เผยแพร่'], ['DRAFT','ฉบับร่าง'], ['HIDDEN','ซ่อน']].filter(([nextStatus]) => nextStatus !== article.status).map(([nextStatus, label]) => <button key={nextStatus} className={`status-action status-action-${nextStatus.toLowerCase()}`} onClick={() => setArticleStatus(article, nextStatus)}>{label}</button>)}<button className="danger-action" onClick={() => removeArticle(article)}>ลบ</button></div></div></td></tr>)}</tbody></table></div>}
  </section>
}

export function ArticleEditor() {
  const { id } = useParams()
  const { data: article, error, loading } = useAdminData(id ? `/admin/articles/${id}` : '')
  if (!id) return <ArticleForm key="new"/>
  if (loading) return <section className="admin-content"><p className="admin-loading">กำลังโหลดบทความ...</p></section>
  if (error || !article) return <section className="admin-content"><Alert>{error || 'ไม่พบบทความนี้'}</Alert><Link to="/admin/articles">← กลับไปรายการบทความ</Link></section>
  return <ArticleForm key={id} article={article}/>
}

function ArticleForm({ article }) {
  const editing = Boolean(article)
  const navigate = useNavigate()
  const location = useLocation()
  const suggestedTitle = new URLSearchParams(location.search).get('title') || ''
  const { data: categories, loading: categoriesLoading } = useAdminData('/admin/categories')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(() => ({
    title: article?.title || suggestedTitle, categoryId: article?.categoryId ? String(article.categoryId) : '',
    content: article?.content || '', steps: Array.isArray(article?.steps) ? article.steps.join('\n') : '',
    keywords: article?.keywords?.join(', ') || '', status: article?.status || 'DRAFT', featured: Boolean(article?.featured),
    removeImage: false, removePdf: false,
  }))
  const [imageFile, setImageFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const imagePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : '', [imageFile])
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview) }, [imagePreview])
  const setField = (field) => (event) => setForm((value) => ({ ...value, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  function appendTemplate(field, template) {
    setForm((value) => ({ ...value, [field]: `${value[field].trimEnd()}${value[field].trim() ? '\n\n' : ''}${template}` }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => body.append(key, typeof value === 'boolean' ? String(value) : value))
    if (imageFile) body.append('image', imageFile)
    if (pdfFile) body.append('pdfFile', pdfFile)
    try {
      if (editing) await api.patch(`/admin/articles/${article.articleId}`, body)
      else await api.post('/admin/articles', body)
      navigate('/admin/articles', { replace: true, state: { notice: editing ? 'บันทึกการแก้ไขบทความแล้ว' : 'เพิ่มบทความแล้ว' } })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <section className="admin-content"><div className="admin-title-row"><div><span className="eyebrow">ARTICLE EDITOR</span><h1>{editing ? 'แก้ไขบทความ' : 'เพิ่มบทความ'}</h1><p className="admin-muted">กรอกเนื้อหาและเลือกสถานะก่อนบันทึก</p></div><Link className="admin-secondary-link" to="/admin/articles">← กลับ</Link></div><Alert>{error}</Alert>
    <form className="admin-form" onSubmit={submit}><label>ชื่อบทความ <input required maxLength={240} value={form.title} onChange={setField('title')} placeholder="เช่น วิธีเชื่อมต่อ Wi-Fi ของศูนย์"/></label><div className="admin-form-grid"><label>หมวดหมู่<select required value={form.categoryId} onChange={setField('categoryId')} disabled={categoriesLoading}><option value="">เลือกหมวดหมู่</option>{(categories || []).map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select></label><label>สถานะ<select value={form.status} onChange={setField('status')}><option value="DRAFT">ฉบับร่าง</option><option value="PUBLISHED">เผยแพร่</option><option value="HIDDEN">ซ่อน</option></select></label></div><label>เนื้อหาบทความ<div className="editor-tools"><button type="button" onClick={() => appendTemplate('content', 'เกริ่นนำ\n')}>เพิ่มหัวข้อเกริ่นนำ</button><button type="button" onClick={() => appendTemplate('content', 'ข้อควรทราบ\n')}>เพิ่มหัวข้อย่อย</button></div><textarea required rows={11} maxLength={100000} value={form.content} onChange={setField('content')} placeholder="อธิบายปัญหาและวิธีแก้ไข..."/></label><label>ขั้นตอนการแก้ไข <small>ใส่หนึ่งขั้นตอนต่อหนึ่งบรรทัด</small><div className="editor-tools"><button type="button" onClick={() => appendTemplate('steps', 'ขั้นตอนใหม่')}>เพิ่มขั้นตอนถัดไป</button></div><textarea rows={7} value={form.steps} onChange={setField('steps')} placeholder={'ตรวจสอบการเชื่อมต่อ\nรีสตาร์ตอุปกรณ์\nทดลองเชื่อมต่ออีกครั้ง'}/></label><label>คำค้น <small>คั่นแต่ละคำด้วยเครื่องหมายจุลภาค</small><input value={form.keywords} onChange={setField('keywords')} placeholder="wifi, เครือข่าย, อินเทอร์เน็ต"/></label>
      <div className="admin-form-grid"><div className="admin-file-field"><label>ภาพประกอบ <small>JPG, PNG หรือ WebP · ไม่เกิน 5 MB</small><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { setImageFile(event.target.files?.[0] || null); setForm((value) => ({ ...value, removeImage: false })) }}/></label>{imageFile && <div className="selected-file-row"><span>ไฟล์ที่เลือก: {imageFile.name}</span><button type="button" onClick={() => setImageFile(null)}>นำออก</button></div>}{imagePreview ? <img className="admin-image-preview" src={imagePreview} alt="ตัวอย่างภาพที่จะอัปโหลด"/> : article?.image && !form.removeImage && <img className="admin-image-preview" src={assetUrl(article.image)} alt="ภาพประกอบปัจจุบัน"/>}{article?.image && <div className="current-file">ไฟล์ปัจจุบัน: <a href={assetUrl(article.image)} target="_blank" rel="noreferrer">ดูภาพ</a><label className="inline-check"><input type="checkbox" checked={form.removeImage} onChange={setField('removeImage')}/> ลบรูปภาพเดิม</label>{form.removeImage && <span className="file-removed-label">เลือกเพื่อลบเมื่อบันทึก</span>}</div>}</div><div className="admin-file-field"><label>คู่มือ PDF <small>PDF · ไม่เกิน 15 MB</small><input type="file" accept="application/pdf,.pdf" onChange={(event) => { setPdfFile(event.target.files?.[0] || null); setForm((value) => ({ ...value, removePdf: false })) }}/></label>{pdfFile && <div className="selected-file-row"><span>ไฟล์ที่เลือก: {pdfFile.name}</span><button type="button" onClick={() => setPdfFile(null)}>นำออก</button></div>}{article?.pdfFile && <div className="current-file">ไฟล์ PDF เดิม: <a href={assetUrl(article.pdfFile)} target="_blank" rel="noreferrer">เปิด PDF</a><label className="inline-check"><input type="checkbox" checked={form.removePdf} onChange={setField('removePdf')}/> ลบไฟล์ PDF เดิม</label>{form.removePdf && <span className="file-removed-label">เลือกเพื่อลบเมื่อบันทึก</span>}</div>}</div></div>
      <label className="featured-check"><input type="checkbox" checked={form.featured} onChange={setField('featured')}/> แสดงเป็นบทความแนะนำ</label><div className="admin-form-actions"><button type="button" className="admin-secondary-link" onClick={() => navigate('/admin/articles')}>ยกเลิก</button><button className="admin-primary-link" disabled={busy}>{busy ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'บันทึกบทความ'}</button></div>
    </form>
  </section>
}

export function CategoryManager() {
  const [refresh, setRefresh] = useState(0)
  const { data: categories, loading, error } = useAdminData('/admin/categories', refresh)
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  function resetForm() { setEditingId(null); setName(''); setDescription(''); setActionError('') }
  function editCategory(category) { setEditingId(category.categoryId); setName(category.categoryName); setDescription(category.description || ''); setActionError('') }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('')
    try {
      const payload = { categoryName: name, description }
      if (editingId) await api.patch(`/admin/categories/${editingId}`, payload)
      else await api.post('/admin/categories', payload)
      setNotice(editingId ? 'บันทึกการแก้ไขหมวดหมู่แล้ว' : 'เพิ่มหมวดหมู่แล้ว'); resetForm(); setRefresh((value) => value + 1)
    } catch (err) { setActionError(err.message) } finally { setBusy(false) }
  }
  async function removeCategory(category) {
    if (!window.confirm(`ลบหมวดหมู่ “${category.categoryName}” ใช่หรือไม่?`)) return
    setActionError(''); setNotice('')
    try { await api.delete(`/admin/categories/${category.categoryId}`); setNotice('ลบหมวดหมู่แล้ว'); setRefresh((value) => value + 1) }
    catch (err) { setActionError(err.message) }
  }

  return <section className="admin-content"><div className="admin-title-row"><div><span className="eyebrow">KNOWLEDGE TOPICS</span><h1>จัดการหมวดหมู่</h1><p className="admin-muted">ไม่สามารถลบหมวดหมู่ที่มีบทความผูกอยู่ได้</p></div></div><Alert type="success">{notice}</Alert><Alert>{actionError || error}</Alert><div className="category-admin-layout"><form className="admin-form category-form" onSubmit={submit}><h2>{editingId ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</h2><label>ชื่อหมวดหมู่<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="ชื่อหมวดหมู่"/></label><label>คำอธิบาย<textarea rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="รายละเอียดหมวดหมู่ (ไม่บังคับ)"/></label><div className="admin-form-actions"><button className="admin-secondary-link" type="button" onClick={resetForm}>ล้าง</button><button className="admin-primary-link" disabled={busy}>{busy ? 'กำลังบันทึก...' : editingId ? 'บันทึก' : 'เพิ่มหมวดหมู่'}</button></div></form><div className="admin-table-wrap category-admin-table-wrap">{loading ? <p className="admin-loading">กำลังโหลดหมวดหมู่...</p> : <table className="admin-table"><thead><tr><th>หมวดหมู่</th><th>คำอธิบาย</th><th>จำนวนบทความ</th><th>การจัดการ</th></tr></thead><tbody>{(categories || []).map((category) => <tr key={category.categoryId}><td><b>{category.categoryName}</b></td><td>{category.description || 'ไม่มีคำอธิบาย'}</td><td>{category._count?.articles || 0}</td><td><div className="admin-row-actions"><button onClick={() => editCategory(category)}>แก้ไข</button><button className="danger-action" onClick={() => removeCategory(category)}>ลบ</button></div></td></tr>)}</tbody></table>}</div></div>
  </section>
}

export default function AdminManagement({ admin, onLogout }) {
  return <main className="admin-page"><header className="admin-topbar"><Link className="admin-brand" to="/admin"><span className="brand-mark">ICT</span><span><b>คลังความรู้ ICT</b><small>พื้นที่เจ้าหน้าที่</small></span></Link><nav className="admin-nav"><Link to="/admin">ภาพรวม</Link><Link to="/admin/articles">บทความ</Link><Link to="/admin/categories">หมวดหมู่</Link><Link to="/admin/settings">ตั้งค่า</Link><Link to="/" target="_blank">หน้าเว็บไซต์</Link></nav><div><span>{admin?.fullname || 'เจ้าหน้าที่'}</span><button onClick={onLogout}>ออกจากระบบ</button></div></header><Outlet/></main>
}

