import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, assetUrl, feedbackKey, useDocumentTitle } from './services/api'
import { AdminLoginPage, AdminPage } from './pages/Admin'
import { AdminHome, ArticleEditor, ArticleList, CategoryManager, ContactSettings } from './pages/AdminManagement'
import './App.css'

const categoryIcons = ['▣', '⌁', '▤', '▧', '◉']
const dateLabel = (value) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value)) : 'ยังไม่เผยแพร่'
const excerpt = (value = '') => {
  const text = value.replace(/<[^>]*>/g, '').replace(/^\s*เกริ่นนำ\s*[:：]?\s*/, '').replace(/\s+/g, ' ').trim()
  if (text.length <= 120) return text
  const shortened = text.slice(0, 120)
  const lastSpace = shortened.lastIndexOf(' ')
  return `${(lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened).trimEnd()}…`
}

function Header() {
  const [term, setTerm] = useState('')
  let isAdmin = false
  try { isAdmin = Boolean(window.sessionStorage.getItem('ict-admin-token')) } catch { /* Storage can be disabled by browser policy. */ }
  const navigate = useNavigate()
  const submit = (event) => { event.preventDefault(); navigate(`/search?q=${encodeURIComponent(term.trim())}`) }
  return <>
    <div className="utility"><div className="shell utility-inner"><span>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น (KKICT)</span><span>บริการคลังความรู้ดิจิทัล · <a href="https://www.kkict.net/" target="_blank" rel="noreferrer">เว็บไซต์หลัก kkict.net ↗</a></span></div></div>
    <header className="site-header"><div className="shell nav-row">
      <Link className="brand" to="/"><span className="brand-mark">ICT</span><span><b>คลังความรู้ ICT</b><small>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT ขอนแก่น</small></span></Link>
      <nav><NavLink to="/" end>หน้าแรก</NavLink><NavLink to="/articles">คลังความรู้</NavLink><NavLink to="/search">ค้นหา</NavLink><Link to={isAdmin ? '/admin' : '/admin/login'}>{isAdmin ? 'ไปที่ระบบจัดการ' : 'เข้าสู่ระบบเจ้าหน้าที่'}</Link></nav>
      <form className="nav-search" onSubmit={submit}><input aria-label="ค้นหาคู่มือ" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ค้นหาคู่มือ..."/><button aria-label="ค้นหา">⌕</button></form>
    </div></header>
  </>
}

function safeHttpsHref(value) {
  if (typeof value !== 'string' || !value.trim().toLowerCase().startsWith('https://')) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

function safePhoneHref(value) {
  if (typeof value !== 'string' || !/^[+\d().\-\s]{3,80}$/.test(value.trim())) return ''
  const number = value.trim().replace(/[().\-\s]/g, '')
  if (!/^\+?\d{3,20}$/.test(number)) return ''
  try { const url = new URL(`tel:${number}`); return url.protocol === 'tel:' ? url.href : '' } catch { return '' }
}

function safeEmailHref(value) {
  const emailPattern = /^[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i
  if (typeof value !== 'string' || !emailPattern.test(value.trim())) return ''
  try { const url = new URL(`mailto:${value.trim()}`); return url.protocol === 'mailto:' ? url.href : '' } catch { return '' }
}

function contactActionHref(contact) {
  return safePhoneHref(contact?.phone) || safeHttpsHref(contact?.lineUrl) || safeEmailHref(contact?.email)
}

function ContactCard({ contact, title = 'ช่องทางติดต่อ', className = '' }) {
  const phone = typeof contact?.phone === 'string' ? contact.phone.trim() : ''
  const lineId = typeof contact?.lineId === 'string' ? contact.lineId.trim() : ''
  const lineUrl = safeHttpsHref(contact?.lineUrl)
  const email = typeof contact?.email === 'string' ? contact.email.trim() : ''
  const location = typeof contact?.location === 'string' ? contact.location.trim() : ''
  const hours = typeof contact?.hours === 'string' ? contact.hours.trim() : ''
  const note = typeof contact?.note === 'string' ? contact.note.trim() : ''
  if (![phone, lineId, lineUrl, email, location, hours, note].some(Boolean)) return null
  const phoneHref = safePhoneHref(phone)
  const emailHref = safeEmailHref(email)
  return <section className={`contact-card ${className}`.trim()} aria-label={title}>
    <h2>{title}</h2>
    <dl className="contact-details">
      {phone && <div><dt>โทรศัพท์</dt><dd>{phoneHref ? <a href={phoneHref}>{phone}</a> : phone}</dd></div>}
      {(lineId || lineUrl) && <div><dt>LINE</dt><dd>{lineUrl ? <a href={lineUrl} target="_blank" rel="noreferrer">{lineId || 'เปิด LINE'}</a> : lineId}</dd></div>}
      {email && <div><dt>อีเมล</dt><dd>{emailHref ? <a href={emailHref}>{email}</a> : email}</dd></div>}
      {location && <div><dt>ที่ตั้ง</dt><dd>{location}</dd></div>}
      {hours && <div><dt>เวลาทำการ</dt><dd>{hours}</dd></div>}
    </dl>
    {note && <p className="contact-note">{note}</p>}
  </section>
}

function Footer() {
  const contact = usePublicData('/settings/contact')
  return <footer><div className="shell footer-row"><div><b>คลังความรู้และคู่มือบริการไอที (KKICT)</b><p>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น · แหล่งรวมคู่มือและวิธีแก้ไขปัญหาด้านเทคโนโลยีสารสนเทศสำหรับบุคลากรและประชาชน</p><span>ศูนย์ ICT ขอนแก่น · <a href="https://www.kkict.net/" target="_blank" rel="noreferrer">www.kkict.net ↗</a></span></div><ContactCard contact={contact.data} title="ติดต่อศูนย์ ICT" className="footer-contact-card"/></div></footer>
}

function SearchBox({ initial = '' }) {
  const [value, setValue] = useState(initial)
  const navigate = useNavigate()
  return <><form className="hero-search" onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(value.trim())}`) }}>
    <span>⌕</span><input value={value} onChange={(e) => setValue(e.target.value)} aria-label="พิมพ์คำค้น" placeholder="พิมพ์สิ่งที่ต้องการค้นหา เช่น เชื่อมต่อ Wi-Fi..."/><button type="submit">ค้นหาคู่มือ</button>
  </form><div className="popular-searches"><span>คำค้นหายอดนิยม</span>{['Wi-Fi', 'Printer', 'รหัสผ่าน', 'Windows', 'อินเทอร์เน็ต'].map((term) => <button type="button" key={term} onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}>{term}</button>)}</div></>
}

function usePublicData(path) {
  const [response, setResponse] = useState({ path: '', data: null, error: '' })
  useEffect(() => {
    if (!path) return
    let active = true
    api.get(path).then((data) => { if (active) setResponse({ path, data, error: '' }) }).catch((err) => { if (active) setResponse({ path, data: null, error: err.message || 'ไม่สามารถโหลดข้อมูลได้' }) })
    return () => { active = false }
  }, [path])
  const current = response.path === path
  return { data: current ? response.data : null, error: current ? response.error : '', loading: !current }
}

function CategoryGrid({ categories = [] }) {
  return <div className="category-grid">{(categories || []).map((category, index) => <Link to={`/articles?category=${category.categoryId}`} className="category-card" key={category.categoryId}>
    <span className={`category-icon color-${index % 5}`}>{categoryIcons[index % categoryIcons.length]}</span><span><b>{category.categoryName}</b><small>{category._count?.articles ?? 0} บทความ</small></span><span className="arrow">→</span>
  </Link>)}</div>
}

function ArticleCard({ article }) {
  return <article className="article-card"><Link className="article-art" to={`/articles/${article.articleId}`} aria-label={`อ่าน ${article.title}`}>
    {article.image ? <img src={assetUrl(article.image)} alt=""/> : <div className="art-placeholder"><span>{article.category?.categoryName || 'คู่มือ ICT'}</span><b>{article.title.slice(0, 1)}</b><i>ICT KNOWLEDGE</i></div>}
    {article.featured && <span className="featured-tag">แนะนำ</span>}
  </Link><div className="article-copy"><div className="article-meta"><span>{article.category?.categoryName || 'ความรู้ทั่วไป'}</span><span>{dateLabel(article.publishedAt || article.createdAt)}</span></div>
    <h3><Link to={`/articles/${article.articleId}`}>{article.title}</Link></h3><p>{excerpt(article.content)}</p><div className="article-bottom"><span>◷ {article.viewCount.toLocaleString('th-TH')} ครั้ง</span><Link to={`/articles/${article.articleId}`}>อ่านเพิ่มเติม <b>→</b></Link></div>
  </div></article>
}

function SectionHeading({ eyebrow, title, action, to }) { return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action && <Link className="text-link" to={to}>{action} <b>→</b></Link>}</div> }

function HomePage() {
  const categories = usePublicData('/categories')
  const recent = usePublicData('/articles?limit=6')
  const featured = usePublicData('/articles?featured=true&limit=3')
  const contact = usePublicData('/settings/contact')
  const contactHref = contactActionHref(contact.data)
  useDocumentTitle('')
  return <main>
    <section className="hero"><div className="shell hero-inner"><div className="hero-copy"><div className="hero-kicker"><span></span> ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น</div><h1>คลังความรู้และคู่มือไอที<br/>เพื่อการเรียนรู้และแก้ไขปัญหาด้วยตนเอง</h1><p>บริการข้อมูลคู่มือการใช้งานคอมพิวเตอร์ เครือข่าย อุปกรณ์สำนักงาน และระบบสารสนเทศ ค้นหาคำตอบได้สะดวกพร้อมขั้นตอนปฏิบัติอย่างเป็นลำดับ</p><SearchBox/><div className="hero-proof"><span>✓</span> มาตรฐานคู่มือเข้าใจง่าย <span>✓</span> ค้นหาได้ตลอด 24 ชั่วโมง <span>✓</span> บริการสาธารณะไม่มีค่าใช้จ่าย</div></div><div className="hero-visual" aria-hidden="true"><div className="visual-circle"><div className="visual-window"><div className="window-bar"><i/><i/><i/><b>KKICT SERVICE PORTAL</b></div><div className="window-content"><div className="window-icon">ICT</div><div className="window-lines"><i/><i/><i/></div><div className="window-check">✓</div></div></div><span className="float-chip chip-one">✓ ขั้นตอนชัดเจน ทำตามได้จริง</span><span className="float-chip chip-two">⌕ ค้นหาคู่มือมาตรฐาน</span><span className="visual-dot dot-one"/><span className="visual-dot dot-two"/></div></div></div></section>
    <section className="section shell categories-section"><SectionHeading eyebrow="BROWSE BY TOPIC" title="เลือกหมวดหมู่ความรู้" action="ดูทุกหมวดหมู่" to="/articles"/>{categories.loading ? <div className="loading">กำลังโหลดหมวดหมู่...</div> : categories.error ? <ErrorState message={categories.error}/> : categories.data?.length ? <CategoryGrid categories={categories.data}/> : <EmptyState title="ยังไม่มีหมวดหมู่" detail="หมวดหมู่ความรู้จะแสดงที่นี่เมื่อมีการเพิ่มข้อมูล"/>}</section>
    <section className="section latest-section"><div className="shell"><SectionHeading eyebrow="LATEST KNOWLEDGE" title="คู่มือและบทความล่าสุด" action="ดูบทความทั้งหมด" to="/articles"/>{recent.loading ? <div className="loading">กำลังโหลดบทความ...</div> : recent.error ? <ErrorState message={recent.error}/> : recent.data?.length ? <div className="article-grid">{(recent.data || []).map((a) => <ArticleCard key={a.articleId} article={a}/>)}</div> : <EmptyState title="ยังไม่มีบทความ" detail="เมื่อมีการเผยแพร่คู่มือ บทความจะแสดงที่นี่"/>}</div></section>
    {!!featured.data?.length && <section className="section shell"><SectionHeading eyebrow="EDITOR'S PICKS" title="บทความแนะนำ"/><div className="article-grid">{(featured.data || []).map((a) => <ArticleCard key={a.articleId} article={a}/>)}</div></section>}
    <section className="help-banner shell"><div className="help-mark">i</div><div><b>ยังหาคำตอบที่ต้องการไม่เจอ?</b><p>ลองค้นหาด้วยคำอื่น หรือเลือกดูจากหมวดหมู่ด้านบน</p></div><Link to="/articles">ดูคลังความรู้ <span>→</span></Link>{contactHref && <a className="help-contact-link" href={contactHref}>ติดต่อเจ้าหน้าที่</a>}</section>
  </main>
}

function ErrorState({ message }) { return <div className="notice error-notice"><b>ไม่สามารถเชื่อมต่อข้อมูลได้</b><span>{message} โปรดลองใหม่เมื่อตรวจสอบการเชื่อมต่อระบบแล้ว</span></div> }
function EmptyState({ title, detail }) { return <div className="empty-state"><span>⌕</span><b>{title}</b><p>{detail}</p></div> }

function NotFoundPage() { useDocumentTitle('ไม่พบหน้าที่ต้องการ'); return <main className="not-found shell"><span className="eyebrow">404 · PAGE NOT FOUND</span><h1>ไม่พบหน้าที่คุณกำลังหา</h1><p>ลิงก์นี้อาจถูกย้ายหรือไม่มีอยู่แล้ว</p><Link className="admin-primary-link" to="/">กลับหน้าแรก</Link></main> }

function ArticlesPage({ search = false }) {
  const [params, setParams] = useSearchParams(); const query = params.get('q') || ''; const categoryId = params.get('category') || ''
  const categories = usePublicData('/categories')
  const selectedCategory = (categories.data || []).find((category) => String(category.categoryId) === categoryId)
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1)
  const searchParams = new URLSearchParams({ sort: params.get('sort') || 'recent', page: String(page), pageSize: '9' })
  if (search && query) searchParams.set('q', query)
  if (categoryId) searchParams.set('category', categoryId)
  const path = `/articles/search?${searchParams.toString()}`
  const results = usePublicData(path)
  function updateFilter(key, value) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete('page'); setParams(next) }
  function goToPage(value) { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next) }
  useDocumentTitle(search ? (query ? `ค้นหา “${query}”` : 'ค้นหาคู่มือ') : selectedCategory ? selectedCategory.categoryName : 'คลังความรู้และคู่มือ')
  return <main className="listing-page"><div className="shell"><div className="page-intro"><div className="breadcrumbs"><Link to="/">หน้าแรก</Link><span>/</span>{search ? 'ผลการค้นหา' : categoryId && selectedCategory ? <><Link to="/articles">คลังบทความ</Link><span>/</span><span>{selectedCategory.categoryName}</span></> : 'คลังบทความ'}</div><span className="eyebrow">ICT KNOWLEDGE LIBRARY</span><h1>{selectedCategory && !search ? selectedCategory.categoryName : search ? 'ผลการค้นหา' : 'คลังความรู้และคู่มือ'}</h1><p>{search ? (query ? <>ผลลัพธ์สำหรับ <b>“{query}”</b></> : 'พิมพ์คำค้นเพื่อค้นหาคู่มือ') : 'ค้นหาคู่มือและวิธีแก้ไขปัญหาด้านเทคโนโลยีสารสนเทศ'}</p><SearchBox key={query} initial={query}/></div>
    <div className="listing-layout"><aside className="filter-panel"><b>หมวดหมู่ความรู้</b><button className={!categoryId ? 'active' : ''} onClick={() => updateFilter('category', '')}>ทั้งหมด</button>{(categories.data || []).map((c) => <button key={c.categoryId} className={categoryId === String(c.categoryId) ? 'active' : ''} onClick={() => updateFilter('category', String(c.categoryId))}>{c.categoryName}</button>)}</aside>
      <section className="listing-results"><div className="results-head"><span>{results.data?.total || 0} บทความ</span><select aria-label="เรียงลำดับ" value={params.get('sort') || 'recent'} onChange={(e) => updateFilter('sort', e.target.value)}><option value="recent">ใหม่ล่าสุด</option><option value="popular">ยอดเข้าชมสูงสุด</option></select></div>{results.loading ? <div className="loading">กำลังค้นหาบทความ...</div> : results.error ? <ErrorState message={results.error}/> : results.data?.items?.length ? <><div className="article-grid">{(results.data?.items || []).map((a) => <ArticleCard key={a.articleId} article={a}/>)}</div>{results.data.pageCount > 1 && <nav className="pagination" aria-label="เปลี่ยนหน้าผลการค้นหา"><button disabled={page <= 1} onClick={() => goToPage(page - 1)}>← ก่อนหน้า</button><span>หน้า {results.data.page} จาก {results.data.pageCount}</span><button disabled={page >= results.data.pageCount} onClick={() => goToPage(page + 1)}>ถัดไป →</button></nav>}</> : <EmptyState title="ไม่พบบทความที่ตรงกับคำค้น" detail="ลองใช้คำค้นอื่น หรือเลือกหมวดหมู่ความรู้"/>}</section></div>
  </div></main>
}

function ArticlePage() {
  const { id } = useParams()
  const [routeParams] = useSearchParams()
  const preview = routeParams.get('preview') === '1'
  const { data: article, error, loading } = usePublicData(`/articles/${id}${preview ? '?preview=1' : ''}`)
  const contact = usePublicData('/settings/contact')
  const [vote, setVote] = useState({ id: '', value: '', count: null, helpfulCount: null })
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const related = usePublicData(article ? `/articles?category=${article.categoryId}&limit=6` : '')
  useDocumentTitle(article?.title || (loading ? 'กำลังโหลดบทความ' : 'ไม่พบบทความ'))
  const voteValue = vote.id === id ? vote.value : ''
  let storedVote = null
  try { storedVote = window.localStorage.getItem(`ict-article-vote-${id}`) } catch { /* Voting remains available when storage is blocked. */ }
  const feedbackCount = vote.id === id ? vote.count : article?.feedbackCount || 0
  const helpfulCount = vote.id === id ? vote.helpfulCount : article?.helpfulCount || 0
  const sendVote = async (helpful) => {
    setSending(true)
    try {
      const result = await api.post(`/articles/${id}/feedback`, { helpful, voterKey: feedbackKey() })
      try { window.localStorage.setItem(`ict-article-vote-${id}`, helpful ? 'yes' : 'no') } catch { /* The API still records this vote if local storage is unavailable. */ }
      setVote({ id, value: helpful ? 'yes' : 'no', count: result.count, helpfulCount: result.helpfulCount })
    } catch (e) { setVote({ id, value: e.message || 'เกิดข้อผิดพลาด', count: null, helpfulCount: null }) }
    finally { setSending(false) }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setCopyError('')
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      const field = document.createElement('textarea')
      field.value = window.location.href
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      const success = document.execCommand('copy')
      field.remove()
      setCopied(success)
      setCopyError(success ? '' : 'ไม่สามารถคัดลอกลิงก์ได้ กรุณาคัดลอกจากแถบที่อยู่')
      if (success) window.setTimeout(() => setCopied(false), 2500)
    }
  }
  if (loading) return <main className="article-detail shell"><div className="loading">กำลังโหลดบทความ...</div></main>
  if (error || !article) return <main className="article-detail shell"><ErrorState message={error || 'ไม่พบบทความนี้'}/><Link className="text-link" to="/articles">← กลับไปคลังบทความ</Link></main>
  const steps = Array.isArray(article.steps) ? article.steps : []
  const paragraphs = (article.content || '').split(/\n{2,}/).filter(Boolean)
  const relatedArticles = (related.data || []).filter((item) => item.articleId !== article.articleId).slice(0, 4)
  const quickHelpHref = contactActionHref(contact.data)
  return <main className="article-detail shell">
    {preview && <div className="preview-banner" role="status"><b>โหมดดูตัวอย่างของเจ้าหน้าที่</b><span>การเปิดหน้านี้จะไม่ถูกนับเป็นยอดเข้าชม</span></div>}

    <header className="article-hero-card">
      <div className="article-hero-main">
        <div className="breadcrumbs"><Link to="/">หน้าแรก</Link><span>/</span><Link to={`/articles?category=${article.categoryId}`}>{article.category?.categoryName || 'คลังบทความ'}</Link><span>/</span><span>{article.title}</span></div>
        <div className="article-meta"><Link to={`/articles?category=${article.categoryId}`}>{article.category?.categoryName}</Link><span>เผยแพร่ {dateLabel(article.publishedAt || article.createdAt)}</span></div>
        <h1>{article.title}</h1>
        <div className="detail-stats">
          <span>◷ เข้าชม {Number(article.viewCount || 0).toLocaleString('th-TH')} ครั้ง</span>
          <span>✎ อัปเดตล่าสุด {dateLabel(article.updatedAt)}</span>
          {steps.length > 0 && <span>✓ {steps.length} ขั้นตอนปฏิบัติ</span>}
          {article.pdfFile && <span>📄 มีไฟล์คู่มือ PDF</span>}
        </div>
        <div className="article-tools">
          <button className="print-button" onClick={copyLink}>{copied ? '✓ คัดลอกลิงก์แล้ว' : '⧉ คัดลอกลิงก์คู่มือ'}</button>
          <button className="print-button" onClick={() => window.print()}>▤ พิมพ์คู่มือ / บันทึกเป็น PDF</button>
          {article.pdfFile && <a className="download-button hero-pdf-btn" href={assetUrl(article.pdfFile)} download>⬇ ดาวน์โหลด PDF</a>}
          {copyError && <span role="status">{copyError}</span>}
        </div>
      </div>
      <div className="article-hero-badge" aria-hidden="true">
        <div className="hero-badge-inner">
          <span className="hero-badge-icon">ICT</span>
          <b>เอกสารคู่มือมาตรฐาน</b>
          <small>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น</small>
          <div className="hero-badge-pills">
            <span>{steps.length || 4} ขั้นตอนชัดเจน</span>
            <span>พร้อมใช้งาน 24 ชม.</span>
          </div>
        </div>
      </div>
    </header>

    <div className="detail-layout">
      <article className="detail-main">
        {article.image ? <button className="detail-image-button" onClick={() => setLightbox(true)} aria-label="ขยายภาพประกอบ"><img className="detail-image" src={assetUrl(article.image)} alt={`ภาพประกอบ ${article.title}`}/><span>🔍 คลิกเพื่อขยายภาพอินโฟกราฟิก</span></button> : <div className="detail-placeholder" aria-label={`หมวดหมู่ ${article.category?.categoryName}`}><span>{categoryIcons[(Number(article.categoryId || 1) - 1) % categoryIcons.length] || '▣'}</span><b>{article.category?.categoryName || 'คู่มือ ICT'}</b></div>}

        <div id="article-intro" className="article-content">
          <div className="content-section-bar"><span>📖 รายละเอียดและคำอธิบายประกอบ</span><small>อ่านทำความเข้าใจก่อนเริ่มปฏิบัติตามขั้นตอน</small></div>
          {paragraphs.map((paragraph, index) => {
            const headingMatch = paragraph.match(/^(เกริ่นนำ|ข้อควรทราบ[^\n]*|คำแนะนำ[^\n]*|สาเหตุ[^\n]*)\s*\n([\s\S]*)$/)
            return headingMatch ? <section key={`paragraph-${index}`} className="content-callout-block"><h2>{headingMatch[1]}</h2><p>{headingMatch[2]}</p></section> : <p key={`paragraph-${index}`}>{paragraph}</p>
          })}
        </div>

        {steps.length > 0 && <section id="article-steps" className="steps-box"><div className="steps-box-head"><div><span className="eyebrow">STEP-BY-STEP WORKFLOW</span><h2>ขั้นตอนการแก้ไขปัญหาอย่างเป็นลำดับ</h2></div><span className="steps-count-pill">{steps.length} ขั้นตอน</span></div><ol>{steps.map((step, index) => <li key={`step-${index}`}>{typeof step === 'string' ? step.replace(/^\s*\d+[.)]\s*/, '') : step?.text || JSON.stringify(step)}</li>)}</ol></section>}

        {article.pdfFile && <section id="article-pdf" className="pdf-banner"><div className="pdf-banner-info"><span className="pdf-emblem" aria-hidden="true">PDF</span><div><b>คู่มือฉบับสมบูรณ์พร้อมพิมพ์ (PDF A4)</b><p>เปิดอ่านในเบราว์เซอร์หรือดาวน์โหลดเก็บไว้ในเครื่องเพื่อเปิดดูแบบออฟไลน์ได้ทันที</p></div></div><div><a className="print-button" href={assetUrl(article.pdfFile)} target="_blank" rel="noreferrer">เปิดอ่านไฟล์ PDF</a><a className="download-button" href={assetUrl(article.pdfFile)} download>⬇ ดาวน์โหลดไฟล์ PDF</a></div></section>}

        {Array.isArray(article.keywords) && article.keywords.length > 0 && <div className="article-keywords" aria-label="คำสำคัญของบทความ"><b>คำค้นและหัวข้อที่เกี่ยวข้อง:</b><div className="keyword-list">{article.keywords.map((keyword) => <Link key={keyword} className="keyword-tag" to={`/search?q=${encodeURIComponent(keyword)}`}>#{keyword}</Link>)}</div></div>}

        <div id="article-feedback" className="feedback-box"><b>คู่มือนี้ช่วยให้คุณแก้ปัญหาได้สำเร็จหรือไม่?</b><p className="feedback-count">มีผู้ประเมิน {Number(feedbackCount || 0)} คน · มีประโยชน์ {Number(helpfulCount || 0)} คน ({feedbackCount ? Math.round(helpfulCount * 100 / feedbackCount) : 0}%)</p>{voteValue === 'yes' || voteValue === 'no' || storedVote ? <p className="thanks">✓ ขอบคุณสำหรับความคิดเห็นของคุณ เพื่อนำไปพัฒนาคู่มือต่อไป</p> : voteValue ? <p className="feedback-error">{voteValue}</p> : <div><button disabled={sending} onClick={() => sendVote(true)}>👍 มีประโยชน์ ทำตามได้จริง</button><button disabled={sending} onClick={() => sendVote(false)}>👎 ยังไม่ช่วยแก้ปัญหา</button></div>}</div>

        <ContactCard contact={contact.data} title="คู่มือนี้ยังไม่ช่วยแก้ปัญหา? ติดต่อเจ้าหน้าที่ศูนย์ ICT" className="article-contact-card"/>

        <section className="related-section"><div className="section-heading"><div><span className="eyebrow">RELATED GUIDES</span><h2>บทความที่เกี่ยวข้องในหมวดหมู่นี้</h2></div><Link className="text-link" to={`/articles?category=${article.categoryId}`}>ดูทั้งหมดในหมวดนี้ <b>→</b></Link></div>{relatedArticles.length ? <div className="article-grid">{relatedArticles.map((item) => <ArticleCard key={item.articleId} article={item}/>)}</div> : <Link to={`/articles?category=${article.categoryId}`}>ดูบทความเพิ่มเติมในหมวดหมู่นี้ →</Link>}</section>
      </article>

      <aside className="detail-aside">
        <div className="aside-card aside-toc-card">
          <span className="eyebrow">QUICK NAVIGATION</span>
          <b>สารบัญคู่มือนี้</b>
          <nav className="aside-toc-links" aria-label="สารบัญภายในบทความ">
            <a href="#article-intro"><span>01</span> รายละเอียดและคำอธิบาย</a>
            {steps.length > 0 && <a href="#article-steps"><span>02</span> ขั้นตอนการปฏิบัติ ({steps.length} ข้อ)</a>}
            {article.pdfFile && <a href="#article-pdf"><span>03</span> ดาวน์โหลดเอกสารคู่มือ PDF</a>}
            <a href="#article-feedback"><span>{article.pdfFile ? '04' : '03'}</span> ประเมินความพึงพอใจคู่มือ</a>
          </nav>
        </div>

        <div className="aside-card">
          <span className="eyebrow">DOCUMENT INFO</span>
          <b>ข้อมูลคู่มือมาตรฐาน</b>
          <p>หมวดหมู่ <Link to={`/articles?category=${article.categoryId}`}>{article.category?.categoryName}</Link></p>
          <p>เผยแพร่เมื่อ <span>{dateLabel(article.publishedAt || article.createdAt)}</span></p>
          <p>แก้ไขล่าสุด <span>{dateLabel(article.updatedAt)}</span></p>
          <p>จำนวนขั้นตอน <span>{steps.length} ขั้นตอน</span></p>
          <p>จำนวนเข้าชม <span>{Number(article.viewCount || 0).toLocaleString('th-TH')} ครั้ง</span></p>
          {article.pdfFile && <a className="aside-pdf-cta" href={assetUrl(article.pdfFile)} download>⬇ ดาวน์โหลดคู่มือ PDF (A4)</a>}
        </div>

        {relatedArticles.length > 0 && <div className="aside-card aside-related-card">
          <span className="eyebrow">MORE IN THIS TOPIC</span>
          <b>คู่มืออื่นในหมวดเดียวกัน</b>
          <div className="aside-related-list">
            {relatedArticles.map((item, idx) => <Link key={item.articleId} to={`/articles/${item.articleId}`} className="aside-related-item">
              <span className="aside-related-num">{idx + 1}</span>
              <div>
                <b>{item.title}</b>
                <small>◷ เข้าชม {Number(item.viewCount || 0).toLocaleString('th-TH')} ครั้ง</small>
              </div>
            </Link>)}
          </div>
        </div>}

        <div className="aside-card aside-help-card">
          <span className="eyebrow">NEED ASSISTANCE?</span>
          <b>ต้องการความช่วยเหลือเพิ่มเติม?</b>
          <p className="aside-help-copy">หากทำตามขั้นตอนแล้วยังพบปัญหา สามารถติดต่อเจ้าหน้าที่ศูนย์ ICT เทศบาลนครขอนแก่นได้ในเวลาทำการ</p>
          {contact.data?.phone && <div className="aside-help-phone"><span>โทรศัพท์</span><b>{contact.data.phone}</b></div>}
          {quickHelpHref ? <a className="aside-help-btn" href={quickHelpHref}>ติดต่อเจ้าหน้าที่ศูนย์ ICT →</a> : <Link className="aside-help-btn" to="/articles">ดูหมวดหมู่คู่มือทั้งหมด →</Link>}
        </div>
      </aside>
    </div>
    {lightbox && <div className="lightbox" role="dialog" aria-modal="true" aria-label="ภาพประกอบขนาดใหญ่" onClick={() => setLightbox(false)}><button onClick={() => setLightbox(false)} aria-label="ปิดภาพ">×</button><img src={assetUrl(article.image)} alt={`ภาพประกอบ ${article.title}`}/></div>}
  </main>
}

function PublicLayout() { return <><Header/><Outlet/><Footer/></> }

function App() {
  return <Routes>
    <Route path="/admin/login" element={<AdminLoginPage/>}/>
    <Route path="/admin" element={<AdminPage/>}>
      <Route index element={<AdminHome/>}/>
      <Route path="articles" element={<ArticleList/>}/>
      <Route path="articles/new" element={<ArticleEditor/>}/>
      <Route path="articles/:id/edit" element={<ArticleEditor/>}/>
      <Route path="categories" element={<CategoryManager/>}/>
      <Route path="settings" element={<ContactSettings/>}/>
      <Route path="*" element={<AdminHome/>}/>
    </Route>
    <Route element={<PublicLayout/>}>
      <Route path="/" element={<HomePage/>}/>
      <Route path="/articles" element={<ArticlesPage/>}/>
      <Route path="/search" element={<ArticlesPage search/>}/>
      <Route path="/articles/:id" element={<ArticlePage/>}/>
      <Route path="*" element={<NotFoundPage/>}/>
    </Route>
  </Routes>
}

export default App
