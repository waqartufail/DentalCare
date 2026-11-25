import { useState } from 'react'
import { supabase } from '../supabase'

export default function ClinicRegister({ email, onDone, onLogout }) {
  const [f, setF] = useState({ name: '', owner: '', phone: '', city: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('register_clinic', {
      p_name: f.name, p_owner: f.owner, p_phone: f.phone, p_city: f.city, p_address: f.address,
    })
    setBusy(false)
    if (error) setErr(error.message); else onDone()
  }

  return (
    <div className="center-screen">
      <form className="card narrow" onSubmit={submit}>
        <div className="logo">🏥</div>
        <h2>Clinic Registration</h2>
        <p className="muted">Account: {email}<br />Request Executive ke paas jayegi. Approve hone par 1 mahine ka free trial shuru hoga.</p>
        <label>Clinic name *<input value={f.name} onChange={set('name')} required /></label>
        <label>Owner / Admin name *<input value={f.owner} onChange={set('owner')} required /></label>
        <label>Phone<input value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
        <label>City<input value={f.city} onChange={set('city')} /></label>
        <label>Address<input value={f.address} onChange={set('address')} /></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Submit registration'}</button>
        <button type="button" className="link" onClick={onLogout}>Logout</button>
      </form>
    </div>
  )
}
