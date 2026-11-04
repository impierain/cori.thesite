import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(false); const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setInfo('')
    if (reset) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      error ? setErr(error.message) : setInfo('Ti abbiamo inviato una mail per reimpostare la password.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErr('Email o password non corretti.')
    }
    setBusy(false)
  }

  return (
    <div className="login">
      <div className="card">
        <h1 style={{ color: 'var(--brand)' }}>Cori · Gestionale</h1>
        <p className="muted">Accedi per gestire cassa, soci e verbali.</p>
        <form onSubmit={submit} className="grid">
          <div><label className="f">Email</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></div>
          {!reset && <div><label className="f">Password</label><input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>}
          {err && <div className="notice warn">{err}</div>}
          {info && <div className="notice ok">{info}</div>}
          <button className="primary" disabled={busy}>{reset ? 'Invia link' : 'Accedi'}</button>
          <a href="#" onClick={e => { e.preventDefault(); setReset(!reset); setErr(''); setInfo('') }}>{reset ? 'Torna al login' : 'Password dimenticata?'}</a>
        </form>
      </div>
    </div>
  )
}
