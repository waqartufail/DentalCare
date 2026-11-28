import { useState } from 'react'
import { t, getLocale } from './i18n'

export function useToast() {
  const [toast, setToast] = useState(null)
  const notify = (msg, bad = false) => {
    setToast({ msg, bad })
    setTimeout(() => setToast(null), 4000)
  }
  return [toast, notify]
}

export const isoDate = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const dayStart = (dateStr) => new Date(dateStr + 'T00:00:00')
export const addDays = (dateStr, n) => { const d = dayStart(dateStr); d.setDate(d.getDate() + n); return isoDate(d) }

export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: true }) : '—')
export const fmtDT = (d) => (d ? `${new Date(d).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short' })}, ${fmtTime(d)}` : '—')
export const fmtHM = (min) => { const m = Math.max(0, Math.round(min || 0)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }

export function waLink(phone, text, cc = '92') {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = cc + d.slice(1)
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`
}

export const apptTotal = (a) => (a.appointment_treatments || []).reduce((s, t) => s + Number(t.fee), 0)
export const apptPaid = (a) => (a.patient_payments || []).reduce((s, p) => s + Number(p.amount), 0)

export const STATUS = {
  get scheduled() { return [t('st.scheduled'), 'blue'] }, get arrived() { return [t('st.arrived'), 'amber'] },
  get in_progress() { return [t('st.in_progress'), 'amber'] }, get completed() { return [t('st.completed'), 'green'] },
  get cancelled() { return [t('st.cancelled'), 'gray'] }, get no_show() { return [t('st.no_show'), 'red'] },
}
export const KIND = {
  get new() { return t('kind.new') }, get followup() { return t('kind.followup') }, get lab_delivery() { return t('kind.lab_delivery') },
}
export const ACTIVE = ['scheduled', 'arrived', 'in_progress']
