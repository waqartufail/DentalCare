export function effStatus(c) {
  const now = new Date()
  if (c.status === 'trial' && c.trial_ends_at && new Date(c.trial_ends_at) < now) return 'expired'
  if (c.status === 'active' && !c.is_lifetime && c.subscription_ends_at && new Date(c.subscription_ends_at) < now) return 'expired'
  return c.status
}

import { t, getLocale } from './i18n'

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export const money = (n, cur = 'PKR') => `${cur} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function daysLeft(d) {
  if (!d) return null
  return Math.ceil((new Date(d) - new Date()) / 86400000)
}

export const billingLabel = { get monthly() { return t('bill.monthly') }, get yearly() { return t('bill.yearly') }, get lifetime() { return t('bill.lifetime') } }
