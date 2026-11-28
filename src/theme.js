// 12 themes: 10 light (gradient) + 2 narm dark. Rang styles.css me [data-theme] se aate hain.
// colors: [primary-1, primary-2, page-tint-1, page-tint-2] (sirf preview ke liye)
export const THEMES = [
  { id: 'mint', key: 'th.mint', dark: false, colors: ['#0f766e', '#0891b2', '#e6fbf6', '#e8f4fd'] },
  { id: 'ocean', key: 'th.ocean', dark: false, colors: ['#1d4ed8', '#0284c7', '#e8f0ff', '#e3f6ff'] },
  { id: 'lavender', key: 'th.lavender', dark: false, colors: ['#7c3aed', '#c026d3', '#f3eaff', '#fde8fb'] },
  { id: 'rose', key: 'th.rose', dark: false, colors: ['#e11d48', '#ea580c', '#ffe9ee', '#fff0e3'] },
  { id: 'meadow', key: 'th.meadow', dark: false, colors: ['#15803d', '#5a9e0a', '#e9f9ea', '#f4fbd9'] },
  { id: 'sunset', key: 'th.sunset', dark: false, colors: ['#ea580c', '#db2777', '#fff1e0', '#ffe4ef'] },
  { id: 'berry', key: 'th.berry', dark: false, colors: ['#be185d', '#6d28d9', '#ffe8f3', '#ece8ff'] },
  { id: 'sky', key: 'th.sky', dark: false, colors: ['#0284c7', '#7c3aed', '#e4f4ff', '#efe8ff'] },
  { id: 'emerald', key: 'th.emerald', dark: false, colors: ['#059669', '#0369a1', '#e3faf0', '#e2f1fb'] },
  { id: 'golden', key: 'th.golden', dark: false, colors: ['#b45309', '#ca8a04', '#fff6dc', '#ffeccf'] },
  { id: 'twilight', key: 'th.twilight', dark: true, colors: ['#8b5cf6', '#ec4899', '#2a2757', '#1f2a4d'] },
  { id: 'oceannight', key: 'th.oceannight', dark: true, colors: ['#0891b2', '#2563eb', '#12344a', '#0f2438'] },
]

const KEY = 'dc_theme'
export const getTheme = () => {
  try { const s = localStorage.getItem(KEY); if (s && THEMES.some((x) => x.id === s)) return s } catch { /* ignore */ }
  return 'mint'
}

export function applyTheme(id) {
  const th = THEMES.find((x) => x.id === id) || THEMES[0]
  document.documentElement.dataset.theme = th.id
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', th.colors[0])
}

export function setTheme(id) {
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
  applyTheme(id)
}
