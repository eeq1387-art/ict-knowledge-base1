export const CONTACT_SETTING_KEY = 'contact'
export const CONTACT_FIELDS = ['phone', 'lineId', 'lineUrl', 'email', 'location', 'hours', 'note']

export function emptyContactSettings() {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, '']))
}

export function normalizeContactSettings(value) {
  const contact = emptyContactSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return contact
  for (const field of CONTACT_FIELDS) contact[field] = typeof value[field] === 'string' ? value[field] : ''
  return contact
}
