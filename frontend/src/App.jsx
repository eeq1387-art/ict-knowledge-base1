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
  let isAdmin = false
  try { isAdmin = Boolean(window.sessionStorage.getItem('ict-admin-token')) } catch { /* Storage can be disabled by browser policy. */ }
  return <>
    <div className="utility"><div className="shell utility-inner"><span>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น (KKICT)</span><span>บริการคลังความรู้ดิจิทัล · <a href="https://www.kkict.net/" target="_blank" rel="noreferrer">เว็บไซต์หลัก kkict.net ↗</a></span></div></div>
    <header className="site-header"><div className="shell nav-row">
      <Link className="brand" to="/"><span className="brand-mark">ICT</span><span><b>คลังความรู้ ICT</b><small>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT ขอนแก่น</small></span></Link>
      <nav><NavLink to="/" end>หน้าแรก</NavLink><NavLink to="/articles">คลังความรู้</NavLink></nav>
      <Link className="nav-staff-btn" to={isAdmin ? '/admin' : '/admin/login'}>
        <span className="nav-staff-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </span>
        <span>{isAdmin ? 'ไปที่ระบบจัดการ' : 'เข้าสู่ระบบเจ้าหน้าที่'}</span>
      </Link>
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

const fallbackFooterCategories = [
  { categoryId: 1, categoryName: 'ระบบเครือข่ายและอินเทอร์เน็ต' },
  { categoryId: 2, categoryName: 'คอมพิวเตอร์และอุปกรณ์' },
  { categoryId: 3, categoryName: 'เครื่องพิมพ์และอุปกรณ์สำนักงาน' },
  { categoryId: 4, categoryName: 'โปรแกรมและซอฟต์แวร์' },
  { categoryId: 5, categoryName: 'ระบบสารสนเทศและบริการออนไลน์' },
]

function Footer() {
  const contact = usePublicData('/settings/contact')
  const categories = usePublicData('/categories')
  const info = contact.data || {}
  const phone = (typeof info.phone === 'string' && info.phone.trim()) || '084-583-0208'
  const lineId = (typeof info.lineId === 'string' && info.lineId.trim()) || 'kkict.net'
  const lineUrl = safeHttpsHref(info.lineUrl)
  const email = (typeof info.email === 'string' && info.email.trim()) || 'info.kkict@gmail.com'
  const location = (typeof info.location === 'string' && info.location.trim()) || 'ชั้น 2 ตลาดสดเทศบาล 1 ถนนกลางเมือง ต.ในเมือง อ.เมืองขอนแก่น จ.ขอนแก่น 40000'
  const hours = (typeof info.hours === 'string' && info.hours.trim()) || 'อังคาร – อาทิตย์ เวลา 09:00 – 17:00 น. (หยุดวันจันทร์และวันหยุดนักขัตฤกษ์)'
  const note = typeof info.note === 'string' ? info.note.trim() : ''
  const phoneHref = safePhoneHref(phone)
  const emailHref = safeEmailHref(email)
  const categoryList = Array.isArray(categories.data) && categories.data.length > 0 ? categories.data.slice(0, 6) : fallbackFooterCategories

  return <footer className="site-footer">
    <div className="footer-highlights-wrap">
      <div className="shell footer-highlights">
        <div className="footer-highlight-card">
          <span className="footer-highlight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v3l2 2"/></svg>
          </span>
          <div>
            <b>ค้นหาคู่มือได้ตลอด 24 ชม.</b>
            <small>รวมวิธีแก้ปัญหาไอทีครบทุกหมวดหมู่</small>
          </div>
        </div>
        <div className="footer-highlight-card">
          <span className="footer-highlight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </span>
          <div>
            <b>ขั้นตอนชัดเจน ทำตามง่าย</b>
            <small>อธิบายทีละลำดับพร้อมภาพอินโฟกราฟิก</small>
          </div>
        </div>
        <div className="footer-highlight-card">
          <span className="footer-highlight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
          </span>
          <div>
            <b>ดาวน์โหลดคู่มือ PDF ฟรี</b>
            <small>บันทึกเก็บไว้เปิดดูแบบออฟไลน์ได้ทันที</small>
          </div>
        </div>
        <div className="footer-highlight-card">
          <span className="footer-highlight-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
          <div>
            <b>บริการโดยศูนย์ ICT ขอนแก่น</b>
            <small>มาตรฐานบริการสาธารณะเทศบาลนครขอนแก่น</small>
          </div>
        </div>
      </div>
    </div>

    <div className="footer-main">
      <div className="shell footer-grid">
        <div className="footer-brand-col">
          <Link className="footer-brand-head" to="/">
            <span className="footer-logo-mark">ICT</span>
            <div>
              <b>คลังความรู้และคู่มือบริการไอที (KKICT)</b>
              <small>KHON KAEN ICT LEARNING CENTER</small>
            </div>
          </Link>
          <p className="footer-brand-desc">
            ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น แหล่งรวบรวมคู่มือมาตรฐาน ขั้นตอนการตั้งค่า และวิธีแก้ไขปัญหาด้านเทคโนโลยีสารสนเทศ คอมพิวเตอร์ เครือข่าย และอุปกรณ์สำนักงานด้วยตนเอง สำหรับบุคลากรและประชาชน
          </p>
          <a className="footer-official-link" href="https://www.kkict.net/" target="_blank" rel="noreferrer">
            <span className="official-dot" aria-hidden="true"/>
            <span>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT ขอนแก่น · <b>www.kkict.net ↗</b></span>
          </a>
        </div>

        <nav className="footer-links-col" aria-label="เกี่ยวกับเราและเมนูหลัก">
          <h3>เกี่ยวกับเรา</h3>
          <ul>
            <li><Link to="/">หน้าแรกคลังความรู้</Link></li>
            <li><Link to="/articles">คลังความรู้และคู่มือทั้งหมด</Link></li>
            <li><Link to="/search">ค้นหาวิธีแก้ไขปัญหาไอที</Link></li>
            <li><Link to="/articles?sort=popular">คู่มือยอดนิยมประจำศูนย์</Link></li>
            <li><a href="https://www.kkict.net/" target="_blank" rel="noreferrer">เว็บไซต์หลัก kkict.net ↗</a></li>
            <li><Link to="/admin/login">เข้าสู่ระบบเจ้าหน้าที่</Link></li>
          </ul>
        </nav>

        <nav className="footer-links-col" aria-label="หมวดหมู่บริการ">
          <h3>หมวดหมู่คู่มือบริการ</h3>
          <ul>
            {categoryList.map((cat) => (
              <li key={cat.categoryId}>
                <Link to={`/articles?category=${cat.categoryId}`}>{cat.categoryName}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="footer-contact-col">
          <h3>ติดต่อศูนย์ ICT</h3>
          <ul className="footer-contact-list">
            {location && (
              <li>
                <svg className="contact-inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{location}</span>
              </li>
            )}
            {phone && (
              <li>
                <svg className="contact-inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span>โทรศัพท์: {phoneHref ? <a href={phoneHref}>{phone}</a> : phone}</span>
              </li>
            )}
            {email && (
              <li>
                <svg className="contact-inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <span>อีเมล: {emailHref ? <a href={emailHref}>{email}</a> : email}</span>
              </li>
            )}
            {(lineId || lineUrl) && (
              <li>
                <svg className="contact-inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                <span>LINE: {lineUrl ? <a href={lineUrl} target="_blank" rel="noreferrer">{lineId || 'เปิด LINE'}</a> : lineId}</span>
              </li>
            )}
            {hours && (
              <li>
                <svg className="contact-inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><polyline points="12 6.5 12 12 16 14"/></svg>
                <span>เวลาทำการ: {hours}</span>
              </li>
            )}
          </ul>
          {note && <p className="footer-contact-note">{note}</p>}

          <div className="footer-social-row" aria-label="ช่องทางติดต่อด่วน">
            <a href="https://www.facebook.com/kkict.net" target="_blank" rel="noreferrer" title="Facebook ศูนย์ ICT ขอนแก่น" aria-label="Facebook ศูนย์ ICT ขอนแก่น">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V6.65c0-1.05.29-1.73 1.76-1.73Z"/></svg>
            </a>
            <a href={lineUrl || 'https://www.kkict.net/'} target="_blank" rel="noreferrer" title={`LINE: ${lineId}`} aria-label={`LINE ${lineId}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.36 10.63c0-4.18-4.19-7.58-9.34-7.58S.68 6.45.68 10.63c0 3.75 3.33 6.89 7.82 7.48.3.07.72.2.82.47.1.24.06.62.03.86l-.13.8c-.04.24-.19.93.82.51 1.01-.42 5.45-3.21 7.44-5.5 1.38-1.51 1.88-3.03 1.88-4.62Zm-13.1 2.13H4.41a.49.49 0 0 1-.49-.49V8.71c0-.27.22-.49.49-.49s.49.22.49.49v3.07h1.36c.27 0 .49.22.49.49s-.22.49-.49.49Zm1.93-.49c0 .27-.22.49-.49.49s-.49-.22-.49-.49V8.71c0-.27.22-.49.49-.49s.49.22.49.49v3.56Zm4.44 0c0 .21-.14.4-.34.47-.05.02-.1.02-.15.02-.15 0-.3-.07-.39-.19l-1.83-2.49v2.19c0 .27-.22.49-.49.49s-.49-.22-.49-.49V8.71c0-.21.14-.4.34-.47.05-.02.1-.02.15-.02.15 0 .3.07.39.19l1.83 2.49V8.71c0-.27.22-.49.49-.49s.49.22.49.49v3.56Zm3.06-2.27c.27 0 .49.22.49.49s-.22.49-.49.49h-1.36v.8h1.36c.27 0 .49.22.49.49s-.22.49-.49.49h-1.85a.49.49 0 0 1-.49-.49V8.71c0-.27.22-.49.49-.49h1.85c.27 0 .49.22.49.49s-.22.49-.49.49h-1.36v.8h1.36Z"/></svg>
            </a>
            <a href="https://www.kkict.net/" target="_blank" rel="noreferrer" title="เว็บไซต์หลัก www.kkict.net" aria-label="เว็บไซต์หลัก www.kkict.net">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5a14.5 14.5 0 0 1 3.8 9.5 14.5 14.5 0 0 1-3.8 9.5 14.5 14.5 0 0 1-3.8-9.5A14.5 14.5 0 0 1 12 2.5Z"/></svg>
            </a>
            {emailHref && (
              <a href={emailHref} title={`อีเมล: ${email}`} aria-label={`ส่งอีเมลไปที่ ${email}`}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6.5 9 6 9-6"/></svg>
              </a>
            )}
            {phoneHref && (
              <a href={phoneHref} title={`โทร: ${phone}`} aria-label={`โทร ${phone}`}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="shell footer-bottom-inner">
          <p>Copyright © {new Date().getFullYear()} ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น (KKICT). All rights reserved.</p>
          <div className="footer-bottom-links">
            <a href="https://www.kkict.net/" target="_blank" rel="noreferrer">เว็บไซต์หลัก kkict.net</a>
            <span aria-hidden="true">|</span>
            <Link to="/articles">คลังความรู้ทั้งหมด</Link>
            <span aria-hidden="true">|</span>
            <Link to="/search">ค้นหาคู่มือ</Link>
            <span aria-hidden="true">|</span>
            <Link to="/admin/login">สำหรับเจ้าหน้าที่</Link>
          </div>
        </div>
      </div>
    </div>
  </footer>
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
        </div>
        <div className="article-tools">
          <button className="print-button" onClick={copyLink}>{copied ? '✓ คัดลอกลิงก์แล้ว' : '⧉ คัดลอกลิงก์คู่มือ'}</button>
          <button className="print-button" onClick={() => window.print()}>▤ พิมพ์คู่มือ / บันทึกเป็น PDF</button>
          {article.pdfFile && <a className="download-button hero-pdf-btn" href={assetUrl(article.pdfFile)} download>⬇ ดาวน์โหลด PDF</a>}
          {copyError && <span role="status">{copyError}</span>}
        </div>
      </div>
      <div className="article-hero-art" aria-hidden="true">
        <div className="hero-art-glow"/>
        <div className="hero-art-sheet">
          <div className="hero-art-dots"><i/><i/><i/><span>KKICT GUIDE</span></div>
          <div className="hero-art-body">
            <span className="hero-art-emblem">{categoryIcons[(Number(article.categoryId || 1) - 1) % categoryIcons.length] || '▣'}</span>
            <div className="hero-art-bars"><i/><i/><i/></div>
          </div>
          <span className="hero-art-check">✓</span>
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
        <div className="aside-card aside-master-card">
          <div className="aside-master-head">
            <span className="aside-master-icon" aria-hidden="true">{categoryIcons[(Number(article.categoryId || 1) - 1) % categoryIcons.length] || '▣'}</span>
            <div>
              <span className="eyebrow">ข้อมูลคู่มือ</span>
              <b>รายละเอียดบทความ</b>
            </div>
          </div>

          <div className="aside-stat-tiles">
            <div className="aside-tile">
              <small>จำนวนขั้นตอน</small>
              <b>{steps.length} ขั้นตอน</b>
            </div>
            <div className="aside-tile is-gold">
              <small>จำนวนเข้าชม</small>
              <b>{Number(article.viewCount || 0).toLocaleString('th-TH')} ครั้ง</b>
            </div>
          </div>

          <div className="aside-meta-list">
            <p>หมวดหมู่ <Link to={`/articles?category=${article.categoryId}`}>{article.category?.categoryName}</Link></p>
            <p>เผยแพร่เมื่อ <span>{dateLabel(article.publishedAt || article.createdAt)}</span></p>
            <p>แก้ไขล่าสุด <span>{dateLabel(article.updatedAt)}</span></p>
          </div>

          <nav className="aside-timeline-nav" aria-label="สารบัญภายในบทความ">
            <span className="aside-nav-heading">สารบัญในหน้านี้</span>
            <a href="#article-intro"><i/><span>รายละเอียดและคำอธิบาย</span></a>
            {steps.length > 0 && <a href="#article-steps"><i/><span>ขั้นตอนการปฏิบัติ ({steps.length})</span></a>}
            {article.pdfFile && <a href="#article-pdf"><i/><span>เอกสารคู่มือ PDF</span></a>}
            <a href="#article-feedback"><i/><span>ประเมินความพึงพอใจ</span></a>
          </nav>

          {article.pdfFile && <a className="aside-pdf-cta" href={assetUrl(article.pdfFile)} download>⬇ ดาวน์โหลดคู่มือ PDF (A4)</a>}
        </div>

        {quickHelpHref && <a className="aside-support-pill" href={quickHelpHref}>
          <span className="support-pill-icon" aria-hidden="true">☎</span>
          <div>
            <b>ติดปัญหา สอบถามเจ้าหน้าที่</b>
            <small>{contact.data?.phone ? `โทร ${contact.data.phone} · ศูนย์ ICT ขอนแก่น` : 'ศูนย์พัฒนาทักษะและการเรียนรู้ ICT ขอนแก่น'}</small>
          </div>
          <span className="support-pill-arrow" aria-hidden="true">→</span>
        </a>}
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
