import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { effStatus, fmtDate, money, daysLeft, billingLabel } from '../util'
import Attendance from '../components/Attendance'
import { Overview, Payroll, StaffAttendance, Settings } from './AdminExtra'

const TABS = [
  ['dashboard', '📊', 'Dashboard'],
  ['treatments', '🦷', 'Treatments'],
  ['staff', '👥', 'Staff'],
  ['finance', '💰', 'Finance'],
  ['settings', '⚙️', 'Settings'],
]
const ROLES = { admin: 'Admin', doctor: 'Doctor', receptionist: 'Receptionist', lab_technician: 'Lab Technician', helper: 'Helper' }
const CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Lab', 'Materials', 'Equipment', 'Maintenance', 'Marketing', 'Other']

const iso = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const today = () => iso(new Date())
const monthStart = (d = new Date()) => iso(new Date(d.getFullYear(), d.getMonth(), 1))
const monthEnd = (d = new Date()) => iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))

export default function Admin({ profile, clinic, onLogout, onClinicChanged }) {
  const [tab, setTab] = useState('dashboard')
  const [treatments, setTreatments] = useState([])
  const [employees, setEmployees] = useState([])
  const [expenses, setExpenses] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  function notify(msg, bad = false) {
    setToast({ msg, bad })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    const [t, e, x, p] = await Promise.all([
      supabase.from('treatments').select('*').order('name'),
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('plans').select('*'),
    ])
    const error = t.error || e.error || x.error
    if (error) notify(error.message, true)
    setTreatments(t.data || []); setEmployees(e.data || []); setExpenses(x.data || []); setPlans(p.data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(fn, okMsg) {
    const { error } = await fn()
    if (error) {
      const m = error.message || ''
      notify(m.includes('duplicate key') && m.includes('email') ? 'Ye email pehle se kisi employee ke liye registered hai'
        : m.includes('foreign key') ? 'Is record ka data (appointments/history) maujood hai, delete ke bajaye Deactivate karein' : m, true)
      return false
    }
    if (okMsg) notify(okMsg)
    await load()
    return true
  }

  const ctx = { clinic, treatments, employees, expenses, plans, act, notify, load }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">🦷 {clinic.name}<small>Admin</small></div>
        <nav>
          {TABS.map(([k, icon, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{icon}</span><span>{label}</span></button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="muted">{profile.full_name}</div>
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
            {tab === 'dashboard' && <Dashboard {...ctx} go={setTab} onClinicChanged={onClinicChanged} userId={profile.id} />}
            {tab === 'treatments' && <Treatments {...ctx} />}
            {tab === 'staff' && <Staff {...ctx} />}
            {tab === 'finance' && <Finance {...ctx} userId={profile.id} />}
            {tab === 'settings' && <Settings clinic={clinic} notify={notify} onSaved={onClinicChanged} />}
          </>
        )}
      </main>

      <nav className="tabbar">
        {TABS.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span className="ico">{icon}</span><span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && <div className={'toast' + (toast.bad ? ' bad' : '')}>{toast.msg}</div>}
    </div>
  )
}

/* ------------------------------ Dashboard ------------------------------ */
function Dashboard({ clinic, plans, treatments, employees, expenses, go, act, onClinicChanged, userId }) {
  const [edit, setEdit] = useState(false)
  const state = effStatus(clinic)
  const plan = plans.find((p) => p.id === clinic.plan_id)
  const monthExp = expenses.filter((x) => x.expense_date >= monthStart() && x.expense_date <= monthEnd()).reduce((a, x) => a + Number(x.amount), 0)

  let subLine, left = null
  if (state === 'trial') { left = daysLeft(clinic.trial_ends_at); subLine = `Free trial · ends ${fmtDate(clinic.trial_ends_at)}` }
  else if (clinic.is_lifetime) subLine = `${plan?.name || 'Lifetime'} · lifetime access`
  else { left = daysLeft(clinic.subscription_ends_at); subLine = `${plan?.name || 'Subscription'} (${billingLabel[plan?.billing] || ''}) · till ${fmtDate(clinic.subscription_ends_at)}` }

  return (
    <>
      <div className="card">
        <div className="row">
          <div>
            <b style={{ fontSize: '1.1rem' }}>{clinic.name}</b>
            <div className="muted">{[clinic.city, clinic.phone].filter(Boolean).join(' · ') || 'Clinic details add karein'}</div>
            <div className="muted">{subLine}</div>
          </div>
          <span className={'pill ' + (state === 'trial' ? 'blue' : 'green')}>{state}</span>
        </div>
        {left !== null && left <= 7 && <div className="alert">Sirf {Math.max(left, 0)} din baqi hain. Renew ke liye Executive se rabta karein.</div>}
        <div className="actions"><button className="btn small" onClick={() => setEdit(true)}>Edit clinic profile</button></div>
      </div>

      <div className="grid stats">
        <button className="stat teal" onClick={() => go('treatments')}><div className="v">{treatments.filter((t) => t.is_active).length}</div><div className="l">Active treatments</div></button>
        <button className="stat blue" onClick={() => go('staff')}><div className="v">{employees.filter((e) => e.is_active).length}</div><div className="l">Active staff</div></button>
        <button className="stat amber" onClick={() => go('finance')}><div className="v" style={{ fontSize: '1.3rem' }}>{money(monthExp)}</div><div className="l">Expenses this month</div></button>
      </div>

      <div className="card">
        <h3>Shuruat kaise karein</h3>
        <div className="row"><span>1. Settings: timing, slot, follow-up, attendance location</span><button className="btn small" onClick={() => go('settings')}>Open</button></div>
        <div className="row"><span>2. Treatments aur unki fee add karein</span><button className="btn small" onClick={() => go('treatments')}>Open</button></div>
        <div className="row"><span>3. Doctor / Receptionist / Lab / Helper register karein</span><button className="btn small" onClick={() => go('staff')}>Open</button></div>
        <div className="row"><span>4. Expenses aur payroll</span><button className="btn small" onClick={() => go('finance')}>Open</button></div>
      </div>
      <h3>Meri attendance</h3>
      <Attendance userId={userId} />

      {edit && <ClinicEdit clinic={clinic} act={act} close={() => setEdit(false)} onSaved={onClinicChanged} />}
    </>
  )
}

function ClinicEdit({ clinic, close, onSaved, notify }) {
  const [f, setF] = useState({ name: clinic.name || '', phone: clinic.phone || '', city: clinic.city || '', address: clinic.address || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.rpc('update_my_clinic', { p_name: f.name, p_phone: f.phone, p_city: f.city, p_address: f.address })
    if (error) return setErr(error.message)
    close(); onSaved()
  }
  return (
    <div className="modal" onClick={close}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>Clinic profile</h3>
        <label>Clinic name<input value={f.name} onChange={set('name')} required /></label>
        <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
        <label>City<input value={f.city} onChange={set('city')} /></label>
        <label>Address<input value={f.address} onChange={set('address')} /></label>
        {err && <div className="alert">{err}</div>}
        <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={close}>Cancel</button></div>
      </form>
    </div>
  )
}

/* ------------------------------ Treatments ------------------------------ */
function Treatments({ clinic, treatments, act, notify }) {
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const rows = treatments.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()))

  async function save(e) {
    e.preventDefault()
    const row = { name: form.name.trim(), fee: Number(form.fee), is_active: form.is_active, needs_lab: !!form.needs_lab }
    if (!row.name || isNaN(row.fee) || row.fee < 0) return notify('Name aur fee sahi likhein', true)
    const ok = await act(() => form.id ? supabase.from('treatments').update(row).eq('id', form.id) : supabase.from('treatments').insert({ ...row, clinic_id: clinic.id }), 'Treatment saved')
    if (ok) setForm(null)
  }

  return (
    <>
      <div className="card inline">
        <input placeholder="Search treatment" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setForm({ id: null, name: '', fee: '', is_active: true, needs_lab: false })}>+ Add</button>
      </div>
      {rows.length === 0 && <div className="card muted">Abhi koi treatment nahi. “+ Add” se shuru karein (jaise Scaling, Filling, Root Canal).</div>}
      {rows.map((t) => (
        <div className="card" key={t.id}>
          <div className="row">
            <div><b>{t.name}</b> {t.needs_lab && <span className="pill blue">Lab</span>} {!t.is_active && <span className="pill gray">inactive</span>}</div>
            <div className="big small-big">{money(t.fee)}</div>
          </div>
          <div className="actions">
            <button className="btn small" onClick={() => setForm({ ...t, fee: String(t.fee) })}>Edit</button>
            <button className="btn small" onClick={() => act(() => supabase.from('treatments').update({ is_active: !t.is_active }).eq('id', t.id), t.is_active ? 'Treatment inactive' : 'Treatment active')}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn small danger" onClick={() => { if (confirm(`Delete "${t.name}"?`)) act(() => supabase.from('treatments').delete().eq('id', t.id), 'Deleted') }}>Delete</button>
          </div>
        </div>
      ))}
      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{form.id ? 'Edit treatment' : 'New treatment'}</h3>
            <label>Treatment name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></label>
            <label>Fee<input type="number" min="0" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} required inputMode="decimal" /></label>
            <label className="check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
            <label className="check"><input type="checkbox" checked={!!form.needs_lab} onChange={(e) => setForm({ ...form, needs_lab: e.target.checked })} /> Is treatment me Lab ka kaam hai (braces, dentures, crown...)</label>
            <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  )
}

/* ------------------------------ Staff ------------------------------ */
function Staff({ clinic, employees, act, notify }) {
  const [form, setForm] = useState(null)
  const empty = { id: null, full_name: '', email: '', phone: '', role: 'receptionist', joining_date: today(), salary: '', overtime_enabled: false }

  async function save(e) {
    e.preventDefault()
    const row = {
      full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone || null,
      role: form.role, joining_date: form.joining_date || null, salary: form.salary === '' ? null : Number(form.salary), overtime_enabled: !!form.overtime_enabled,
    }
    if (!row.full_name || !row.email) return notify('Name aur email zaroori hain', true)
    const ok = await act(() => form.id ? supabase.from('employees').update(row).eq('id', form.id) : supabase.from('employees').insert({ ...row, clinic_id: clinic.id }), 'Employee saved')
    if (ok) setForm(null)
  }

  return (
    <>
      <button className="btn primary" onClick={() => setForm(empty)}>+ Register employee</button>
      <div className="card muted" style={{ marginTop: '.8rem' }}>
        Employee register karne ke baad usay is app me <b>isi email</b> se “Create account” (ya Google se sign in) karna hoga. Us waqt uska access khud ban jayega.
        <div className="actions"><button className="btn small" onClick={() => { navigator.clipboard?.writeText(window.location.origin + import.meta.env.BASE_URL); notify('App link copy ho gaya') }}>Copy app link</button></div>
      </div>
      {employees.length === 0 && <div className="card muted">Abhi koi employee register nahi.</div>}
      {employees.map((m) => (
        <div className="card" key={m.id}>
          <div className="row">
            <div>
              <b>{m.full_name}</b> {!m.is_active && <span className="pill gray">inactive</span>}
              <div className="muted">{m.email}{m.phone ? ` · ${m.phone}` : ''}</div>
              <div className="muted">{m.user_id ? '✅ Account linked' : '⏳ Sign up ka intezar'}{m.joining_date ? ` · joined ${fmtDate(m.joining_date)}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="pill blue">{ROLES[m.role]}</span>{m.overtime_enabled && <span className="pill amber" style={{ marginLeft: 4 }}>OT</span>}
              {m.salary != null && <div className="muted">{money(m.salary)}/mo</div>}
            </div>
          </div>
          <div className="actions">
            <button className="btn small" onClick={() => setForm({ ...m, phone: m.phone || '', joining_date: m.joining_date || '', salary: m.salary ?? '' })}>Edit</button>
            <button className="btn small" onClick={() => act(() => supabase.from('employees').update({ is_active: !m.is_active }).eq('id', m.id), m.is_active ? 'Access band kar diya' : 'Access bahal kar diya')}>{m.is_active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn small danger" onClick={() => { if (confirm(`${m.full_name} ko delete karein? Unka login access bhi khatam ho jayega.`)) act(() => supabase.from('employees').delete().eq('id', m.id), 'Employee deleted') }}>Delete</button>
          </div>
        </div>
      ))}
      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{form.id ? 'Edit employee' : 'Register employee'}</h3>
            <label>Full name *<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
            <label>Email * <span className="muted">(isi se login karega)</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!form.user_id} />
            </label>
            <label>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="two-col">
              <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></label>
              <label>Joining date<input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} /></label>
            </div>
            <label>Monthly salary (optional)<input type="number" min="0" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} inputMode="decimal" /></label>
            <label className="check"><input type="checkbox" checked={!!form.overtime_enabled} onChange={(e) => setForm({ ...form, overtime_enabled: e.target.checked })} /> Overtime calculate karein (roz ke kaam ke ghanton ke baad)</label>
            <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  )
}

/* ------------------------------ Expenses ------------------------------ */
function Expenses({ clinic, expenses, act, notify, userId }) {
  const [month, setMonth] = useState(today().slice(0, 7))
  const [cat, setCat] = useState('all')
  const [form, setForm] = useState(null)

  const rows = expenses.filter((x) => x.expense_date.startsWith(month) && (cat === 'all' || x.category === cat))
  const total = rows.reduce((a, x) => a + Number(x.amount), 0)

  async function save(e) {
    e.preventDefault()
    const row = { title: form.title.trim(), category: form.category, amount: Number(form.amount), expense_date: form.expense_date, note: form.note || null }
    if (!row.title || !(row.amount > 0)) return notify('Title aur amount (0 se zyada) likhein', true)
    const ok = await act(() => form.id ? supabase.from('expenses').update(row).eq('id', form.id) : supabase.from('expenses').insert({ ...row, clinic_id: clinic.id, created_by: userId }), 'Expense saved')
    if (ok) setForm(null)
  }

  return (
    <>
      <div className="card inline">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="row">
          <div><div className="muted">Total ({rows.length} entries)</div><div className="big">{money(total)}</div></div>
          <button className="btn primary" onClick={() => setForm({ id: null, title: '', category: 'Other', amount: '', expense_date: today(), note: '' })}>+ Add</button>
        </div>
      </div>
      {rows.length === 0 && <div className="card muted">Is mahine koi expense nahi.</div>}
      {rows.map((x) => (
        <div className="card" key={x.id}>
          <div className="row">
            <div>
              <b>{x.title}</b>
              <div className="muted">{x.category} · {fmtDate(x.expense_date)}</div>
              {x.note && <div className="muted">“{x.note}”</div>}
            </div>
            <div className="big small-big">{money(x.amount)}</div>
          </div>
          <div className="actions">
            <button className="btn small" onClick={() => setForm({ ...x, amount: String(x.amount), note: x.note || '' })}>Edit</button>
            <button className="btn small danger" onClick={() => { if (confirm('Is expense ko delete karein?')) act(() => supabase.from('expenses').delete().eq('id', x.id), 'Deleted') }}>Delete</button>
          </div>
        </div>
      ))}
      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{form.id ? 'Edit expense' : 'New expense'}</h3>
            <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus /></label>
            <div className="two-col">
              <label>Category
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {[...new Set([...CATEGORIES, form.category])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Amount<input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required inputMode="decimal" /></label>
            </div>
            <label>Date<input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required /></label>
            <label>Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="optional" /></label>
            <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  )
}

/* ------------------------------ Reports ------------------------------ */
function Reports({ expenses, employees, treatments }) {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(monthEnd())
  const [preset, setPreset] = useState('month')

  function apply(p) {
    const now = new Date()
    setPreset(p)
    if (p === 'month') { setFrom(monthStart(now)); setTo(monthEnd(now)) }
    if (p === 'last') { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); setFrom(monthStart(d)); setTo(monthEnd(d)) }
    if (p === 'year') { setFrom(`${now.getFullYear()}-01-01`); setTo(`${now.getFullYear()}-12-31`) }
  }

  const rows = useMemo(() => expenses.filter((x) => x.expense_date >= from && x.expense_date <= to), [expenses, from, to])
  const total = rows.reduce((a, x) => a + Number(x.amount), 0)
  const byCat = useMemo(() => {
    const m = {}
    rows.forEach((x) => { m[x.category] = (m[x.category] || 0) + Number(x.amount) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])
  const byMonth = useMemo(() => {
    const m = {}
    rows.forEach((x) => { const k = x.expense_date.slice(0, 7); m[k] = (m[k] || 0) + Number(x.amount) })
    return Object.entries(m).sort()
  }, [rows])

  const activeStaff = employees.filter((e) => e.is_active)
  const payroll = activeStaff.reduce((a, e) => a + Number(e.salary || 0), 0)
  const roleCount = Object.keys(ROLES).map((r) => [ROLES[r], activeStaff.filter((e) => e.role === r).length]).filter(([, n]) => n > 0)

  function csv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['Date', 'Title', 'Category', 'Amount', 'Note'].join(',')]
    rows.slice().sort((a, b) => a.expense_date.localeCompare(b.expense_date)).forEach((x) => lines.push([x.expense_date, esc(x.title), esc(x.category), x.amount, esc(x.note)].join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `expenses_${from}_to_${to}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <>
      <div className="chips">
        {[['month', 'This month'], ['last', 'Last month'], ['year', 'This year']].map(([k, l]) => <button key={k} className={preset === k ? 'on' : ''} onClick={() => apply(k)}>{l}</button>)}
      </div>
      <div className="card inline">
        <label className="inline-label" style={{ flex: 1 }}>From<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('') }} /></label>
        <label className="inline-label" style={{ flex: 1 }}>To<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('') }} /></label>
      </div>

      <div className="card">
        <div className="row">
          <div><div className="muted">Total expenses ({rows.length} entries)</div><div className="big">{money(total)}</div></div>
          <button className="btn small" onClick={csv} disabled={rows.length === 0}>Download CSV</button>
        </div>
      </div>

      <div className="card">
        <h3>Category wise</h3>
        {byCat.length === 0 ? <p className="muted">Is muddat me koi expense nahi.</p> : byCat.map(([c, v]) => (
          <div key={c} style={{ marginBottom: '.7rem' }}>
            <div className="row" style={{ padding: 0 }}><span>{c}</span><b>{money(v)}</b></div>
            <div className="bar"><i style={{ width: `${(v / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>

      {byMonth.length > 1 && (
        <div className="card">
          <h3>Month wise</h3>
          {byMonth.map(([m, v]) => <div className="row" key={m}><span>{m}</span><b>{money(v)}</b></div>)}
        </div>
      )}

      <div className="card">
        <h3>Staff summary</h3>
        {roleCount.length === 0 ? <p className="muted">Abhi koi active employee nahi.</p> : roleCount.map(([r, n]) => <div className="row" key={r}><span>{r}</span><b>{n}</b></div>)}
        <div className="row"><span>Monthly payroll (salary wale active staff)</span><b>{money(payroll)}</b></div>
      </div>

      <div className="card">
        <h3>Treatments</h3>
        <div className="row"><span>Active / total</span><b>{treatments.filter((t) => t.is_active).length} / {treatments.length}</b></div>
      </div>

      <div className="card muted">Income, patients aur treatment wise revenue reports tab ban sakengi jab Receptionist ka billing wala phase ban jayega.</div>
    </>
  )
}


/* ------------------------------ Finance (sub tabs) ------------------------------ */
function Finance(props) {
  const [sub, setSub] = useState('overview')
  const subs = [['overview', 'Income / Outgoing'], ['expenses', 'Expenses'], ['payroll', 'Payroll'], ['attendance', 'Staff attendance'], ['reports', 'Reports']]
  return (
    <>
      <div className="chips">{subs.map(([k, l]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{l}</button>)}</div>
      {sub === 'overview' && <Overview {...props} />}
      {sub === 'expenses' && <Expenses {...props} />}
      {sub === 'payroll' && <Payroll {...props} />}
      {sub === 'attendance' && <StaffAttendance {...props} />}
      {sub === 'reports' && <Reports {...props} />}
    </>
  )
}
