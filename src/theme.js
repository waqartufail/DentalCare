// 10 themes: 7 light + 3 dark. Rang styles.css me [data-theme] se aate hain.
export const THEMES = [
  { id: 'teal', key: 'th.teal', dark: false, colors: ['#f4f7f7', '#0f766e', '#ffffff'], bar: '#0f766e' },
  { id: 'ocean', key: 'th.ocean', dark: false, colors: ['#f3f6fd', '#1d4ed8', '#ffffff'], bar: '#1d4ed8' },
  { id: 'purple', key: 'th.purple', dark: false, colors: ['#f6f3fd', '#7c3aed', '#ffffff'], bar: '#7c3aed' },
  { id: 'rose', key: 'th.rose', dark: false, colors: ['#fdf3f5', '#e11d48', '#ffffff'], bar: '#e11d48' },
  { id: 'green', key: 'th.green', dark: false, colors: ['#f2f8f3', '#15803d', '#ffffff'], bar: '#15803d' },
  { id: 'orange', key: 'th.orange', dark: false, colors: ['#fdf6f1', '#ea580c', '#ffffff'], bar: '#ea580c' },
  { id: 'slate', key: 'th.slate', dark: false, colors: ['#f1f3f5', '#334155', '#ffffff'], bar: '#334155' },
  { id: 'midnight', key: 'th.midnight', dark: true, colors: ['#0b1220', '#2dd4bf', '#121b2e'], bar: '#0b1220' },
  { id: 'charcoal', key: 'th.charcoal', dark: true, colors: ['#1a1b1e', '#60a5fa', '#25262b'], bar: '#1a1b1e' },
  { id: 'amoled', key: 'th.amoled', dark: true, colors: ['#000000', '#a78bfa', '#0d0d0d'], bar: '#000000' },
]

const KEY = 'dc_theme'
export const getTheme = () => {
  try { const s = localStorage.getItem(KEY); if (s && THEMES.some((t) => t.id === s)) return s } catch { /* ignore */ }
  try { if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'midnight' } catch { /* ignore */ }
  return 'teal'
}

export function applyTheme(id) {
  const th = THEMES.find((t) => t.id === id) || THEMES[0]
  document.documentElement.dataset.theme = th.id
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', th.bar)
}

export function setTheme(id) {
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
  applyTheme(id)
}
