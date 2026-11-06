import axios from 'axios'

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const client = axios.create({
  baseURL: apiBase,
  timeout: 10000,
})

export function assetUrl(value) {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:')) return value
  const origin = new URL(apiBase, window.location.origin).origin
  return new URL(value, origin).toString()
}

export function getAdminToken() {
  try { return window.sessionStorage.getItem('ict-admin-token') } catch { return null }
}

export function setAdminToken(token) {
  try { window.sessionStorage.setItem('ict-admin-token', token); return true } catch { return false }
}

export function clearAdminToken() {
  try { window.sessionStorage.removeItem('ict-admin-token') } catch { /* Storage may be blocked. */ }
}

client.interceptors.request.use((config) => {
  const token = getAdminToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function messageFrom(error) {
  if (error.response?.status === 404) return 'ไม่พบข้อมูลที่ต้องการ'
  if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK') return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
  return error.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
}

export const api = {
  async get(path) {
    try { return (await client.get(path)).data } catch (error) { throw new Error(messageFrom(error), { cause: error }) }
  },
  async post(path, body) {
    try { return (await client.post(path, body)).data } catch (error) { throw new Error(messageFrom(error), { cause: error }) }
  },
  async put(path, body) {
    try { return (await client.put(path, body)).data } catch (error) { throw new Error(messageFrom(error), { cause: error }) }
  },
  async patch(path, body) {
    try { return (await client.patch(path, body)).data } catch (error) { throw new Error(messageFrom(error), { cause: error }) }
  },
  async delete(path) {
    try { return (await client.delete(path)).data } catch (error) { throw new Error(messageFrom(error), { cause: error }) }
  },
  async download(path, filename) {
    try {
      const response = await client.get(path, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { throw new Error(messageFrom(error), { cause: error }) }
  },
}

// Keep an opaque browser id for one-vote-per-article behavior; the server stores only its hash.
export function feedbackKey() {
  const storageKey = 'ict-feedback-voter'
  let key = null
  try { key = window.localStorage.getItem(storageKey) } catch { /* Use a short-lived key when storage is blocked. */ }
  if (!key) {
    key = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    try { window.localStorage.setItem(storageKey, key) } catch { /* Server-side uniqueness remains active. */ }
  }
  return key
}
