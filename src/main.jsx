import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { applyTheme, getTheme } from './theme'
import { applyDir } from './i18n'
import './styles.css'

applyTheme(getTheme())
applyDir()

createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
}
