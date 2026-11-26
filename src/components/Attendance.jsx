import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { fmtTime, fmtHM, isoDate } from '../lib'
import { fmtDate } from '../util'

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Is device/browser me location support nahi hai'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Location ki permission allow karein (browser/phone settings)' : 'Location nahi mil saki, dobara try karein')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  })
}

export default function Attendance({ userId, autoCheckIn = false }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { text, bad }
  const [loading, setLoading] = useState(true)
  const tried = useRef(false)

  const load = useCallback(async () => {
    const now = new Date()
    const from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const { data } = await supabase.from('attendance').select('*').eq('user_id', userId).gte('work_date', from).order('work_date', { ascending: false })
    setRows(data || [])
    setLoading(false)
    return data || []
  }, [userId])

  async function run(kind) {
    setBusy(true); setMsg(null)
    try {
      const pos = await getPosition()
      const { data, error } = await supabase.rpc(kind === 'in' ? 'attendance_check_in' : 'attendance_check_out', { p_lat: pos.lat, p_lng: pos.lng, p_acc: pos.acc })
      if (error) throw new Error(error.message)
      setMsg({ text: data === 'already' ? (kind === 'in' ? 'Aaj ki check-in pehle se mark hai' : 'Aaj ka check-out pehle se mark hai') : kind === 'in' ? 'Check-in mark ho gayi ✅' : 'Check-out mark ho gaya ✅' })
    } catch (e) {
      setMsg({ text: e.message, bad: true })
    }
    await load()
    setBusy(false)
  }

  useEffect(() => {
    load().then((d) => {
      if (autoCheckIn && !tried.current) {
        tried.current = true
        if (!d.some((r) => r.work_date === isoDate() && r.check_in)) run('in')
      }
    })
    // eslint-disable-next-line
  }, [])

  const today = rows.find((r) => r.work_date === isoDate())
  const days = rows.filter((r) => r.check_in).length
  const ot = rows.reduce((a, r) => a + (r.overtime_minutes || 0), 0)

  return (
    <>
      <div className="card">
        <h3>Aaj ki attendance</h3>
        {loading ? <div className="spinner" /> : (
          <>
            <div className="row"><span>Check-in</span><b>{today?.check_in ? fmtTime(today.check_in) : 'Abhi nahi'}</b></div>
            <div className="row"><span>Check-out</span><b>{today?.check_out ? fmtTime(today.check_out) : '—'}</b></div>
            {today?.check_out && <div className="row"><span>Kaam ka waqt</span><b>{fmtHM(today.worked_minutes)}{today.overtime_minutes > 0 ? ` (OT ${fmtHM(today.overtime_minutes)})` : ''}</b></div>}
            {msg && <div className={'alert' + (msg.bad ? '' : ' ok')}>{msg.text}</div>}
            <div className="actions">
              <button className="btn primary" disabled={busy || !!today?.check_in} onClick={() => run('in')}>{busy ? 'Location check ho rahi hai…' : 'Check In'}</button>
              <button className="btn" disabled={busy || !today?.check_in || !!today?.check_out} onClick={() => run('out')}>Check Out</button>
            </div>
            <p className="muted" style={{ marginTop: '.8rem' }}>Attendance sirf clinic ke andar (Admin ki set ki hui location ke qareeb) mark hoti hai. Phone/browser ki location on rakhein.</p>
          </>
        )}
      </div>
      <div className="card">
        <div className="row"><h3 style={{ margin: 0 }}>Is mahine</h3><span className="muted">{days} din · OT {fmtHM(ot)}</span></div>
        {rows.length === 0 && <p className="muted">Is mahine abhi koi attendance nahi.</p>}
        {rows.map((r) => (
          <div className="row" key={r.id}>
            <div><b>{fmtDate(r.work_date)}</b><div className="muted">{fmtTime(r.check_in)} → {r.check_out ? fmtTime(r.check_out) : '—'}</div></div>
            <div style={{ textAlign: 'right' }}>
              <div>{r.worked_minutes != null ? fmtHM(r.worked_minutes) : '—'}</div>
              {r.overtime_minutes > 0 && <span className="pill amber">OT {fmtHM(r.overtime_minutes)}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
