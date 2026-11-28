import en from './locales/en'
import hi from './locales/hi'
import ar from './locales/ar'
import zh from './locales/zh'
import ja from './locales/ja'
import de from './locales/de'
import fr from './locales/fr'
import es from './locales/es'
import pt from './locales/pt'
import ru from './locales/ru'
import tr from './locales/tr'
import id from './locales/id'

// Nayi zabaan add karne ke liye: locales/xx.js banayein (en.js jaisi keys), yahan import + LANGS me ek line.
const DICTS = { en, hi, ar, zh, ja, de, fr, es, pt, ru, tr, id }

export const LANGS = [
  { code: 'en', name: 'English', regions: 'USA · UK · Asia · Global', locale: 'en-US' },
  { code: 'hi', name: 'Hinglish', regions: 'Pakistan · India', locale: 'en-GB' },
  { code: 'ar', name: 'العربية', regions: 'Middle East · North Africa', locale: 'ar', rtl: true },
  { code: 'zh', name: '简体中文', regions: 'China', locale: 'zh-CN' },
  { code: 'ja', name: '日本語', regions: 'Japan', locale: 'ja-JP' },
  { code: 'de', name: 'Deutsch', regions: 'Germany · Austria · Switzerland', locale: 'de-DE' },
  { code: 'fr', name: 'Français', regions: 'France · Africa · Canada', locale: 'fr-FR' },
  { code: 'es', name: 'Español', regions: 'Spain · Latin America', locale: 'es-ES' },
  { code: 'pt', name: 'Português', regions: 'Brazil · Portugal', locale: 'pt-BR' },
  { code: 'ru', name: 'Русский', regions: 'Russia · Central Asia', locale: 'ru-RU' },
  { code: 'tr', name: 'Türkçe', regions: 'Türkiye', locale: 'tr-TR' },
  { code: 'id', name: 'Bahasa Indonesia', regions: 'Indonesia · Malaysia', locale: 'id-ID' },
]

const KEY = 'dc_lang'

// Pehli baar: browser ki zabaan aur timezone se andaza lagate hain
export function detectLang() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const langs = (navigator.languages || [navigator.language || 'en']).map((l) => l.toLowerCase())
    const first = langs[0] || 'en'
    const base = first.split('-')[0]
    if (['ur', 'hi', 'pa', 'bn'].includes(base)) return 'hi'
    if (first === 'en-in' || first === 'en-pk' || /^Asia\/(Karachi|Kolkata|Calcutta|Dhaka)$/.test(tz)) {
      if (base === 'en' || ['ur', 'hi'].includes(base)) return 'hi'
    }
    if (DICTS[base]) return base
    if (['fa'].includes(base)) return 'ar'
    if (base === 'ms') return 'id'
  } catch { /* ignore */ }
  return 'en'
}

let current = (() => {
  try { const s = localStorage.getItem(KEY); if (s && DICTS[s]) return s } catch { /* ignore */ }
  return detectLang()
})()

export const getLang = () => current
export const getLocale = () => (LANGS.find((l) => l.code === current) || LANGS[0]).locale

export function applyDir() {
  const l = LANGS.find((x) => x.code === current)
  document.documentElement.lang = current === 'hi' ? 'en' : current
  document.documentElement.dir = l?.rtl ? 'rtl' : 'ltr'
}

export function setLang(code) {
  if (!DICTS[code]) return
  current = code
  try { localStorage.setItem(KEY, code) } catch { /* ignore */ }
  applyDir()
  window.dispatchEvent(new Event('dc-lang'))
}

// t('tab.today')  ->  chuni hui zabaan; na mile to English; phir key
export function t(key) {
  return DICTS[current]?.[key] ?? en[key] ?? key
}
