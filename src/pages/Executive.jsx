import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { effStatus, fmtDate, money, daysLeft, billingLabel } from '../util'

const TABS = [
  ['dashboard', '📊', 'Dashboard'],
  ['requests', '📥', 'Requests'],
  ['clinics', '🏥', 'Clinics'],
  ['plans', '💳', 'Fee Plans'],
  ['payments', '🧾', 'Payments'],
]

export default function Executive({ profile, onLogout }) {
  const [tab, setTab] = useState('dashboard')
  const [clinics, setClinics] = useState([])
  const [plans, setPlans] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    const [c, p, pay] = await Promise.all([
      supabase.from('clinics').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('price'),
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
    ])
    const error = c.error || p.error || pay.error
    if (error) notify(error.message, true)
    setClinics(c.data || []); setPlans(p.data || []); setPayments(pay.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function notify(msg, bad = false) {
    setToast({ msg, bad })
    setTimeout(() => setToast(null), 3500)
  }

  // run an RPC / action, then refresh
  async function act(fn, okMsg) {
    const { error } = await fn()
    if (error) { notify(error.message, true); return false }
    notify(okMsg); await load(); return true
  }

  const pending = clinics.filter((c) => c.status === 'pending')
  const ctx = { clinics, plans, payments, act, notify, load }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">🦷 DentCare <small>Executive</small></div>
        <nav>
          {TABS.map(([k, icon, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <span>{icon}</span><span>{label}</span>
              {k === 'requests' && pending.length > 0 && <b className="badge">{pending.length}</b>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="muted">{profile.full_name || 'Executive'}</div>
          <button className="btn small" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h2>{TABS.find((t) => t[0] === tab)[2]}</h2>
          <button className="btn small mobile-only" onClick={onLogout}>Logout</button>
        </header>
        {loading ? <div className="spinner" /> : (
          <>
            {tab === 'dashboard' && <Dashboard {...ctx} go={setTab} />}
            {tab === 'requests' && <Requests {...ctx} />}
            {tab === 'clinics' && <Clinics {...ctx} />}
            {tab === 'plans' && <Plans {...ctx} />}
            {tab === 'payments' && <Payments {...ctx} />}
          </>
        )}
      </main>

      <nav className="tabbar">
        {TABS.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span className="ico">{icon}{k === 'requests' && pending.length > 0 && <b className="badge">{pending.length}</b>}</span>
            <span>{label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      {toast && <div className={'toast' + (toast.bad ? ' bad' : '')}>{toast.msg}</div>}
    </div>
  )
}

/* ------------------------------ Dashboard ------------------------------ */
function Dashboard({ clinics, payments, go }) {
  const s = useMemo(() => {
    const out = { pending: 0, trial: 0, active: 0, expired: 0, suspended: 0 }
    clinics.forEach((c) => { const e = effStatus(c); if (e in out) out[e]++ })
    const now = new Date()
    const month = payments.filter((p) => { const d = new Date(p.paid_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
    const expiring = clinics.filter((c) => {
      const e = effStatus(c)
      const end = e === 'trial' ? c.trial_ends_at : e === 'active' && !c.is_lifetime ? c.subscription_ends_at : null
      const d = daysLeft(end)
      return d !== null && d <= 7 && d >= 0
    })
    return {
      ...out,
      monthRevenue: month.reduce((a, p) => a + Number(p.amount), 0),
      totalRevenue: payments.reduce((a, p) => a + Number(p.amount), 0),
      expiring,
    }
  }, [clinics, payments])

  const stat = (label, value, color, to) => (
    <button className={'stat ' + color} onClick={() => to && go(to)}>
      <div className="v">{value}</div><div className="l">{label}</div>
    </button>
  )

  return (
    <>
      <div className="grid stats">
        {stat('Pending requests', s.pending, 'amber', 'requests')}
        {stat('On trial', s.trial, 'blue', 'clinics')}
        {stat('Active (paid)', s.active, 'green', 'clinics')}
        {stat('Expired', s.expired, 'red', 'clinics')}
        {stat('Suspended', s.suspended, 'gray', 'clinics')}
        {stat('Total clinics', clinics.filter((c) => c.status !== 'pending' && c.status !== 'rejected').length, 'teal', 'clinics')}
      </div>
      <div className="grid two">
        <div className="card"><div className="muted">Revenue this month</div><div className="big">{money(s.monthRevenue)}</div></div>
        <div className="card"><div className="muted">Total revenue</div><div className="big">{money(s.totalRevenue)}</div></div>
      </div>
      <div className="card">
        <h3>Expiring in next 7 days</h3>
        {s.expiring.length === 0 ? <p className="muted">Koi clinic expire nahi ho rahi.</p> : s.expiring.map((c) => {
          const e = effStatus(c)
          const end = e === 'trial' ? c.trial_ends_at : c.subscription_ends_at
          return (
            <div className="row" key={c.id}>
              <div><b>{c.name}</b><div className="muted">{e === 'trial' ? 'Trial' : 'Subscription'} ends {fmtDate(end)}</div></div>
              <span className="pill amber">{daysLeft(end)} day(s)</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------ Requests ------------------------------ */
function Requests({ clinics, act }) {
  const [days, setDays] = useState(30)
  const list = clinics.filter((c) => c.status === 'pending').reverse()
  const rejected = clinics.filter((c) => c.status === 'rejected')

  return (
    <>
      <div className="card inline">
        <label className="inline-label">Trial period (days)
          <input type="number" min="1" value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} style={{ width: 90 }} />
        </label>
      </div>
      {list.length === 0 && <div className="card muted">Koi nayi request nahi hai.</div>}
      {list.map((c) => (
        <div className="card" key={c.id}>
          <div className="row">
            <div>
              <b>{c.name}</b>
              <div className="muted">{c.owner_name} · {c.city || '—'}</div>
              <div className="muted">{c.phone || '—'} · {c.email || '—'}</div>
              <div className="muted">Requested {fmtDate(c.created_at)}</div>
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => act(() => supabase.rpc('approve_clinic', { p_id: c.id, p_trial_days: days }), `${c.name} approved — ${days} din ka trial shuru`)}>Approve</button>
            <button className="btn danger" onClick={() => { if (confirm(`Reject ${c.name}?`)) act(() => supabase.rpc('reject_clinic', { p_id: c.id }), 'Request rejected') }}>Reject</button>
          </div>
        </div>
      ))}
      {rejected.length > 0 && (
        <details className="card">
          <summary>Rejected ({rejected.length})</summary>
          {rejected.map((c) => (
            <div className="row" key={c.id}>
              <div><b>{c.name}</b><div className="muted">{c.owner_name} · {fmtDate(c.created_at)}</div></div>
              <button className="btn small danger" onClick={() => { if (confirm('Delete permanently?')) act(() => supabase.from('clinics').delete().eq('id', c.id), 'Deleted') }}>Delete</button>
            </div>
          ))}
        </details>
      )}
    </>
  )
}

/* ------------------------------ Clinics ------------------------------ */
const STATUS_COLOR = { trial: 'blue', active: 'green', expired: 'red', suspended: 'gray', pending: 'amber', rejected: 'gray' }

function Clinics({ clinics, plans, act, notify }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)

  const rows = clinics
    .filter((c) => c.status !== 'pending' && c.status !== 'rejected')
    .filter((c) => filter === 'all' || effStatus(c) === filter)
    .filter((c) => !q || (c.name + c.owner_name + c.city).toLowerCase().includes(q.toLowerCase()))

  const selected = sel && clinics.find((c) => c.id === sel)

  return (
    <>
      <div className="card inline">
        <input placeholder="Search clinic / owner / city" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {['all', 'trial', 'active', 'expired', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {rows.length === 0 && <div className="card muted">Koi clinic nahi mili.</div>}
      {rows.map((c) => {
        const e = effStatus(c)
        const plan = plans.find((p) => p.id === c.plan_id)
        return (
          <button className="card click" key={c.id} onClick={() => setSel(c.id)}>
            <div className="row">
              <div>
                <b>{c.name}</b>{c.is_test && <span className="pill gray" style={{ marginLeft: 8 }}>TEST</span>}
                <div className="muted">{c.owner_name} · {c.city || '—'}</div>
                <div className="muted">{plan ? plan.name : 'No plan'}{e === 'trial' ? ` · trial ends ${fmtDate(c.trial_ends_at)}` : c.is_lifetime ? ' · lifetime' : c.subscription_ends_at ? ` · till ${fmtDate(c.subscription_ends_at)}` : ''}</div>
              </div>
              <span className={'pill ' + STATUS_COLOR[e]}>{e}</span>
            </div>
          </button>
        )
      })}
      {selected && <ClinicDetail clinic={selected} plans={plans} act={act} notify={notify} close={() => setSel(null)} />}
    </>
  )
}

function ClinicDetail({ clinic: c, plans, act, close }) {
  const e = effStatus(c)
  const activePlans = plans.filter((p) => p.is_active)
  const [planId, setPlanId] = useState(c.plan_id || activePlans[0]?.id || '')
  const plan = plans.find((p) => p.id === planId)
  const [amount, setAmount] = useState(plan ? String(plan.price) : '')
  const [method, setMethod] = useState('Cash')
  const [note, setNote] = useState('')
  const [extend, setExtend] = useState(7)

  useEffect(() => { if (plan) setAmount(String(plan.price)) }, [planId])

  async function pay() {
    if (!plan) return
    const ok = await act(() => supabase.rpc('record_payment', { p_clinic: c.id, p_plan: planId, p_amount: Number(amount), p_method: method, p_note: note || null }), 'Payment recorded')
    if (ok) setNote('')
  }

  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
        <div className="row">
          <h3 style={{ margin: 0 }}>{c.name}</h3>
          <button className="btn small" onClick={close}>Close</button>
        </div>
        <span className={'pill ' + STATUS_COLOR[e]}>{e}</span>
        <div className="kv">
          <div><span>Owner</span>{c.owner_name || '—'}</div>
          <div><span>Phone</span>{c.phone || '—'}</div>
          <div><span>Email</span>{c.email || '—'}</div>
          <div><span>City</span>{c.city || '—'}</div>
          <div><span>Approved</span>{fmtDate(c.approved_at)}</div>
          <div><span>Trial ends</span>{fmtDate(c.trial_ends_at)}</div>
          <div><span>Subscription</span>{c.is_lifetime ? 'Lifetime' : fmtDate(c.subscription_ends_at)}</div>
        </div>

        <h4>Record payment / change plan</h4>
        <label>Plan
          <select value={planId} onChange={(ev) => setPlanId(ev.target.value)}>
            {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name} — {billingLabel[p.billing]} — {money(p.price, p.currency)}</option>)}
          </select>
        </label>
        <div className="two-col">
          <label>Amount<input type="number" value={amount} onChange={(ev) => setAmount(ev.target.value)} /></label>
          <label>Method
            <select value={method} onChange={(ev) => setMethod(ev.target.value)}>
              {['Cash', 'Bank transfer', 'JazzCash', 'Easypaisa', 'Card', 'Other'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <label>Note<input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="optional" /></label>
        <button className="btn primary" onClick={pay} disabled={!plan || !amount}>Save payment & activate</button>

        {!c.is_lifetime && (e === 'trial' || e === 'expired' || e === 'suspended') && (
          <>
            <h4>Extend trial</h4>
            <div className="inline">
              <input type="number" min="1" value={extend} onChange={(ev) => setExtend(Number(ev.target.value) || 1)} style={{ width: 90 }} />
              <span className="muted">days</span>
              <button className="btn" onClick={() => act(() => supabase.rpc('extend_trial', { p_id: c.id, p_days: extend }), 'Trial extended')}>Extend</button>
            </div>
          </>
        )}

        <h4>Control</h4>
        <div className="actions">
          {c.status === 'suspended'
            ? <button className="btn primary" onClick={() => act(() => supabase.rpc('reactivate_clinic', { p_id: c.id }), 'Clinic reactivated')}>Reactivate</button>
            : <button className="btn danger" onClick={() => { if (confirm('Suspend this clinic?')) act(() => supabase.rpc('suspend_clinic', { p_id: c.id }), 'Clinic suspended') }}>Suspend</button>}
          <button className="btn" onClick={() => act(() => supabase.from('clinics').update({ is_test: !c.is_test }).eq('id', c.id), c.is_test ? 'Unmarked as test' : 'Marked as TEST data')}>
            {c.is_test ? 'Unmark test' : 'Mark as test'}
          </button>
          {c.is_test && <button className="btn danger" onClick={async () => { if (confirm('Delete this TEST clinic and its payments?')) { const ok = await act(() => supabase.from('clinics').delete().eq('id', c.id), 'Test clinic deleted'); if (ok) close() } }}>Delete test clinic</button>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Plans ------------------------------ */
function Plans({ plans, clinics, act, notify }) {
  const empty = { id: null, name: '', billing: 'monthly', price: '', currency: 'PKR', is_active: true }
  const [form, setForm] = useState(null)

  async function save(ev) {
    ev.preventDefault()
    const row = { name: form.name.trim(), billing: form.billing, price: Number(form.price), currency: form.currency || 'PKR', is_active: form.is_active }
    if (!row.name || isNaN(row.price)) return notify('Name aur price zaroori hain', true)
    const ok = await act(() => form.id ? supabase.from('plans').update(row).eq('id', form.id) : supabase.from('plans').insert(row), 'Plan saved')
    if (ok) setForm(null)
  }

  return (
    <>
      <button className="btn primary" onClick={() => setForm(empty)}>+ New plan</button>
      {plans.map((p) => {
        const used = clinics.filter((c) => c.plan_id === p.id).length
        return (
          <div className="card" key={p.id}>
            <div className="row">
              <div>
                <b>{p.name}</b> {!p.is_active && <span className="pill gray">inactive</span>}
                <div className="muted">{billingLabel[p.billing]} · {used} clinic(s)</div>
              </div>
              <div className="big small-big">{money(p.price, p.currency)}</div>
            </div>
            <div className="actions">
              <button className="btn small" onClick={() => setForm({ ...p, price: String(p.price) })}>Edit</button>
              <button className="btn small" onClick={() => act(() => supabase.from('plans').update({ is_active: !p.is_active }).eq('id', p.id), p.is_active ? 'Plan deactivated' : 'Plan activated')}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        )
      })}
      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="sheet" onClick={(ev) => ev.stopPropagation()} onSubmit={save}>
            <h3>{form.id ? 'Edit plan' : 'New plan'}</h3>
            <label>Name<input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} required /></label>
            <label>Billing type
              <select value={form.billing} onChange={(ev) => setForm({ ...form, billing: ev.target.value })}>
                <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="lifetime">Lifetime (one time)</option>
              </select>
            </label>
            <div className="two-col">
              <label>Price<input type="number" min="0" value={form.price} onChange={(ev) => setForm({ ...form, price: ev.target.value })} required /></label>
              <label>Currency<input value={form.currency} onChange={(ev) => setForm({ ...form, currency: ev.target.value })} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={form.is_active} onChange={(ev) => setForm({ ...form, is_active: ev.target.checked })} /> Active</label>
            <div className="actions">
              <button className="btn primary">Save</button>
              <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

/* ------------------------------ Payments ------------------------------ */
function Payments({ payments, clinics, plans }) {
  const total = payments.reduce((a, p) => a + Number(p.amount), 0)
  return (
    <>
      <div className="card"><div className="muted">Total collected</div><div className="big">{money(total)}</div></div>
      {payments.length === 0 && <div className="card muted">Abhi koi payment record nahi.</div>}
      {payments.map((p) => {
        const c = clinics.find((x) => x.id === p.clinic_id)
        const pl = plans.find((x) => x.id === p.plan_id)
        return (
          <div className="card" key={p.id}>
            <div className="row">
              <div>
                <b>{c?.name || 'Deleted clinic'}</b>
                <div className="muted">{pl?.name || '—'} · {p.method || '—'} · {fmtDate(p.paid_at)}</div>
                <div className="muted">{p.billing === 'lifetime' ? 'Lifetime' : `${fmtDate(p.period_start)} → ${fmtDate(p.period_end)}`}</div>
                {p.note && <div className="muted">“{p.note}”</div>}
              </div>
              <div className="big small-big">{money(p.amount)}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}
