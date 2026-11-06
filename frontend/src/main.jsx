import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled application error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <main className="app-error-boundary" role="alert"><section><h1>ไม่สามารถแสดงหน้านี้ได้</h1><p>กรุณาลองโหลดหน้าเว็บอีกครั้ง หากยังพบปัญหา โปรดติดต่อเจ้าหน้าที่ผู้ดูแลระบบ</p><button onClick={() => window.location.reload()}>โหลดหน้าเว็บอีกครั้ง</button></section></main>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter><ErrorBoundary><App /></ErrorBoundary></BrowserRouter>
  </StrictMode>,
)
