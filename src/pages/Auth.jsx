import { useState } from 'react'
import { supabase } from '../supabase'
import { TEST_LOGIN_ON, TEST_USERS, TEST_PASSWORD } from '../testUsers'

export default function Auth() {
  const [mode, setMode] = useState('login') // login | register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const isReg = mode === 'register'

  async function submit(e) {
    e.preventDefault()
    setErr(''); setInfo('')
    if (isReg) {
      if (password.length < 6) return setErr('Password kam az kam 6 characters ka rakhein')
      if (password !== confirm) return setErr('Dono passwords match nahi karte')
    }
    setBusy(true)
    if (isReg) {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) setErr(error.message)
      else if (!data.session) setInfo('Confirmation email bhej di gayi hai. Email confirm karke login karein.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setErr(error.message)
    }
    setBusy(false)
  }

  async function testLogin(u) {
    setErr(''); setInfo(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD })
    if (error) setErr('Test user nahi mila ya login nahi hua. Pehle supabase/06_test_users.sql chalayein. (' + error.message + ')')
    setBusy(false)
  }

  async function google() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (error) setErr(error.message)
  }

  return (
    <div className="center-screen">
      <form className="card narrow" onSubmit={submit}>
        <div className="logo">🦷</div>
        <h1>DentCare</h1>
        <p className="muted">{isReg ? 'Naya account banayein (clinic Admin / Staff)' : 'Sign in to continue'}</p>

        <button type="button" className="btn google" onClick={google}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </button>
        <div className="or"><span>ya email se</span></div>

        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={isReg ? 'new-password' : 'current-password'} /></label>
        {isReg && <label>Confirm password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></label>}

        {err && <div className="alert">{err}</div>}
        {info && <div className="alert ok">{info}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : isReg ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="link" onClick={() => { setMode(isReg ? 'login' : 'register'); setErr(''); setInfo('') }}>
          {isReg ? 'Pehle se account hai? Sign in' : 'Clinic register karni hai? Create account →'}
        </button>
        {TEST_LOGIN_ON && (
          <div className="testbox">
            <div className="muted">🧪 Test login (sirf testing ke liye)</div>
            <div className="chips" style={{ justifyContent: 'center', marginTop: '.5rem' }}>
              {TEST_USERS.map((u) => <button type="button" key={u.email} disabled={busy} onClick={() => testLogin(u)}>{u.label}</button>)}
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
