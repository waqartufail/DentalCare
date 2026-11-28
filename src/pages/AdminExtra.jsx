import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fmtDate, money } from '../util'
import { isoDate, fmtTime, fmtHM } from '../lib'
import { t as T } from '../i18n'

const ROLE_LABEL = { admin: 'Admin', doctor: 'Doctor', receptionist: 'Receptionist', lab_technician: 'Lab Technician', helper: 'Helper' }

/* ------------------------------ Overall income / outgoing ------------------------------ */
export function Overview({ expenses }) {
  const [month, setMonth] = useState(isoDate().slice(0, 7))
  const [pay, setPay] = useState(null)
  const [sal, setSal] = useState(null)

  useEffect(() => {
    setPay(null); setSal(null)
    const [y, m] = month.split('-').map(Number)
    const from = new Date(y, m - 1, 1).toISOString()
    const to = new Date(y, m, 1).toISOString()
    supabase.from('patient_payments').select('amount, method, received_at').gte('received_at', from).lt('received_at', to).then(({ data }) => setPay(data || []))
    supabase.from('payroll_payments').select('total, paid_at').gte('paid_at', from).lt('paid_at', to).then(({ data }) => setSal(data || []))
  }, [month])

  if (!pay || !sal) return (<><div className="card"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div><div className="spinner" /></>)

  const income = pay.reduce((a, p) => a + Number(p.amount), 0)
  const exp = expenses.filter((x) => x.expense_date.startsWith(month)).reduce((a, x) => a + Number(x.amount), 0)
  const salaries = sal.reduce((a, p) => a + Number(p.total), 0)
  const out = exp + salaries
  const net = income - out
  const byMethod = {}
  pay.forEach((p) => { const k = p.method || 'Other'; byMethod[k] = (byMethod[k] || 0) + Number(p.amount) })

  return (
    <>
      <div className="card"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid two">
        <div className="card"><div className="muted">Income (patients se)</div><div className="big" style={{ color: 'var(--green)' }}>{money(income)}</div></div>
        <div className="card"><div className="muted">Outgoing</div><div className="big" style={{ color: 'var(--red)' }}>{money(out)}</div></div>
      </div>
      <div className="card">
        <div className="muted">Net (income − outgoing)</div>
        <div className="big" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(net)}</div>
      </div>
      <div className="card">
        <h3>Outgoing detail</h3>
        <div className="row"><span>Expenses</span><b>{money(exp)}</b></div>
        <div className="row"><span>Salaries (payroll paid)</span><b>{money(salaries)}</b></div>
      </div>
      <div className="card">
        <h3>Income by method</h3>
        {Object.keys(byMethod).length === 0 ? <p className="muted">Is mahine koi payment receive nahi hui.</p> :
          Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{money(v)}</b></div>)}
      </div>
    </>
  )
}

/* ------------------------------ Payroll ------------------------------ */
export function Payroll({ clinic, act, notify }) {
  const [month, setMonth] = useState(isoDate().slice(0, 7))
  const [rows, setRows] = useState(null)

  async function load() {
    setRows(null)
    const { data, error } = await supabase.rpc('payroll_for_month', { p_month: month + '-01' })
    if (error) { notify(error.message, true); setRows([]); return }
    setRows(data || [])
  }
  useEffect(() => { load() }, [month])

  const totalPayable = (rows || []).reduce((a, r) => a + Number(r.total), 0)
  const totalPaid = (rows || []).filter((r) => r.paid).reduce((a, r) => a + Number(r.total), 0)
  const stdH = clinic.std_work_minutes / 60

  async function pay(r) {
    if (!confirm(`${r.full_name} ki ${month} ki salary ${money(r.total)} paid mark karein?`)) return
    const ok = await act(() => supabase.rpc('pay_salary', { p_employee: r.employee_id, p_month: month + '-01' }), 'Salary paid mark ho gayi')
    if (ok) load()
  }

  return (
    <>
      <div className="card"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="card muted">
        Overtime: roz {stdH} ghante ke baad ka waqt, sirf un employees ka jin par “Overtime” checkbox on hai. Rate = salary ÷ 30 ÷ {stdH} ghante × {clinic.overtime_multiplier}. Ye Settings me badal sakte hain.
      </div>
      {rows === null ? <div className="spinner" /> : (
        <>
          <div className="grid two">
            <div className="card"><div className="muted">Total payable</div><div className="big small-big">{money(totalPayable)}</div></div>
            <div className="card"><div className="muted">Paid</div><div className="big small-big">{money(totalPaid)}</div></div>
          </div>
          {rows.length === 0 && <div className="card muted">Koi active employee nahi.</div>}
          {rows.map((r) => (
            <div className="card" key={r.employee_id}>
              <div className="row">
                <div><b>{r.full_name}</b> <span className="pill blue">{ROLE_LABEL[r.role] || r.role}</span>
                  <div className="muted">{r.days_present} din hazir · {fmtHM(r.worked_minutes)}</div></div>
                {r.paid ? <span className="pill green">Paid {fmtDate(r.paid_at)}</span> : <span className="pill amber">Unpaid</span>}
              </div>
              <div className="row" style={{ padding: '.15rem 0' }}><span>Base salary</span><span>{money(r.base_salary)}</span></div>
              <div className="row" style={{ padding: '.15rem 0' }}>
                <span>Overtime {r.overtime_enabled ? `(${fmtHM(r.overtime_minutes)})` : <span className="muted">(off)</span>}</span><span>{money(r.overtime_amount)}</span>
              </div>
              <div className="row"><b>Total</b><b>{money(r.total)}</b></div>
              {!r.paid && <div className="actions"><button className="btn small primary" onClick={() => pay(r)}>Mark paid</button></div>}
            </div>
          ))}
        </>
      )}
    </>
  )
}

/* ------------------------------ Staff attendance (Admin view) ------------------------------ */
export function StaffAttendance({ employees }) {
  const [date, setDate] = useState(isoDate())
  const [rows, setRows] = useState(null)
  useEffect(() => {
    setRows(null)
    supabase.from('attendance').select('*').eq('work_date', date).then(({ data }) => setRows(data || []))
  }, [date])

  if (rows === null) return (<><div className="card"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><div className="spinner" /></>)
  const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r]))
  const staff = employees.filter((e) => e.is_active)
  const known = new Set(staff.map((e) => e.user_id))
  const others = rows.filter((r) => !known.has(r.user_id))

  const line = (key, name, role, r) => (
    <div className="card" key={key}>
      <div className="row">
        <div><b>{name}</b> <span className="pill blue">{ROLE_LABEL[role] || role}</span>
          <div className="muted">{r?.check_in ? `${fmtTime(r.check_in)} → ${r.check_out ? fmtTime(r.check_out) : 'abhi tak'}` : 'Attendance mark nahi'}</div></div>
        <div style={{ textAlign: 'right' }}>
          {r?.check_in ? <span className="pill green">Present</span> : <span className="pill gray">Absent</span>}
          {r?.worked_minutes != null && <div className="muted">{fmtHM(r.worked_minutes)}</div>}
          {r?.overtime_minutes > 0 && <span className="pill amber">OT {fmtHM(r.overtime_minutes)}</span>}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="card"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {staff.map((e) => line(e.id, e.full_name, e.role, byUser[e.user_id]))}
      {others.map((r) => line(r.id, 'Admin / Owner', 'admin', r))}
      {staff.length === 0 && others.length === 0 && <div className="card muted">Koi staff register nahi.</div>}
    </>
  )
}

/* ------------------------------ Settings ------------------------------ */
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']]

// Logo ko chhota (max 512px) karke PNG me badal deta hai taake tez load ho
function resizeImage(file, max = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width || max
      const h = img.naturalHeight || img.height || max
      const k = Math.min(1, max / Math.max(w, h))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image convert nahi hui'))), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ye image file parhi nahi ja saki')) }
    img.src = url
  })
}

function LogoCard({ clinic, notify, onSaved }) {
  const [busy, setBusy] = useState(false)
  const path = `${clinic.id}/logo.png`

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Sirf image file chunein (PNG, JPG, SVG...)', true)
    if (file.size > 8 * 1024 * 1024) return notify('Image 8 MB se chhoti honi chahiye', true)
    setBusy(true)
    try {
      const blob = await resizeImage(file)
      const up = await supabase.storage.from('clinic-logos').upload(path, blob, { upsert: true, contentType: 'image/png', cacheControl: '3600' })
      if (up.error) throw up.error
      const { data } = supabase.storage.from('clinic-logos').getPublicUrl(path)
      const { error } = await supabase.rpc('set_clinic_logo', { p_url: `${data.publicUrl}?v=${Date.now()}` })
      if (error) throw error
      notify('Logo save ho gaya ✅')
      onSaved()
    } catch (err) {
      notify(err.message + ' (07_phase4.sql chali hui ho aur "clinic-logos" bucket bana ho)', true)
    }
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    await supabase.storage.from('clinic-logos').remove([path])
    const { error } = await supabase.rpc('set_clinic_logo', { p_url: null })
    setBusy(false)
    if (error) return notify(error.message, true)
    notify('Logo hata diya gaya')
    onSaved()
  }

  return (
    <div className="card">
      <h3>{T('logo.title')}</h3>
      <div className="clinic-head" style={{ marginBottom: '.6rem' }}>
        {clinic.logo_url ? <img src={clinic.logo_url} alt="" /> : <span className="logo-fallback">🦷</span>}
        <b>{clinic.name}</b>
      </div>
      <p className="muted">Ye logo clinic ke har user ko login ke baad upar naam ke sath dikhega. Square ya lamba, kisi bhi shakal ka PNG/JPG/SVG chalega, screen ke hisab se khud adjust hota hai.</p>
      <div className="actions">
        <label className="btn primary" style={{ margin: 0, cursor: 'pointer', color: 'var(--on-primary)' }}>
          {busy ? T('auth.wait') : T('logo.upload')}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} style={{ display: 'none' }} />
        </label>
        {clinic.logo_url && <button type="button" className="btn danger" disabled={busy} onClick={remove}>{T('logo.remove')}</button>}
      </div>
    </div>
  )
}

export function Settings({ clinic, notify, onSaved }) {
  const [f, setF] = useState({
    open_time: (clinic.open_time || '09:00').slice(0, 5), close_time: (clinic.close_time || '17:00').slice(0, 5),
    working_days: clinic.working_days || [1, 2, 3, 4, 5, 6], slot_minutes: clinic.slot_minutes,
    noshow_grace_minutes: clinic.noshow_grace_minutes, reminder_minutes: clinic.reminder_minutes,
    followup_minutes: clinic.followup_minutes, followup_fee: clinic.followup_fee,
    std_hours: clinic.std_work_minutes / 60, overtime_multiplier: clinic.overtime_multiplier,
    country_code: clinic.country_code, lat: clinic.lat ?? '', lng: clinic.lng ?? '', radius_m: clinic.radius_m,
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggleDay = (d) => setF({ ...f, working_days: f.working_days.includes(d) ? f.working_days.filter((x) => x !== d) : [...f.working_days, d] })

  function here() {
    if (!navigator.geolocation) return notify('Is browser me location support nahi', true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((s) => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })); notify(`Location mil gayi (±${Math.round(p.coords.accuracy)} m). Save karna na bhoolein`) },
      () => notify('Location ki permission allow karein', true),
      { enableHighAccuracy: true, timeout: 20000 })
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const p = {
      open_time: f.open_time, close_time: f.close_time, working_days: f.working_days,
      slot_minutes: Number(f.slot_minutes), noshow_grace_minutes: Number(f.noshow_grace_minutes), reminder_minutes: Number(f.reminder_minutes),
      followup_minutes: Number(f.followup_minutes), followup_fee: Number(f.followup_fee || 0),
      std_work_minutes: Math.round(Number(f.std_hours) * 60), overtime_multiplier: Number(f.overtime_multiplier),
      country_code: String(f.country_code), radius_m: Number(f.radius_m),
    }
    if (f.lat !== '' && f.lng !== '') { p.lat = Number(f.lat); p.lng = Number(f.lng) }
    const { error } = await supabase.rpc('update_clinic_settings', { p })
    setBusy(false)
    if (error) return notify(error.message, true)
    notify('Settings save ho gayin')
    onSaved()
  }

  return (
    <>
    <LogoCard clinic={clinic} notify={notify} onSaved={onSaved} />
    <form onSubmit={save}>
      <div className="card">
        <h3>Appointments</h3>
        <div className="two-col">
          <label>Clinic khulne ka waqt<input type="time" value={f.open_time} onChange={set('open_time')} required /></label>
          <label>Band hone ka waqt<input type="time" value={f.close_time} onChange={set('close_time')} required /></label>
        </div>
        <label>Working days</label>
        <div className="chips">{DAYS.map(([d, l]) => <button type="button" key={d} className={f.working_days.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>{l}</button>)}</div>
        <div className="two-col">
          <label>Slot (minutes)<input type="number" min="5" max="240" value={f.slot_minutes} onChange={set('slot_minutes')} required /></label>
          <label>Auto-cancel (late minutes)<input type="number" min="0" value={f.noshow_grace_minutes} onChange={set('noshow_grace_minutes')} required /></label>
        </div>
        <p className="muted">Patient appointment ke itne minute baad bhi na aaye to appointment cancel hokar agle khali slot me chali jati hai.</p>
        <label>WhatsApp reminder (appointment se kitne minute pehle)<input type="number" min="5" value={f.reminder_minutes} onChange={set('reminder_minutes')} required /></label>
        <label>Country code (phone numbers ke liye)<input value={f.country_code} onChange={set('country_code')} inputMode="numeric" /></label>
      </div>

      <div className="card">
        <h3>Follow-up</h3>
        <div className="two-col">
          <label>Follow-up kitne minute ka<input type="number" min="5" value={f.followup_minutes} onChange={set('followup_minutes')} required /></label>
          <label>Follow-up fee (0 bhi ho sakti hai)<input type="number" min="0" value={f.followup_fee} onChange={set('followup_fee')} required inputMode="decimal" /></label>
        </div>
      </div>

      <div className="card">
        <h3>Overtime</h3>
        <div className="two-col">
          <label>Roz ke kaam ke ghante<input type="number" min="1" max="24" step="0.5" value={f.std_hours} onChange={set('std_hours')} required /></label>
          <label>Overtime multiplier<input type="number" min="0" step="0.25" value={f.overtime_multiplier} onChange={set('overtime_multiplier')} required /></label>
        </div>
        <p className="muted">Multiplier 1 = normal rate, 1.5 = dedh guna. Overtime sirf unka jin ke employee record me “Overtime” checkbox on hai.</p>
      </div>

      <div className="card">
        <h3>Attendance location</h3>
        <p className="muted">Staff ki attendance sirf is jagah ke qareeb mark hogi. Is button ko clinic ke andar khade ho kar dabayein.</p>
        <button type="button" className="btn" onClick={here}>📍 Meri maujooda location set karein</button>
        <div className="two-col">
          <label>Latitude<input value={f.lat} onChange={set('lat')} inputMode="decimal" /></label>
          <label>Longitude<input value={f.lng} onChange={set('lng')} inputMode="decimal" /></label>
        </div>
        <label>Allowed radius (meter)<input type="number" min="20" value={f.radius_m} onChange={set('radius_m')} required /></label>
        {f.lat === '' && <div className="alert">Jab tak location set nahi hogi, kisi ki attendance mark nahi hogi.</div>}
      </div>

      <button className="btn primary" disabled={busy}>{busy ? T('auth.wait') : T('c.save')}</button>
    </form>
    </>
  )
}
