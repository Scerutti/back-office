'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, Fingerprint, KeyRound, ShieldCheck } from 'lucide-react'
import { CoreApiError, CoreSession, login } from '@/lib/core-client'
import { errorMessage } from '@/lib/error-messages'

export function LoginForm({ onAuthenticated, initialError = null }: { onAuthenticated: (session: CoreSession) => void; initialError?: unknown }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const visibleError = error ?? (!attempted ? initialError : null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setAttempted(true)
    setSubmitting(true)
    try {
      onAuthenticated(await login(email.trim(), password))
    } catch (caught) {
      setError(caught)
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
          {visibleError ? <div className="core-error" role="alert"><strong>{errorMessage(visibleError)}</strong>{visibleError instanceof CoreApiError && <small>Código: {visibleError.errorCode} · Correlation ID: {visibleError.correlationId}</small>}</div> : null}
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
