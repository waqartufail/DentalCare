import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import Shell from '../components/Shell'
import Attendance from '../components/Attendance'
import TreatmentPicker from '../components/TreatmentPicker'
import { useToast, isoDate, addDays, dayStart, fmtTime, fmtDT, waLink, STATUS, KIND, ACTIVE, apptTotal, apptPaid } from '../lib'
import { fmtDate, money } from '../util'
import { t as T } from '../i18n'

export default function Receptionist({ profile, clinic, onLogout }) {
  const [tab, setTab] = useState('today')
  const [date, setDate] = useState(isoDate())
  const [docFilter, setDocFilter] = useState('all')
  const [appts, setAppts] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [treatments, setTreatments] = useState([])
  const [categories, setCategories] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // {type, ...}
  const [toast, notify] = useToast()

  const load = useCallback(async () => {
    const from = dayStart(addDays(isoDate(), -30)).toISOString()
    const to = dayStart(addDays(isoDate(), 61)).toISOString()
    const [a, p, d, t, m, cg] = await Promise.all([
      supabase.from('appointments').select('*, patients(full_name, phone, patient_no), appointment_treatments(*), patient_payments(*)').gte('start_at', from).lt('start_at', to).order('start_at'),
      supabase.from('patients').select('*').order('created_at', { ascending: false }).limit(3000),
      supabase.rpc('list_doctors'),
      supabase.from('treatments').select('*').eq('is_active', true).order('name'),
      supabase.from('message_queue').select('*, patients(full_name)').eq('status', 'pending').order('created_at'),
      supabase.from('treatment_categories').select('*').order('sort_order').order('name'),
    ])
    const err = a.error || p.error || d.error || t.error || m.error
    if (err) notify(err.message, true)
    setAppts(a.data || []); setPatients(p.data || []); setDoctors(d.data || []); setTreatments(t.data || []); setMessages(m.data || []); setCategories(cg.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // har minute: no-show auto cancel, reschedule, reminders
  useEffect(() => {
    const run = () => supabase.rpc('process_appointments').then(() => load())
    run()
    const t = setInterval(run, 60000)
    return () => clearInterval(t)
  }, [load])

  const docName = useMemo(() => Object.fromEntries(doctors.map((d) => [d.id, d.full_name])), [doctors])
  const pendingFollowups = appts.filter((a) => a.status === 'completed' && a.followup_required && !a.followup_booked_id && !a.followup_dismissed)

  async function act(fn, okMsg) {
    const { error } = await fn()
    if (error) { notify(error.message, true); return false }
    if (okMsg) notify(okMsg)
    await load()
    return true
  }

  const ctx = { clinic, appts, patients, doctors, docName, treatments, categories, messages, act, notify, load, setModal }
  const current = modal?.appt ? appts.find((x) => x.id === modal.appt) : null

  return (
    <Shell clinic={clinic} role="role.receptionist" userName={profile.full_name} onLogout={onLogout} toast={toast}
      tabs={[['today', '📅', 'tab.today'], ['patients', '🧑', 'tab.patients'], ['payments', '💵', 'tab.payments'], ['followups', '🔁', 'tab.followups'], ['messages', '💬', 'tab.messages'], ['attendance', '🕒', 'tab.attendance']]}
      tab={tab} setTab={setTab} badges={{ followups: pendingFollowups.length, messages: messages.length }}>
      {tab === 'attendance' ? <Attendance userId={profile.id} /> : loading ? <div className="spinner" /> : (
        <>
          {tab === 'today' && <Today {...ctx} date={date} setDate={setDate} docFilter={docFilter} setDocFilter={setDocFilter} />}
          {tab === 'patients' && <Patients {...ctx} />}
          {tab === 'payments' && <Payments {...ctx} />}
          {tab === 'followups' && <Followups {...ctx} list={pendingFollowups} />}
          {tab === 'messages' && <Messages {...ctx} />}
        </>
      )}

      {modal?.type === 'book' && <BookModal {...ctx} prePatient={modal.patient} close={() => setModal(null)} />}
      {modal?.type === 'lines' && current && <LinesModal {...ctx} appt={current} close={() => setModal(null)} />}
      {modal?.type === 'pay' && current && <PayModal {...ctx} appt={current} close={() => setModal(null)} />}
      {modal?.type === 'followup' && current && <FollowupModal {...ctx} appt={current} close={() => setModal(null)} />}
      {modal?.type === 'patient' && <PatientModal {...ctx} patient={modal.patient} close={() => setModal(null)} />}
      {modal?.type === 'register' && <RegisterModal {...ctx} initial={modal.initial} close={() => setModal(null)} />}
    </Shell>
  )
}

/* ============================== TODAY ============================== */
function Today({ appts, doctors, docName, date, setDate, docFilter, setDocFilter, act, setModal }) {
  const day = appts.filter((a) => isoDate(a.start_at) === date && (docFilter === 'all' || a.doctor_id === docFilter))
  const tokens = useMemo(() => {
    const m = {}
    const per = {}
    day.filter((a) => ACTIVE.includes(a.status)).forEach((a) => { per[a.doctor_id] = (per[a.doctor_id] || 0) + 1; m[a.id] = per[a.doctor_id] })
    return m
  }, [day])

  return (
    <>
      <div className="card inline">
        <button className="btn small" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn small" onClick={() => setDate(addDays(date, 1))}>›</button>
        <select value={docFilter} onChange={(e) => setDocFilter(e.target.value)}>
          <option value="all">All doctors</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
        </select>
      </div>
      <button className="btn primary" onClick={() => setModal({ type: 'book' })}>{T('b.new_appt')}</button>
      <div style={{ height: '.8rem' }} />
      {day.length === 0 && <div className="card muted">Is din koi appointment nahi.</div>}
      {day.map((a) => {
        const [label, color] = STATUS[a.status]
        const total = apptTotal(a), paid = apptPaid(a)
        const child = appts.find((x) => x.rescheduled_from === a.id)
        return (
          <div className="card" key={a.id}>
            <div className="row">
              <div>
                <b>{tokens[a.id] ? `#${tokens[a.id]} · ` : ''}{a.patients?.full_name}</b> <span className="pill gray">ID #{a.patients?.patient_no}</span>
                <div className="muted">{fmtTime(a.start_at)} – {fmtTime(a.end_at)} · Dr. {docName[a.doctor_id] || '—'} · {KIND[a.kind]}</div>
                {a.rescheduled_from && <div className="muted">🔄 Auto-reschedule ki gayi</div>}
                {child && <div className="muted">➡️ Nayi appointment: {fmtDT(child.start_at)}</div>}
                {(a.appointment_treatments || []).length > 0 && <div className="muted">{a.appointment_treatments.map((t) => t.name).join(', ')}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={'pill ' + color}>{label}</span>
                {total > 0 && <div className="muted">{money(paid)} / {money(total)}</div>}
              </div>
            </div>
            {!['cancelled', 'no_show'].includes(a.status) && (
              <div className="actions">
                {a.status === 'scheduled' && <button className="btn small primary" onClick={() => act(() => supabase.from('appointments').update({ status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', a.id), 'Patient arrived mark hua')}>{T('b.arrived')}</button>}
                <button className="btn small" onClick={() => setModal({ type: 'lines', appt: a.id })}>{T('b.treatments')}</button>
                <button className="btn small" onClick={() => setModal({ type: 'pay', appt: a.id })}>{T('b.payment')}</button>
                {a.status === 'scheduled' && <button className="btn small danger" onClick={() => { if (confirm('Appointment cancel karein? Slot khali ho jayega.')) act(() => supabase.from('appointments').update({ status: 'cancelled' }).eq('id', a.id), 'Cancelled') }}>{T('c.cancel')}</button>}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ============================== PATIENTS ============================== */
function Patients({ patients, setModal }) {
  const [q, setQ] = useState('')
  const rows = patients.filter((p) => !q || (p.full_name + (p.phone || '') + p.patient_no).toLowerCase().includes(q.toLowerCase())).slice(0, 60)
  return (
    <>
      <div className="card inline">
        <input placeholder="Naam / phone / ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setModal({ type: 'register' })}>{T('b.register_patient')}</button>
      </div>
      {rows.length === 0 && <div className="card muted">Koi patient nahi mila.</div>}
      {rows.map((p) => (
        <button className="card click" key={p.id} onClick={() => setModal({ type: 'patient', patient: p })}>
          <div className="row"><div><b>{p.full_name}</b> <span className="pill gray">ID #{p.patient_no}</span><div className="muted">{p.phone || '—'}{p.age ? ` · ${p.age} yrs` : ''}</div></div><span className="muted">›</span></div>
        </button>
      ))}
    </>
  )
}

function PatientForm({ clinic, patients, initial, onSaved, onCancel, notify }) {
  const [f, setF] = useState({ full_name: '', phone: '', gender: '', age: '', address: '', ...initial })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const dup = !initial?.id && f.phone.trim().length >= 7 && patients.find((p) => (p.phone || '').replace(/\D/g, '') === f.phone.replace(/\D/g, ''))

  async function submit(e) {
    e.preventDefault()
    if (!f.full_name.trim()) return notify('Patient ka naam likhein', true)
    setBusy(true)
    const row = { full_name: f.full_name.trim(), phone: f.phone.trim() || null, gender: f.gender || null, age: f.age === '' ? null : Number(f.age), address: f.address || null }
    const q = initial?.id ? supabase.from('patients').update(row).eq('id', initial.id) : supabase.from('patients').insert({ ...row, clinic_id: clinic.id })
    const { data, error } = await q.select().single()
    setBusy(false)
    if (error) return notify(error.message, true)
    onSaved(data)
  }

  return (
    <form onSubmit={submit}>
      <label>Naam *<input value={f.full_name} onChange={set('full_name')} required autoFocus /></label>
      <label>Phone (WhatsApp)<input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="03xx xxxxxxx" /></label>
      {dup && <div className="alert">Is number par pehle se patient hai: {dup.full_name} (ID #{dup.patient_no})</div>}
      <div className="two-col">
        <label>{T('f.gender')}<select value={f.gender || ''} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></label>
        <label>{T('f.age')}<input type="number" min="0" max="120" value={f.age ?? ''} onChange={set('age')} inputMode="numeric" /></label>
      </div>
      <label>{T('f.address')}<input value={f.address || ''} onChange={set('address')} /></label>
      <div className="actions"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save patient'}</button><button type="button" className="btn" onClick={onCancel}>{T('c.cancel')}</button></div>
    </form>
  )
}

function RegisterModal({ clinic, patients, initial, notify, load, setModal, close }) {
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{initial?.id ? 'Patient edit' : 'Patient register'}</h3>
        <PatientForm clinic={clinic} patients={patients} initial={initial} notify={notify} onCancel={close}
          onSaved={async (p) => { notify('Patient save ho gaya'); await load(); setModal({ type: 'patient', patient: p }) }} />
      </div>
    </div>
  )
}

function PatientModal({ patient, close, setModal, docName }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('appointments').select('*, appointment_treatments(name, fee)').eq('patient_id', patient.id).order('start_at', { ascending: false }).limit(100)
      .then(({ data }) => setRows(data || []))
  }, [patient.id])
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>{patient.full_name} <span className="pill gray">ID #{patient.patient_no}</span></h3><button className="btn small" onClick={close}>{T('c.close')}</button></div>
        <div className="muted">{patient.phone || '—'}{patient.age ? ` · ${patient.age} yrs` : ''}{patient.gender ? ` · ${patient.gender}` : ''}</div>
        {patient.address && <div className="muted">{patient.address}</div>}
        <div className="actions">
          <button className="btn primary" onClick={() => setModal({ type: 'book', patient })}>{T('b.book')}</button>
          <button className="btn" onClick={() => setModal({ type: 'register', initial: patient })}>{T('c.edit')}</button>
        </div>
        <h4>Visits</h4>
        {rows === null ? <div className="spinner" /> : rows.length === 0 ? <p className="muted">Abhi koi visit nahi.</p> : rows.map((h) => (
          <div className="hist" key={h.id}>
            <div className="row" style={{ padding: 0 }}><b>{fmtDT(h.start_at)}</b><span className={'pill ' + STATUS[h.status][1]}>{STATUS[h.status][0]}</span></div>
            <div className="muted">Dr. {docName[h.doctor_id] || '—'} · {KIND[h.kind]}{(h.appointment_treatments || []).length ? ` · ${h.appointment_treatments.map((t) => t.name).join(', ')}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================== SLOT PICKER ============================== */
function SlotPicker({ doctorId, minutes, value, onChange }) {
  const [date, setDate] = useState(isoDate())
  const [slots, setSlots] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!doctorId) { setSlots(null); return }
    setSlots(null); setMsg('')
    let alive = true
    supabase.rpc('available_slots', { p_doctor: doctorId, p_day: date, p_minutes: minutes }).then(({ data, error }) => {
      if (!alive) return
      if (error) setMsg(error.message)
      setSlots(data || [])
    })
    return () => { alive = false }
  }, [doctorId, date, minutes])

  async function next() {
    setMsg('')
    const { data, error } = await supabase.rpc('next_available', { p_doctor: doctorId, p_minutes: minutes })
    if (error || !data) return setMsg(error?.message || 'Agle 60 din me koi khali slot nahi mila')
    setDate(isoDate(data)); onChange(data)
  }

  return (
    <>
      <div className="inline" style={{ marginTop: '.7rem' }}>
        <input type="date" min={isoDate()} value={date} onChange={(e) => { setDate(e.target.value); onChange(null) }} />
        <button type="button" className="btn small" style={{ whiteSpace: 'nowrap' }} disabled={!doctorId} onClick={next}>Next available</button>
      </div>
      {!doctorId ? <p className="muted">Pehle doctor select karein.</p> : slots === null ? <div className="spinner" /> : slots.length === 0
        ? <p className="muted">Is din koi khali slot nahi (ya clinic band hai).</p>
        : <div className="chips" style={{ marginTop: '.6rem' }}>{slots.map((s) => (
          <button type="button" key={s} className={value && new Date(value).getTime() === new Date(s).getTime() ? 'on' : ''} onClick={() => onChange(s)}>{fmtTime(s)}</button>
        ))}</div>}
      {msg && <div className="alert">{msg}</div>}
    </>
  )
}

/* ============================== BOOK ============================== */
function BookModal({ clinic, patients, doctors, treatments, categories, prePatient, act, notify, load, close, setModal }) {
  const [patient, setPatient] = useState(prePatient || null)
  const [q, setQ] = useState('')
  const [newP, setNewP] = useState(false)
  const [doctor, setDoctor] = useState(doctors[0]?.id || '')
  const [start, setStart] = useState(null)
  const [pick, setPick] = useState([])
  const [showT, setShowT] = useState(false)
  const [busy, setBusy] = useState(false)

  const matches = q.length >= 2 ? patients.filter((p) => (p.full_name + (p.phone || '') + p.patient_no).toLowerCase().includes(q.toLowerCase())).slice(0, 5) : []
  const toggle = (id) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id])

  async function book() {
    if (!patient || !doctor || !start) return notify('Patient, doctor aur slot chunein', true)
    setBusy(true)
    const { data: id, error } = await supabase.rpc('book_appointment', { p_patient: patient.id, p_doctor: doctor, p_start: start })
    if (error) { setBusy(false); return notify(error.message, true) }
    const rows = pick.map((tid) => treatments.find((t) => t.id === tid)).filter(Boolean)
      .map((t) => ({ clinic_id: clinic.id, appointment_id: id, treatment_id: t.id, name: t.name, fee: t.fee }))
    if (rows.length) await supabase.from('appointment_treatments').insert(rows)
    setBusy(false)
    notify(`Appointment book ho gayi: ${fmtDT(start)}`)
    await load()
    close()
  }

  return (
    <div className="modal" onClick={close}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>Nayi appointment</h3><button className="btn small" onClick={close}>{T('c.close')}</button></div>

        <h4>1. Patient</h4>
        {patient ? (
          <div className="row"><div><b>{patient.full_name}</b> <span className="pill gray">ID #{patient.patient_no}</span><div className="muted">{patient.phone || '—'}</div></div><button className="btn small" onClick={() => setPatient(null)}>Change</button></div>
        ) : newP ? (
          <PatientForm clinic={clinic} patients={patients} notify={notify} onCancel={() => setNewP(false)} onSaved={async (p) => { await load(); setPatient(p); setNewP(false) }} />
        ) : (
          <>
            <input placeholder="Naam / phone / ID se dhoondein" value={q} onChange={(e) => setQ(e.target.value)} />
            {matches.map((p) => <button type="button" key={p.id} className="card click" style={{ marginTop: '.5rem', marginBottom: 0 }} onClick={() => setPatient(p)}><b>{p.full_name}</b> <span className="pill gray">ID #{p.patient_no}</span> <span className="muted">{p.phone}</span></button>)}
            <div className="actions"><button className="btn small" onClick={() => setNewP(true)}>+ Naya patient</button></div>
          </>
        )}

        <h4>2. Doctor aur waqt</h4>
        <select value={doctor} onChange={(e) => { setDoctor(e.target.value); setStart(null) }}>
          {doctors.length === 0 && <option value="">Koi doctor register nahi (Admin se kahein)</option>}
          {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
        </select>
        <SlotPicker doctorId={doctor} minutes={clinic.slot_minutes} value={start} onChange={setStart} />

        <h4>3. Treatment (agar patient ko pata ho)</h4>
        <p className="muted">Pata na ho to khali chhor dein, Doctor khud select karega.</p>
        <button type="button" className="btn small" onClick={() => setShowT(!showT)}>{showT ? 'Hide' : 'Treatments dikhayein'} ({pick.length})</button>
        {showT && <TreatmentPicker treatments={treatments} categories={categories} pick={pick} toggle={toggle} />}

        <div className="actions"><button className="btn primary" disabled={busy || !patient || !start} onClick={book}>{busy ? 'Booking…' : start ? `Book ${fmtDT(start)}` : 'Book appointment'}</button></div>
      </div>
    </div>
  )
}

/* ============================== LINES (treatments on appointment) ============================== */
function LinesModal({ appt: a, treatments, categories, clinic, act, close }) {
  const [pick, setPick] = useState([])
  const toggle = (id) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id])
  const lines = a.appointment_treatments || []
  async function add() {
    const rows = pick.map((id) => treatments.find((t) => t.id === id)).filter(Boolean)
      .map((t) => ({ clinic_id: clinic.id, appointment_id: a.id, treatment_id: t.id, name: t.name, fee: t.fee }))
    if (await act(() => supabase.from('appointment_treatments').insert(rows), 'Treatment add ho gayi')) setPick([])
  }
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>{a.patients?.full_name}: treatments</h3><button className="btn small" onClick={close}>{T('c.close')}</button></div>
        {lines.length === 0 && <p className="muted">Abhi koi treatment nahi.</p>}
        {lines.map((t) => (
          <div className="row" key={t.id} style={{ padding: '.2rem 0' }}><span>{t.name}</span><span><b>{money(t.fee)}</b> <button className="btn small danger" onClick={() => act(() => supabase.from('appointment_treatments').delete().eq('id', t.id))}>✕</button></span></div>
        ))}
        <div className="row"><b>Total</b><b>{money(apptTotal(a))}</b></div>
        <h4>Add</h4>
        <TreatmentPicker treatments={treatments} categories={categories} pick={pick} toggle={toggle} />
        <button className="btn primary" disabled={pick.length === 0} onClick={add}>Add selected ({pick.length})</button>
      </div>
    </div>
  )
}

/* ============================== PAYMENT ============================== */
function PayModal({ appt: a, act, close }) {
  const total = apptTotal(a), paid = apptPaid(a), bal = total - paid
  const [amount, setAmount] = useState(bal > 0 ? String(bal) : '')
  const [method, setMethod] = useState('Cash')
  const [note, setNote] = useState('')
  async function receive() {
    if (await act(() => supabase.rpc('receive_payment', { p_appt: a.id, p_amount: Number(amount), p_method: method, p_note: note || null }), 'Payment receive ho gayi')) close()
  }
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>{a.patients?.full_name}: payment</h3><button className="btn small" onClick={close}>{T('c.close')}</button></div>
        {(a.appointment_treatments || []).map((t) => <div className="row" key={t.id} style={{ padding: '.15rem 0' }}><span>{t.name}</span><span>{money(t.fee)}</span></div>)}
        {(a.appointment_treatments || []).length === 0 && <p className="muted">Koi treatment/charge nahi. Pehle "Treatments" se add karein.</p>}
        <div className="row"><b>Total</b><b>{money(total)}</b></div>
        <div className="row"><span>Receive ho chuka</span><span>{money(paid)}</span></div>
        <div className="row"><b>Baqaya</b><b>{money(bal)}</b></div>
        {(a.patient_payments || []).length > 0 && <div className="muted">{a.patient_payments.map((p) => `${money(p.amount)} (${p.method || '—'}, ${fmtDate(p.received_at)})`).join(' · ')}</div>}
        {bal > 0 && (
          <>
            <div className="two-col">
              <label>{T('f.amount')}<input type="number" min="1" max={bal} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
              <label>{T('f.method')}<select value={method} onChange={(e) => setMethod(e.target.value)}>{['Cash', 'Card', 'JazzCash', 'Easypaisa', 'Bank transfer'].map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
            <label>{T('f.note')}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
            <div className="actions"><button className="btn primary" disabled={!amount || Number(amount) <= 0 || Number(amount) > bal} onClick={receive}>Receive {amount ? money(amount) : ''}</button></div>
          </>
        )}
        {bal <= 0 && total > 0 && <div className="alert ok">Poori payment receive ho chuki hai ✅</div>}
      </div>
    </div>
  )
}

/* ============================== PAYMENTS TAB ============================== */
function Payments({ appts, docName, setModal }) {
  const today = isoDate()
  const collectedToday = appts.flatMap((a) => a.patient_payments || []).filter((p) => isoDate(p.received_at) === today).reduce((s, p) => s + Number(p.amount), 0)
  const dues = appts.filter((a) => !['cancelled', 'no_show'].includes(a.status) && apptTotal(a) - apptPaid(a) > 0 && new Date(a.start_at) <= new Date(Date.now() + 86400000)).reverse()
  return (
    <>
      <div className="card"><div className="muted">Aaj receive hua</div><div className="big">{money(collectedToday)}</div></div>
      <h3>Baqaya (dues)</h3>
      {dues.length === 0 && <div className="card muted">Koi baqaya nahi.</div>}
      {dues.map((a) => (
        <button className="card click" key={a.id} onClick={() => setModal({ type: 'pay', appt: a.id })}>
          <div className="row">
            <div><b>{a.patients?.full_name}</b> <span className="pill gray">ID #{a.patients?.patient_no}</span><div className="muted">{fmtDT(a.start_at)} · Dr. {docName[a.doctor_id] || '—'}</div></div>
            <div style={{ textAlign: 'right' }}><b>{money(apptTotal(a) - apptPaid(a))}</b><div className="muted">of {money(apptTotal(a))}</div></div>
          </div>
        </button>
      ))}
    </>
  )
}

/* ============================== FOLLOW-UPS ============================== */
function Followups({ list, docName, clinic, act, setModal }) {
  return (
    <>
      <div className="card muted">Doctor ne jin patients ko follow-up kaha hai wo yahan aate hain. Patient jate hue yahan se follow-up mark karke agli appointment set karein. Follow-up: {clinic.followup_minutes} min, fee {money(clinic.followup_fee)}.</div>
      {list.length === 0 && <div className="card muted">Koi follow-up pending nahi.</div>}
      {list.map((a) => (
        <div className="card" key={a.id}>
          <div className="row">
            <div><b>{a.patients?.full_name}</b> <span className="pill gray">ID #{a.patients?.patient_no}</span>
              <div className="muted">Dr. {docName[a.doctor_id] || '—'} · visit {fmtDate(a.start_at)}</div>
              {a.followup_note && <div>“{a.followup_note}”</div>}
            </div>
          </div>
          <div className="actions">
            <button className="btn small primary" onClick={() => setModal({ type: 'followup', appt: a.id })}>Follow-up book karein</button>
            <button className="btn small" onClick={() => act(() => supabase.from('appointments').update({ followup_dismissed: true }).eq('id', a.id), 'Follow-up hata di gayi')}>Zaroorat nahi</button>
          </div>
        </div>
      ))}
    </>
  )
}

function FollowupModal({ appt: a, clinic, docName, act, close }) {
  const [start, setStart] = useState(null)
  async function book() {
    if (await act(() => supabase.rpc('book_followup', { p_from: a.id, p_start: start }), 'Follow-up appointment book ho gayi')) close()
  }
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>Follow-up: {a.patients?.full_name}</h3><button className="btn small" onClick={close}>{T('c.close')}</button></div>
        <div className="muted">Dr. {docName[a.doctor_id] || '—'} · {clinic.followup_minutes} min · fee {money(clinic.followup_fee)}</div>
        {a.followup_note && <div>“{a.followup_note}”</div>}
        <SlotPicker doctorId={a.doctor_id} minutes={clinic.followup_minutes} value={start} onChange={setStart} />
        <div className="actions"><button className="btn primary" disabled={!start} onClick={book}>{start ? `Book ${fmtDT(start)}` : 'Slot chunein'}</button></div>
      </div>
    </div>
  )
}

/* ============================== MESSAGES ============================== */
function Messages({ messages, clinic, act }) {
  const kindLabel = { reminder: 'Reminder', rescheduled: 'Reschedule', lab_ready: 'Lab ready' }
  async function send(m) {
    window.open(waLink(m.phone, m.body, clinic.country_code), '_blank')
    await act(() => supabase.from('message_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', m.id))
  }
  return (
    <>
      <div className="card muted">Reminder aur lab-ready messages yahan queue me aate hain. “WhatsApp” dabane se message tayyar khul jata hai, bas Send dabayein. Poori auto-sending ke liye WhatsApp Business API alag se connect karni hoti hai.</div>
      {messages.length === 0 && <div className="card muted">Koi pending message nahi.</div>}
      {messages.map((m) => (
        <div className="card" key={m.id}>
          <div className="row"><div><b>{m.patients?.full_name || m.phone}</b> <span className="pill blue">{kindLabel[m.kind] || m.kind}</span><div className="muted">{m.phone} · {fmtDT(m.created_at)}</div></div></div>
          <div className="msg">{m.body}</div>
          <div className="actions">
            <button className="btn small primary" onClick={() => send(m)}>WhatsApp par bhejein</button>
            <button className="btn small" onClick={() => act(() => supabase.from('message_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', m.id))}>Mark sent</button>
            <button className="btn small danger" onClick={() => act(() => supabase.from('message_queue').update({ status: 'dismissed' }).eq('id', m.id))}>Hatayein</button>
          </div>
        </div>
      ))}
    </>
  )
}
