import { prisma } from './db.js'

export const SEARCH_BLOCKLIST_KEY = 'search-blocklist'
const MAX_CUSTOM_TERMS = 500
const CACHE_TTL_MS = 30 * 1000

// Rude words that are blocked wherever they appear inside a search term.
// Only words that do not occur inside normal Thai/English vocabulary belong here.
const BLOCKED_SUBSTRINGS = [
  'ควย', 'เหี้ย', 'เย็ด', 'ระยำ', 'ส้นตีน', 'อีดอก', 'ดอกทอง', 'กระหรี่', 'จัญไร', 'ชาติหมา',
  'ไอ้สัตว์', 'อีสัตว์', 'พ่อมึง', 'แม่มึง', 'หน้าหี', 'หีแม่', 'เงี่ยน', 'อีช้างเย็ด',
  'fuck', 'shit', 'bitch', 'pussy', 'asshole', 'porn', 'motherf',
]
// Short rude words that are only blocked as a whole term or a whole word,
// because they are also parts of normal words (e.g. หีบ, สัดส่วน, กู้คืน).
const BLOCKED_WHOLE_WORDS = new Set([
  'หี', 'สัด', 'สัส', 'แตด', 'มึง', 'กู', 'เชี่ย', 'ห่า', 'ควาย', 'โง่', 'ไอ้โง่', 'อีโง่',
  'dick', 'cock', 'sex', 'xxx', 'damn', 'wtf',
])

/** Lower-cases, removes spacing/punctuation and collapses repeated letters (ควยยยย → ควย). */
export function normalizeSearchTerm(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('th-TH')
    .replace(/[\s\u200b-\u200d\ufeff.,_\-*+!@#$%^&()=[\]{}|\\/:;"'<>?~`]/g, '')
    .replace(/(.)\1{2,}/gu, '$1')
}

export function isProfaneSearchTerm(value) {
  const raw = String(value ?? '').normalize('NFC').toLocaleLowerCase('th-TH').trim()
  if (!raw) return false
  const compact = normalizeSearchTerm(raw)
  if (BLOCKED_SUBSTRINGS.some((word) => compact.includes(word))) return true
  if (BLOCKED_WHOLE_WORDS.has(compact)) return true
  return raw.split(/\s+/).some((token) => BLOCKED_WHOLE_WORDS.has(normalizeSearchTerm(token)))
}

let cache = { expiresAt: 0, terms: [] }

export async function getCustomBlocklist({ fresh = false } = {}) {
  if (!fresh && cache.expiresAt > Date.now()) return cache.terms
  const setting = await prisma.siteSetting.findUnique({ where: { key: SEARCH_BLOCKLIST_KEY }, select: { value: true } })
  const terms = Array.isArray(setting?.value) ? setting.value.filter((term) => typeof term === 'string' && term.trim()) : []
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, terms }
  return terms
}

async function saveCustomBlocklist(terms) {
  const value = [...new Set(terms)].slice(0, MAX_CUSTOM_TERMS)
  await prisma.siteSetting.upsert({ where: { key: SEARCH_BLOCKLIST_KEY }, create: { key: SEARCH_BLOCKLIST_KEY, value }, update: { value } })
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, terms: value }
  return value
}

export async function addToSearchBlocklist(term) {
  const clean = String(term ?? '').trim().toLocaleLowerCase('th-TH').slice(0, 120)
  if (!clean) return getCustomBlocklist()
  const current = await getCustomBlocklist({ fresh: true })
  if (current.some((item) => normalizeSearchTerm(item) === normalizeSearchTerm(clean))) return current
  return saveCustomBlocklist([...current, clean])
}

export async function removeFromSearchBlocklist(term) {
  const target = normalizeSearchTerm(term)
  const current = await getCustomBlocklist({ fresh: true })
  return saveCustomBlocklist(current.filter((item) => normalizeSearchTerm(item) !== target))
}

/** Returns a synchronous predicate so many terms can be checked with a single settings lookup. */
export async function searchTermBlocker() {
  const custom = new Set((await getCustomBlocklist()).map(normalizeSearchTerm))
  return (term) => isProfaneSearchTerm(term) || custom.has(normalizeSearchTerm(term))
}
