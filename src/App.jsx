import { useCallback, useEffect, useState } from 'react'
import { supabase, configured } from './supabase'
import { effStatus } from './util'
import { getLang } from './i18n'
import Auth from './pages/Auth.jsx'
import ClinicRegister from './pages/ClinicRegister.jsx'
import Executive from './pages/Executive.jsx'
import Admin from './pages/Admin.jsx'
import Receptionist from './pages/Receptionist.jsx'
import Doctor from './pages/Doctor.jsx'
import Lab from './pages/Lab.jsx'
import Helper from './pages/Helper.jsx'
import { Waiting, Rejected, Disabled, Locked } from './pages/Gate.jsx'

function TestBar({ profile, onSwitched }) {
  const [clinics, setClinics] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('dev_list_clinics').then(({ data, error }) => { if (error) setErr(error.message); else setClinics(data || []) })
  }, [profile.clinic_id])

  async function change(e) {
    setErr('')
    const { error } = await supabase.rpc('dev_switch_clinic', { p_clinic: e.target.value })
    if (error) return setErr(error.message)
    onSwitched()
  }

  return (
    <div className="testbar">
      <span>🧪 TEST MODE · {profile.role}</span>
      <select value={profile.clinic_id || ''} onChange={change}>
        {clinics.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
      </select>
      {err && <span className="testerr">{err}</span>}
    </div>
  )
}

function Main() {
  const [session, setSession] = useState(null)
  const [ctx, setCtx] = useState(null) // { profile, clinic }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setCtx(null); setLoading(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async (opts) => {
    if (!session) return
    if (!opts?.silent) setLoading(true)
    const uid = session.user.id
    let { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (!profile) {
      // koi employee invite is email par hai to profile ban jayegi
      const { data: ok } = await supabase.rpc('claim_invite')
      if (ok) ({ data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle())
    }
    let clinic = null
    if (profile?.clinic_id) {
      const r = await supabase.from('clinics').select('*').eq('id', profile.clinic_id).maybeSingle()
      clinic = r.data
    }
    setCtx({ profile, clinic })
    setLoading(false)
  }, [session])

  useEffect(() => { refresh() }, [refresh])

  const logout = () => supabase.auth.signOut()
  const reload = () => refresh()
  const quiet = () => refresh({ silent: true })

  if (!configured) {
    return (
      <div className="center-screen"><div className="card narrow">
        <h2>Setup baqi hai</h2>
        <p>Project folder me <code>.env</code> file banayein (<code>.env.example</code> copy karke) aur apne Supabase URL aur anon key paste karein. Phir app dobara start karein.</p>
      </div></div>
    )
  }
  if (loading) return <div className="center-screen"><div className="spinner" /></div>
  if (!session) return <Auth />

  const { profile, clinic } = ctx || {}
  if (profile?.role === 'executive') return <Executive profile={profile} onLogout={logout} />

  // account hai lekin clinic nahi: Admin registration
  if (!profile || (profile.role === 'admin' && !profile.clinic_id)) {
    return <ClinicRegister email={session.user.email} onDone={reload} onLogout={logout} />
  }

  const bar = profile.is_dev ? <TestBar profile={profile} onSwitched={reload} /> : null
  let screen
  if (!clinic) screen = <Disabled onLogout={logout} />
  else {
    const state = effStatus(clinic)
    if (state === 'pending') screen = <Waiting clinic={clinic} onRefresh={reload} onLogout={logout} />
    else if (state === 'rejected') screen = <Rejected clinic={clinic} onLogout={logout} />
    else if (state === 'suspended' || state === 'expired') screen = <Locked clinic={clinic} state={state} onRefresh={reload} onLogout={logout} />
    else {
      const p = { key: clinic.id + profile.role, profile, clinic, onLogout: logout }
      if (profile.role === 'admin') screen = <Admin {...p} onClinicChanged={quiet} />
      else if (profile.role === 'receptionist') screen = <Receptionist {...p} />
      else if (profile.role === 'doctor') screen = <Doctor {...p} />
      else if (profile.role === 'lab_technician') screen = <Lab {...p} />
      else if (profile.role === 'helper') screen = <Helper {...p} />
      else screen = <Disabled onLogout={logout} />
    }
  }
  return <>{bar}{screen}</>
}

// Zabaan badalne par poori screen naye sire se bantī hai (session login hi rehta hai)
export default function App() {
  const [lang, setLang] = useState(getLang())
  useEffect(() => {
    const f = () => setLang(getLang())
    window.addEventListener('dc-lang', f)
    return () => window.removeEventListener('dc-lang', f)
  }, [])
  return <Main key={lang} />
}
