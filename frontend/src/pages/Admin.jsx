import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, clearAdminToken, setAdminToken } from '../services/api'
import AdminManagement from './AdminManagement'

export function AdminLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
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

  return <main className="admin-login-page"><div className="admin-login-card"><Link className="admin-brand" to="/"><span className="brand-mark">ICT</span><span><b>คลังความรู้ ICT</b><small>ระบบสำหรับเจ้าหน้าที่</small></span></Link><div className="admin-login-title"><span className="eyebrow">STAFF ACCESS</span><h1>เข้าสู่ระบบเจ้าหน้าที่</h1><p>กรุณาเข้าสู่ระบบเพื่อจัดการคลังความรู้</p></div><form onSubmit={submit}><label htmlFor="username">ชื่อผู้ใช้</label><input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={80}/><label htmlFor="password">รหัสผ่าน</label><input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={200}/>{error && <p role="alert" className="admin-login-error">{error}</p>}<button disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button></form><Link className="back-home" to="/">← กลับสู่เว็บไซต์</Link></div></main>
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
