'use client'

import { FormEvent, useEffect, useState } from 'react'
import { ArrowRight, Fingerprint, KeyRound, ShieldCheck } from 'lucide-react'
import { CoreSession, login } from '@/lib/core-client'
import { useToast } from './toast'

export function LoginForm({ onAuthenticated, initialError = null }: { onAuthenticated: (session: CoreSession) => void; initialError?: unknown }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  // Sesión cerrada por el BFF (refresh vencido → info, reusado → warning, 403 → error).
  useEffect(() => {
    if (initialError) toast.fromError(initialError)
  }, [initialError])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      onAuthenticated(await login(email.trim(), password))
    } catch (caught) {
      toast.fromError(caught)
    } finally {
      setSubmitting(false)
      setPassword('')
    }
  }

  return (
    <main className="core-login-shell">
      <section className="core-login-card" aria-labelledby="login-title">
        <div className="core-login-brand"><span className="brand-mark"><span>H</span></span><div><strong>HREF <b>Core</b></strong><small>CONTROL PLANE</small></div></div>
        <div className="core-login-icon"><ShieldCheck aria-hidden="true" /></div>
        <p className="core-eyebrow">Acceso seguro</p>
        <h1 id="login-title">Bienvenido de nuevo</h1>
        <p className="core-login-copy">Iniciá sesión para administrar las aplicaciones y accesos de HREF Core.</p>
        <form className="core-login-form" onSubmit={submit}>
          <label className="core-field"><span>Email</span><div className="core-input-wrap"><Fingerprint aria-hidden="true" /><input type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" required maxLength={320} /></div></label>
          <label className="core-field"><span>Contraseña</span><div className="core-input-wrap"><KeyRound aria-hidden="true" /><input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresá tu contraseña" required maxLength={128} /></div></label>
          <button className="core-primary-button core-login-submit" type="submit" disabled={submitting || !email.trim() || !password}>
            {submitting ? 'Verificando…' : 'Iniciar sesión'} <ArrowRight aria-hidden="true" />
          </button>
        </form>
        <div className="core-login-secure"><ShieldCheck aria-hidden="true" /><span>Conexión protegida · HREF Core</span></div>
      </section>
      <p className="core-login-footer">Acceso restringido a administradores autorizados</p>
    </main>
  )
}
