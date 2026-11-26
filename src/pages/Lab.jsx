import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Shell from '../components/Shell'
import Attendance from '../components/Attendance'
import { useToast, fmtDT } from '../lib'

export default function Lab({ profile, clinic, onLogout }) {
  const [tab, setTab] = useState('pending')
  const [orders, setOrders] = useState([])
  const [doctors, setDoctors] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [toast, notify] = useToast()

  const load = useCallback(async () => {
    const [o, d] = await Promise.all([
      supabase.from('lab_orders').select('*, patients(full_name, patient_no, phone), delivery:appointments!lab_orders_delivery_appointment_id_fkey(start_at)').order('created_at', { ascending: false }).limit(300),
      supabase.rpc('list_doctors'),
    ])
    if (o.error) notify(o.error.message, true)
    setOrders(o.data || [])
    setDoctors(Object.fromEntries((d.data || []).map((x) => [x.id, x.full_name])))
    setLoading(false)
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  async function ready(o) {
    if (!confirm(`"${o.title}" ready mark karein? Patient ki agle din ki appointment khud book ho jayegi.`)) return
    setBusy(o.id)
    const { data, error } = await supabase.rpc('lab_mark_ready', { p_order: o.id })
    setBusy(null)
    if (error) return notify(error.message, true)
    notify(`Ready ✅ Patient ki appointment ${fmtDT(data)} par book ho gayi`)
    load()
  }

  const pending = orders.filter((o) => o.status === 'pending')
  const done = orders.filter((o) => o.status === 'ready')
  const list = tab === 'pending' ? pending : done

  return (
    <Shell brand={clinic.name} role="Lab Technician" userName={profile.full_name} onLogout={onLogout} toast={toast}
      tabs={[['pending', '🧪', 'Pending'], ['ready', '✅', 'Ready'], ['attendance', '🕒', 'Attendance']]}
      tab={tab} setTab={setTab} badges={{ pending: pending.length }}>
      {tab === 'attendance' ? <Attendance userId={profile.id} /> : loading ? <div className="spinner" /> : (
        <>
          {list.length === 0 && <div className="card muted">{tab === 'pending' ? 'Koi pending lab kaam nahi.' : 'Abhi tak koi order ready nahi hua.'}</div>}
          {list.map((o) => (
            <div className="card" key={o.id}>
              <div className="row">
                <div>
                  <b>{o.title}</b>
                  <div>{o.patients?.full_name} <span className="pill gray">ID #{o.patients?.patient_no}</span></div>
                  <div className="muted">Dr. {doctors[o.doctor_id] || '—'} · order {fmtDT(o.created_at)}</div>
                  {o.status === 'ready' && <div className="muted">Ready {fmtDT(o.ready_at)} · patient ki appointment {fmtDT(o.delivery?.start_at)}</div>}
                </div>
                <span className={'pill ' + (o.status === 'ready' ? 'green' : 'amber')}>{o.status}</span>
              </div>
              {o.status === 'pending' && (
                <div className="actions"><button className="btn primary" disabled={busy === o.id} onClick={() => ready(o)}>{busy === o.id ? 'Please wait…' : 'Mark Ready'}</button></div>
              )}
            </div>
          ))}
        </>
      )}
    </Shell>
  )
}
