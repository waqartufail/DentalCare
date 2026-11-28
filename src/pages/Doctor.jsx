import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import Shell from '../components/Shell'
import Attendance from '../components/Attendance'
import TreatmentPicker from '../components/TreatmentPicker'
import { useToast, isoDate, addDays, dayStart, fmtTime, fmtDT, STATUS, KIND, ACTIVE, apptTotal } from '../lib'
import { fmtDate, money } from '../util'
import { t as T } from '../i18n'

export default function Doctor({ profile, clinic, onLogout }) {
  const [tab, setTab] = useState('queue')
  const [waiting, setWaiting] = useState(0)
  const [toast, notify] = useToast()
  return (
    <Shell clinic={clinic} role="role.doctor" userName={profile.full_name} onLogout={onLogout} toast={toast}
      tabs={[['queue', '🩺', 'tab.queue'], ['patients', '🧑', 'tab.patients'], ['attendance', '🕒', 'tab.attendance']]}
      tab={tab} setTab={setTab} badges={{ queue: waiting }}>
      {tab === 'attendance' ? <Attendance userId={profile.id} /> : <DoctorPanel clinic={clinic} notify={notify} view={tab} onWaiting={setWaiting} />}
    </Shell>
  )
}

// Doctor (ya Admin jo khud Doctor bhi ho) ka kaam: apni queue aur apne patients
export function DoctorPanel({ clinic, notify, view, onWaiting }) {
  const [myId, setMyId] = useState(null)
  const [date, setDate] = useState(isoDate())
  const [appts, setAppts] = useState([])
  const [treatments, setTreatments] = useState([])
  const [categories, setCategories] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null) // appointment id
  const [histPatient, setHistPatient] = useState(null)

  const load = useCallback(async () => {
    let id = myId
    if (!id) {
      const r = await supabase.rpc('my_employee_id')
      id = r.data
      setMyId(id)
    }
    if (!id) { setLoading(false); return }
    const [a, tr, p, cg] = await Promise.all([
      supabase.from('appointments').select('*, patients(full_name, phone, patient_no, age, gender), appointment_treatments(*)')
        .eq('doctor_id', id).gte('start_at', dayStart(date).toISOString()).lt('start_at', dayStart(addDays(date, 1)).toISOString()).order('start_at'),
      supabase.from('treatments').select('*').eq('is_active', true).order('name'),
      supabase.from('patients').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('treatment_categories').select('*').order('sort_order').order('name'),
    ])
    if (a.error) notify(a.error.message, true)
    setAppts(a.data || []); setTreatments(tr.data || []); setPatients(p.data || []); setCategories(cg.data || [])
    setLoading(false)
  }, [myId, date])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const tm = setInterval(() => { supabase.rpc('process_appointments').then(load) }, 60000)
    return () => clearInterval(tm)
  }, [load])

  const tokens = useMemo(() => {
    const m = {}
    let n = 0
    appts.filter((a) => ACTIVE.includes(a.status)).forEach((a) => { m[a.id] = ++n })
    return m
  }, [appts])

  const waiting = appts.filter((a) => ['scheduled', 'arrived'].includes(a.status)).length
  useEffect(() => { onWaiting?.(waiting) }, [waiting])
  const openAppt = appts.find((a) => a.id === open)

  if (loading) return <div className="spinner" />
  if (!myId) return <div className="card muted">Aap ka doctor record nahi mila. Admin se rabta karein.</div>

  return (
    <>
      {view === 'patients' ? <PatientSearch patients={patients} onOpen={setHistPatient} /> : (
        <>
          <div className="card inline">
            <button className="btn small" onClick={() => setDate(addDays(date, -1))}>‹</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn small" onClick={() => setDate(addDays(date, 1))}>›</button>
          </div>
          {appts.length === 0 && <div className="card muted">Is din koi appointment nahi.</div>}
          {appts.map((a) => {
            const [label, color] = STATUS[a.status]
            return (
              <button className="card click" key={a.id} onClick={() => setOpen(a.id)}>
                <div className="row">
                  <div>
                    <b>{tokens[a.id] ? `#${tokens[a.id]} · ` : ''}{a.patients?.full_name}</b> <span className="pill gray">ID #{a.patients?.patient_no}</span>
                    <div className="muted">{fmtTime(a.start_at)} – {fmtTime(a.end_at)} · {KIND[a.kind]}</div>
                    {(a.appointment_treatments || []).length > 0 && <div className="muted">{a.appointment_treatments.map((x) => x.name).join(', ')}</div>}
                  </div>
                  <span className={'pill ' + color}>{label}</span>
                </div>
              </button>
            )
          })}
        </>
      )}
      {openAppt && <Consult appt={openAppt} treatments={treatments} categories={categories} clinic={clinic} notify={notify} close={() => setOpen(null)} reload={load} />}
      {histPatient && <HistoryModal patient={histPatient} close={() => setHistPatient(null)} />}
    </>
  )
}

/* ---------- patient search ---------- */
function PatientSearch({ patients, onOpen }) {
  const [q, setQ] = useState('')
  const rows = patients.filter((p) => !q || (p.full_name + (p.phone || '') + p.patient_no).toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  return (
    <>
      <div className="card"><input placeholder="Patient ka naam / phone / ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {rows.map((p) => (
        <button className="card click" key={p.id} onClick={() => onOpen(p)}>
          <div className="row"><div><b>{p.full_name}</b> <span className="pill gray">ID #{p.patient_no}</span><div className="muted">{p.phone || '—'}{p.age ? ` · ${p.age} yrs` : ''}</div></div><span className="muted">History ›</span></div>
        </button>
      ))}
      {rows.length === 0 && <div className="card muted">Koi patient nahi mila.</div>}
    </>
  )
}

/* ---------- history (shared) ---------- */
function useHistory(patientId, excludeId) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('appointments').select('*, appointment_treatments(name, fee)')
      .eq('patient_id', patientId).in('status', ['completed', 'in_progress', 'arrived']).order('start_at', { ascending: false }).limit(100)
      .then(({ data }) => setRows((data || []).filter((x) => x.id !== excludeId)))
  }, [patientId, excludeId])
  return rows
}

function HistoryList({ rows }) {
  if (rows === null) return <div className="spinner" />
  if (rows.length === 0) return <p className="muted">Naya patient: koi purani history nahi.</p>
  return rows.map((h) => (
    <div className="hist" key={h.id}>
      <div className="row" style={{ padding: 0 }}><b>{fmtDate(h.start_at)}</b><span className="pill gray">{KIND[h.kind]}</span></div>
      <div className="muted">Treatment: {(h.appointment_treatments || []).map((t) => t.name).join(', ') || '—'}</div>
      {h.diagnosis && <div>Diagnosis: {h.diagnosis}</div>}
      {h.prescription && <div>Prescribed: {h.prescription}</div>}
      {h.doctor_notes && <div className="muted">Notes: {h.doctor_notes}</div>}
      {h.followup_required && <div className="muted">Follow-up advise kiya gaya tha{h.followup_note ? `: ${h.followup_note}` : ''}</div>}
    </div>
  ))
}

function HistoryModal({ patient, close }) {
  const rows = useHistory(patient.id, null)
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>{patient.full_name} <span className="pill gray">ID #{patient.patient_no}</span></h3><button className="btn small" onClick={close}>{T('c.close')}</button></div>
        <div className="muted">{patient.phone || '—'}{patient.age ? ` · ${patient.age} yrs` : ''}{patient.gender ? ` · ${patient.gender}` : ''}</div>
        <h4>History</h4>
        <HistoryList rows={rows} />
      </div>
    </div>
  )
}

/* ---------- consultation ---------- */
function Consult({ appt: a, treatments, categories, clinic, notify, close, reload }) {
  const hist = useHistory(a.patient_id, a.id)
  const [f, setF] = useState({
    diagnosis: a.diagnosis || '', prescription: a.prescription || '', notes: a.doctor_notes || '',
    followup: a.followup_required, followupNote: a.followup_note || '',
  })
  const [pick, setPick] = useState([])
  const [busy, setBusy] = useState(false)
  const locked = ['cancelled', 'no_show'].includes(a.status)
  const lines = a.appointment_treatments || []

  async function run(fn, ok) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { notify(error.message, true); return false }
    if (ok) notify(ok)
    await reload()
    return true
  }

  const start = () => run(() => supabase.from('appointments').update({ status: 'in_progress' }).eq('id', a.id), 'Consult shuru')
  const saveDraft = () => run(() => supabase.from('appointments').update({
    diagnosis: f.diagnosis, prescription: f.prescription, doctor_notes: f.notes,
    followup_required: f.followup, followup_note: f.followup ? f.followupNote : null,
  }).eq('id', a.id), 'Draft save ho gaya')

  async function finish() {
    if (lines.length === 0 && !confirm('Koi treatment select nahi ki. Phir bhi consult mukammal karein?')) return
    const ok = await run(() => supabase.rpc('finish_consult', {
      p_appt: a.id, p_diagnosis: f.diagnosis, p_prescription: f.prescription, p_notes: f.notes,
      p_followup: f.followup, p_followup_note: f.followup ? f.followupNote : null,
    }), f.followup ? 'Consult mukammal. Receptionist follow-up book karegi' : 'Consult mukammal')
    if (ok) close()
  }

  async function addLines() {
    const rows = pick.map((id) => treatments.find((t) => t.id === id)).filter(Boolean)
      .map((t) => ({ clinic_id: a.clinic_id, appointment_id: a.id, treatment_id: t.id, name: t.name, fee: t.fee }))
    if (rows.length === 0) return
    const ok = await run(() => supabase.from('appointment_treatments').insert(rows), 'Treatment add ho gayi')
    if (ok) setPick([])
  }

  const toggle = (id) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id])

  return (
    <div className="modal" onClick={close}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <div>
            <h3 style={{ margin: 0 }}>{a.patients?.full_name} <span className="pill gray">ID #{a.patients?.patient_no}</span></h3>
            <div className="muted">{a.patients?.phone || '—'}{a.patients?.age ? ` · ${a.patients.age} yrs` : ''}{a.patients?.gender ? ` · ${a.patients.gender}` : ''}</div>
            <div className="muted">{fmtDT(a.start_at)} · {KIND[a.kind]}</div>
          </div>
          <button className="btn small" onClick={close}>{T('c.close')}</button>
        </div>
        <span className={'pill ' + STATUS[a.status][1]}>{STATUS[a.status][0]}</span>

        <h4>Pichli history</h4>
        <HistoryList rows={hist} />

        {locked ? <p className="muted">Ye appointment cancel/no-show hai.</p> : (
          <>
            <h4>Treatments ({money(apptTotal(a))})</h4>
            {lines.length === 0 && <p className="muted">Abhi koi treatment select nahi.</p>}
            {lines.map((t) => (
              <div className="row" key={t.id} style={{ padding: '.2rem 0' }}>
                <span>{t.name}</span>
                <span><b>{money(t.fee)}</b> <button className="btn small danger" onClick={() => run(() => supabase.from('appointment_treatments').delete().eq('id', t.id))}>✕</button></span>
              </div>
            ))}
            <TreatmentPicker treatments={treatments} categories={categories} pick={pick} toggle={toggle} />
            <button className="btn" disabled={pick.length === 0 || busy} onClick={addLines}>+ Selected treatments add karein ({pick.length})</button>

            <h4>Consultation</h4>
            <label>Diagnosis<textarea rows="2" value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} /></label>
            <label>Prescription<textarea rows="3" value={f.prescription} onChange={(e) => setF({ ...f, prescription: e.target.value })} /></label>
            <label>Notes<textarea rows="2" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
            <label className="check" style={{ marginTop: '.8rem' }}>
              <input type="checkbox" checked={f.followup} onChange={(e) => setF({ ...f, followup: e.target.checked })} />
              Follow-up zaroori hai ({clinic.followup_minutes} min, fee {money(clinic.followup_fee)})
            </label>
            {f.followup && <label>Follow-up note<input value={f.followupNote} onChange={(e) => setF({ ...f, followupNote: e.target.value })} placeholder="jaise 1 hafte baad, stitches check" /></label>}

            <div className="actions">
              {['scheduled', 'arrived'].includes(a.status) && <button className="btn" disabled={busy} onClick={start}>{T('b.start_consult')}</button>}
              <button className="btn" disabled={busy} onClick={saveDraft}>{T('b.save_draft')}</button>
              <button className="btn primary" disabled={busy} onClick={finish}>{T('b.finish_consult')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
