import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { money, billingLabel } from '../util'

function Screen({ icon, title, children, onRefresh, onLogout }) {
  return (
    <div className="center-screen"><div className="card narrow">
      <div className="logo">{icon}</div>
      <h2>{title}</h2>
      {children}
      {onRefresh && <button className="btn primary" onClick={onRefresh}>Status dobara check karein</button>}
      <button className="link" onClick={onLogout}>Logout</button>
    </div></div>
  )
}

export function Waiting({ clinic, onRefresh, onLogout }) {
  return (
    <Screen icon="⏳" title="Approval ka intezar" onRefresh={onRefresh} onLogout={onLogout}>
      <p><b>{clinic.name}</b> ki registration Executive ke paas review ke liye hai. Approve hote hi aap ka 1 mahine ka trial shuru ho jayega.</p>
    </Screen>
  )
}

export function Rejected({ clinic, onLogout }) {
  return (
    <Screen icon="🚫" title="Request approve nahi hui" onLogout={onLogout}>
      <p><b>{clinic.name}</b> ki registration approve nahi hui. Mazeed maloomat ke liye Executive se rabta karein.</p>
    </Screen>
  )
}

export function Disabled({ onLogout }) {
  return (
    <Screen icon="🔒" title="Access band hai" onLogout={onLogout}>
      <p>Is account ko clinic ka access nahi mil raha. Apne clinic Admin se rabta karein.</p>
    </Screen>
  )
}

export function Locked({ clinic, state, onRefresh, onLogout }) {
  const [plans, setPlans] = useState([])
  useEffect(() => {
    supabase.from('plans').select('*').eq('is_active', true).order('price').then(({ data }) => setPlans(data || []))
  }, [])
  const why = state === 'suspended' ? 'Clinic ko Executive ne suspend kiya hai.' : 'Trial ya subscription khatam ho gaya hai.'
  return (
    <Screen icon="⛔" title="Clinic access locked" onRefresh={onRefresh} onLogout={onLogout}>
      <p><b>{clinic.name}</b>: {why} Dobara shuru karne ke liye Executive se rabta karein aur payment karein.</p>
      {plans.length > 0 && (
        <div style={{ marginTop: '.8rem' }}>
          <div className="muted" style={{ textAlign: 'left' }}>Available plans</div>
          {plans.map((p) => (
            <div className="row" key={p.id}><span>{p.name} <span className="muted">({billingLabel[p.billing]})</span></span><b>{money(p.price, p.currency)}</b></div>
          ))}
        </div>
      )}
    </Screen>
  )
}
