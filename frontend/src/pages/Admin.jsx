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

  return <main className="admin-login-page"><div className="admin-login-card">
    <Link className="admin-brand" to="/"><span className="brand-mark">ICT</span><span><b>คลังความรู้ ICT</b><small>ศูนย์พัฒนาทักษะและการเรียนรู้ ICT ขอนแก่น</small></span></Link>
    {mode === 'login' ? <>
      <div className="admin-login-title"><span className="eyebrow">STAFF ACCESS</span><h1>เข้าสู่ระบบเจ้าหน้าที่</h1><p>กรุณาเข้าสู่ระบบเพื่อจัดการคลังความรู้</p></div>
      <form onSubmit={submit}>
        <label htmlFor="username">ชื่อผู้ใช้</label>
        <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={80}/>
        <div className="password-label-row"><label htmlFor="password">รหัสผ่าน</label><button type="button" className="text-action-btn" onClick={() => setShowPass((v) => !v)}>{showPass ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</button></div>
        <input id="password" name="password" type={showPass ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={200}/>
        {notice && <p role="status" className="admin-login-notice">{notice}</p>}
        {error ? <p role="alert" className="admin-login-error">{error}</p> : expired && <p role="status" className="admin-login-error">เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง</p>}
        <button disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
        <div className="login-helper-row"><button type="button" className="text-action-btn" onClick={() => { setMode('reset'); setError(''); setNotice('') }}>ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่?</button></div>
      </form>
    </> : <>
      <div className="admin-login-title"><span className="eyebrow">PASSWORD RECOVERY</span><h1>ตั้งรหัสผ่านใหม่</h1><p>ยืนยันชื่อผู้ใช้และชื่อ-นามสกุลเจ้าหน้าที่ที่ลงทะเบียนไว้เพื่อตั้งรหัสผ่านใหม่</p></div>
      <form onSubmit={submitReset}>
        <label htmlFor="reset-username">ชื่อผู้ใช้ (Username)</label>
        <input id="reset-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ระบุชื่อผู้ใช้" required maxLength={80}/>
        <label htmlFor="reset-fullname">ชื่อ-นามสกุลเจ้าหน้าที่ (ที่ลงทะเบียนไว้)</label>
        <input id="reset-fullname" value={fullname} onChange={(event) => setFullname(event.target.value)} placeholder="ระบุชื่อ-นามสกุลเจ้าหน้าที่" required maxLength={160}/>
        <div className="password-label-row"><label htmlFor="reset-new-password">รหัสผ่านใหม่ (12–200 ตัวอักษร)</label><button type="button" className="text-action-btn" onClick={() => setShowPass((v) => !v)}>{showPass ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</button></div>
        <input id="reset-new-password" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="อย่างน้อย 12 ตัวอักษร" required minLength={12} maxLength={200}/>
        <label htmlFor="reset-confirm-password">ยืนยันรหัสผ่านใหม่</label>
        <input id="reset-confirm-password" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" required minLength={12} maxLength={200}/>
        {error && <p role="alert" className="admin-login-error">{error}</p>}
        <button disabled={busy}>{busy ? 'กำลังบันทึกรหัสผ่านใหม่...' : 'บันทึกรหัสผ่านใหม่'}</button>
        <div className="login-helper-row"><button type="button" className="text-action-btn" onClick={() => { setMode('login'); setError('') }}>← กลับไปหน้าเข้าสู่ระบบ</button></div>
      </form>
    </>}
    <Link className="back-home" to="/">← กลับสู่เว็บไซต์</Link>
  </div></main>
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
