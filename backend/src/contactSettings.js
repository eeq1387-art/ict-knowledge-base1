export const CONTACT_SETTING_KEY = 'contact'
export const CONTACT_FIELDS = ['phone', 'lineId', 'lineUrl', 'email', 'location', 'hours', 'note']
export const DEFAULT_KKICT_CONTACT = {
  phone: '084-583-0208',
  lineId: 'kkict.net',
  lineUrl: 'https://www.kkict.net/',
  email: 'info.kkict@gmail.com',
  location: 'ชั้น 2 ตลาดสดเทศบาล 1 ถนนกลางเมือง ต.ในเมือง อ.เมืองขอนแก่น จ.ขอนแก่น 40000',
  hours: 'อังคาร – อาทิตย์ เวลา 09:00 – 17:00 น. (หยุดวันจันทร์และวันหยุดนักขัตฤกษ์)',
  note: 'ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น บริการพื้นที่การเรียนรู้ ห้องอบรมคอมพิวเตอร์ และให้คำปรึกษาด้านไอที',
}

export function emptyContactSettings() {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, '']))
}

export function normalizeContactSettings(value) {
  const contact = emptyContactSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return contact
  for (const field of CONTACT_FIELDS) contact[field] = typeof value[field] === 'string' ? value[field] : ''
  return contact
}
