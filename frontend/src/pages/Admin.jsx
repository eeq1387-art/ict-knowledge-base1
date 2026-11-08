import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, clearAdminToken, setAdminToken, useDocumentTitle } from '../services/api'
import AdminManagement from './AdminManagement'

export function AdminLoginPage() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullname, setFullname] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get('expired') === '1'
  useDocumentTitle(mode === 'reset' ? 'รีเซ็ตรหัสผ่านเจ้าหน้าที่' : 'เข้าสู่ระบบเจ้าหน้าที่')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.post('/auth/login', { username, password })
      if (!setAdminToken(result.token)) {
        setError('เบราว์เซอร์ไม่อนุญาตให้บันทึกสถานะเข้าสู่ระบบ กรุณาเปิดใช้งาน session storage แล้วลองใหม่')
        return
      }
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitReset(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (newPassword.length < 12) return setError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร')
    if (newPassword !== confirmPassword) return setError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน')
    setBusy(true)
    try {
      const result = await api.post('/auth/reset-password', { username, fullname, newPassword })
      setNotice(result.message || 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว')
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMode('login')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return <main className="admin-login-page">
    <div className="admin-login-shell">
      <aside className="admin-login-showcase" aria-hidden="true">
        <div className="showcase-top">
          <div className="showcase-kicker"><span className="showcase-dot"/> KKICT STAFF PORTAL · เทศบาลนครขอนแก่น</div>
          <h2>ระบบบริหารจัดการ<br/>คลังความรู้ดิจิทัล</h2>
          <p>พื้นที่ทำงานสำหรับเจ้าหน้าที่ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เพื่อดูแลคู่มือไอทีและติดตามสถิติการใช้งานของประชาชน</p>
        </div>

        <div className="showcase-stage">
          <div className="showcase-card-main">
            <div className="showcase-window-head">
              <span className="win-dots"><i/><i/><i/></span>
              <b>KKICT ANALYTICS & CMS</b>
              <span className="showcase-status-pill">● ONLINE</span>
            </div>
            <div className="showcase-metrics-row">
              <div className="showcase-mini-stat">
                <span>คู่มือพร้อมใช้งาน</span>
                <b>18 บทความ</b>
              </div>
              <div className="showcase-mini-stat is-gold">
                <span>บริการประชาชน</span>
                <b>24 ชั่วโมง</b>
              </div>
            </div>
            <svg className="showcase-sparkline" viewBox="0 0 280 76" fill="none">
              <defs>
                <linearGradient id="login-spark-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fde047" stopOpacity="0.42"/>
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0"/>
                </linearGradient>
                <linearGradient id="login-spark-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8"/>
                  <stop offset="55%" stopColor="#fde047"/>
                  <stop offset="100%" stopColor="#f59e0b"/>
                </linearGradient>
              </defs>
              <path d="M8 62 L48 48 L88 52 L128 30 L168 36 L208 18 L248 24 L272 10 L272 72 L8 72 Z" fill="url(#login-spark-fill)"/>
              <path d="M8 62 L48 48 L88 52 L128 30 L168 36 L208 18 L248 24 L272 10" stroke="url(#login-spark-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="208" cy="18" r="4" fill="#fde047"/>
              <circle cx="272" cy="10" r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2"/>
            </svg>
          </div>
          <div className="showcase-float-badge badge-top-right">
            <span className="float-badge-icon">✓</span>
            <div><b>อัปเดตคู่มือเรียลไทม์</b><small>รองรับรูปปก & ไฟล์ PDF</small></div>
          </div>
          <div className="showcase-float-badge badge-bottom-left">
            <span className="float-badge-icon is-gold">★</span>
            <div><b>วิเคราะห์คำค้นหา</b><small>รู้ทันปัญหาที่ผู้ใช้งานค้นหา</small></div>
          </div>
        </div>

        <ul className="showcase-features">
          <li>
            <span className="feature-icon">▤</span>
            <div><b>จัดการบทความและหมวดหมู่ครบวงจร</b><small>สร้าง แก้ไข ตั้งสถานะฉบับร่าง และแนบไฟล์คู่มือ PDF</small></div>
          </li>
          <li>
            <span className="feature-icon">◉</span>
            <div><b>ระบบความปลอดภัยสำหรับเจ้าหน้าที่</b><small>ปกป้องบัญชีด้วยการเข้ารหัสและจำกัดการสุ่มรหัสผ่าน</small></div>
          </li>
        </ul>
      </aside>

      <div className="admin-login-card">
        <div className="login-card-top">
          <Link className="admin-brand" to="/"><span className="brand-mark">ICT</span><span><b>คลังความรู้ ICT</b><small>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT ขอนแก่น</small></span></Link>
          <div className="login-mode-tabs" role="tablist" aria-label="โหมดการเข้าใช้งาน">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>เข้าสู่ระบบ</button>
            <button type="button" role="tab" aria-selected={mode === 'reset'} className={mode === 'reset' ? 'active' : ''} onClick={() => { setMode('reset'); setError(''); setNotice('') }}>ตั้งรหัสใหม่</button>
          </div>
        </div>

        {mode === 'login' ? <>
          <div className="admin-login-title">
            <div className="login-title-head">
              <span className="login-emblem" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <div>
                <span className="eyebrow">STAFF AUTHENTICATION</span>
                <h1>เข้าสู่ระบบเจ้าหน้าที่</h1>
              </div>
            </div>
            <p>กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าสู่ระบบจัดการคลังความรู้</p>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="username">ชื่อผู้ใช้ (Username)</label>
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <input id="username" name="username" autoComplete="username" placeholder="กรอกชื่อผู้ใช้ของเจ้าหน้าที่" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={80}/>
            </div>

            <div className="password-label-row"><label htmlFor="password">รหัสผ่าน (Password)</label><button type="button" className="text-action-btn" onClick={() => setShowPass((v) => !v)}>{showPass ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</button></div>
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input id="password" name="password" type={showPass ? 'text' : 'password'} autoComplete="current-password" placeholder="กรอกรหัสผ่าน" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={200}/>
            </div>

            {notice && <p role="status" className="admin-login-notice">✓ {notice}</p>}
            {error ? <p role="alert" className="admin-login-error">{error}</p> : expired && <p role="status" className="admin-login-error">เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง</p>}
            <button className="login-submit-btn" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบจัดการคลังความรู้ →'}</button>
            <div className="login-helper-row"><button type="button" className="text-action-btn" onClick={() => { setMode('reset'); setError(''); setNotice('') }}>ลืมรหัสผ่าน หรือต้องการตั้งรหัสผ่านใหม่?</button></div>
          </form>
        </> : <>
          <div className="admin-login-title">
            <div className="login-title-head">
              <span className="login-emblem is-gold" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </span>
              <div>
                <span className="eyebrow">PASSWORD RECOVERY</span>
                <h1>ตั้งรหัสผ่านใหม่</h1>
              </div>
            </div>
            <p>ยืนยันชื่อผู้ใช้และชื่อ-นามสกุลเจ้าหน้าที่ที่ลงทะเบียนไว้เพื่อกำหนดรหัสผ่านใหม่</p>
          </div>
          <form onSubmit={submitReset}>
            <label htmlFor="reset-username">ชื่อผู้ใช้ (Username)</label>
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <input id="reset-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ระบุชื่อผู้ใช้" required maxLength={80}/>
            </div>

            <label htmlFor="reset-fullname">ชื่อ-นามสกุลเจ้าหน้าที่ (ที่ลงทะเบียนไว้)</label>
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M14 10h4"/><path d="M14 14h4"/><path d="M5 16c.8-1.3 1.8-2 3-2s2.2.7 3 2"/></svg>
              </span>
              <input id="reset-fullname" value={fullname} onChange={(event) => setFullname(event.target.value)} placeholder="ระบุชื่อ-นามสกุลเจ้าหน้าที่" required maxLength={160}/>
            </div>

            <div className="password-label-row"><label htmlFor="reset-new-password">รหัสผ่านใหม่ (12–200 ตัวอักษร)</label><button type="button" className="text-action-btn" onClick={() => setShowPass((v) => !v)}>{showPass ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</button></div>
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input id="reset-new-password" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="อย่างน้อย 12 ตัวอักษร" required minLength={12} maxLength={200}/>
            </div>

            <label htmlFor="reset-confirm-password">ยืนยันรหัสผ่านใหม่</label>
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </span>
              <input id="reset-confirm-password" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" required minLength={12} maxLength={200}/>
            </div>

            {error && <p role="alert" className="admin-login-error">{error}</p>}
            <button className="login-submit-btn" disabled={busy}>{busy ? 'กำลังบันทึกรหัสผ่านใหม่...' : 'บันทึกรหัสผ่านใหม่ →'}</button>
            <div className="login-helper-row"><button type="button" className="text-action-btn" onClick={() => { setMode('login'); setError('') }}>← กลับไปหน้าเข้าสู่ระบบ</button></div>
          </form>
        </>}
        <div className="login-card-footer">
          <Link className="back-home" to="/">← กลับสู่หน้าเว็บไซต์คลังความรู้</Link>
        </div>
      </div>
    </div>
  </main>
}

export function AdminPage() {
  const [admin, setAdmin] = useState(null)
  const [state, setState] = useState('loading')
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    api.get('/auth/me').then((result) => { if (active) { setAdmin(result.admin); setState('ready') } }).catch(() => { if (active) { clearAdminToken(); setState('unauthorized') } })
    return () => { active = false }
  }, [])

  async function logout() {
    try { await api.post('/auth/logout', {}) } catch { /* Always discard the local token on logout. */ }
    clearAdminToken()
    navigate('/admin/login', { replace: true })
  }

  if (state === 'loading') return <main className="admin-login-page"><p className="loading">กำลังตรวจสอบสิทธิ์...</p></main>
  if (state === 'unauthorized') return <Navigate to="/admin/login" replace/>
  return <AdminManagement admin={admin} onLogout={logout}/>
}
