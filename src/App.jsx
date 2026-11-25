import { useCallback, useEffect, useState } from 'react'
import { supabase, configured } from './supabase'
import { effStatus } from './util'
import Auth from './pages/Auth.jsx'
import ClinicRegister from './pages/ClinicRegister.jsx'
import Executive from './pages/Executive.jsx'
import Admin from './pages/Admin.jsx'
import { Waiting, Rejected, Disabled, Locked, StaffPlaceholder } from './pages/Gate.jsx'

export default function App() {
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

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true)
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
    return <ClinicRegister email={session.user.email} onDone={refresh} onLogout={logout} />
  }
  if (!clinic) return <Disabled onLogout={logout} />

  const state = effStatus(clinic)
  if (state === 'pending') return <Waiting clinic={clinic} onRefresh={refresh} onLogout={logout} />
  if (state === 'rejected') return <Rejected clinic={clinic} onLogout={logout} />
  if (state === 'suspended' || state === 'expired') return <Locked clinic={clinic} state={state} onRefresh={refresh} onLogout={logout} />

  if (profile.role === 'admin') return <Admin profile={profile} clinic={clinic} onLogout={logout} onClinicChanged={refresh} />
  return <StaffPlaceholder profile={profile} clinic={clinic} onLogout={logout} />
}
