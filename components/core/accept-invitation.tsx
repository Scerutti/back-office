'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle2, KeyRound, MailCheck } from 'lucide-react'
import { CoreApiError } from '@/lib/core-client'
import { errorField, errorMessage } from '@/lib/error-messages'
import { useToast } from './toast'

const MIN_PASSWORD = 10
const MAX_PASSWORD = 128
const REDIRECT_DELAY_MS = 4000

async function acceptInvitation(token: string, password: string) {
  const response = await fetch('/api/auth/accept-invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }), cache: 'no-store' })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new CoreApiError(response.status, body, response.headers.get('Retry-After'), response.headers.get('X-Correlation-Id'))
  }
}

export function AcceptInvitation() {
  const token = useSearchParams().get('token') ?? ''
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  const toast = useToast()
  const passwordError = errorField(error) === 'password' ? errorMessage(error) : null
  // Con el token vencido o usado no tiene sentido seguir mostrando el formulario.
  const tokenRejected = error instanceof CoreApiError && error.errorCode === 'Auth.InvalidOneTimeToken'
  const mismatch = confirmation.length > 0 && password !== confirmation

  useEffect(() => {
    if (!done) return
    const timeout = window.setTimeout(() => router.replace('/'), REDIRECT_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [done, router])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || mismatch || !token) return
    setSubmitting(true); setError(null)
    try {
      await acceptInvitation(token, password)
      toast.success('Cuenta activada. Ya podés ingresar.')
      setDone(true)
    } catch (caught) {
      // Contraseña débil: debajo del campo (el link sigue sirviendo). Token inválido: reemplaza el
      // formulario. El resto: toast.
      const tokenError = caught instanceof CoreApiError && caught.errorCode === 'Auth.InvalidOneTimeToken'
      if (errorField(caught) === 'password' || tokenError) setError(caught)
      if (errorField(caught) !== 'password') toast.fromError(caught)
    } finally {
      setSubmitting(false)
      setPassword(''); setConfirmation('')
    }
  }

  return <main className="core-login-shell">
    <section className="core-login-card" aria-labelledby="accept-title">
      <div className="core-login-brand"><span className="brand-mark"><span>H</span></span><div><strong>HREF <b>Core</b></strong><small>CONTROL PLANE</small></div></div>
      {done ? <>
        <div className="core-login-icon"><CheckCircle2 aria-hidden="true" /></div>
        <p className="core-eyebrow">Invitación aceptada</p>
        <h1 id="accept-title">Tu cuenta está lista</h1>
        <p className="core-login-copy" role="status">Ya podés iniciar sesión con tu email y la contraseña que elegiste. Te llevamos al inicio de sesión en unos segundos.</p>
        <Link href="/" replace className="core-primary-button core-login-submit">Ir a iniciar sesión <ArrowRight aria-hidden="true" /></Link>
      </> : <>
        <div className="core-login-icon"><MailCheck aria-hidden="true" /></div>
        <p className="core-eyebrow">Invitación a HREF Core</p>
        <h1 id="accept-title">Elegí tu contraseña</h1>
        <p className="core-login-copy">Con esta contraseña vas a iniciar sesión en el panel de administración.</p>
        {!token ? <div className="core-error" role="alert"><strong>El link no es válido: le falta el código de invitación. Abrí el link completo del email o pedile a un administrador que te reenvíe la invitación.</strong></div>
          : tokenRejected ? <div className="core-error" role="alert"><strong>{errorMessage(error)}</strong><small>Código: {(error as CoreApiError).errorCode} · Correlation ID: {(error as CoreApiError).correlationId}</small></div>
          : <form className="core-login-form" onSubmit={submit}>
            <label className="core-field" htmlFor="accept-password"><span>Contraseña</span><div className="core-input-wrap"><KeyRound aria-hidden="true" /><input id="accept-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD} aria-describedby="accept-password-hint" autoFocus /></div>{passwordError && <small className="core-field-error-text" role="alert">{passwordError}</small>}<small id="accept-password-hint">Entre {MIN_PASSWORD} y {MAX_PASSWORD} caracteres.</small></label>
            <label className="core-field" htmlFor="accept-confirmation"><span>Repetí la contraseña</span><div className="core-input-wrap"><KeyRound aria-hidden="true" /><input id="accept-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD} aria-invalid={mismatch} aria-describedby={mismatch ? 'accept-mismatch' : undefined} /></div>{mismatch && <small id="accept-mismatch" className="core-field-error">Las contraseñas no coinciden.</small>}</label>
            <button className="core-primary-button core-login-submit" type="submit" disabled={submitting || mismatch || password.length < MIN_PASSWORD || !confirmation}>{submitting ? 'Guardando…' : 'Activar mi cuenta'} <ArrowRight aria-hidden="true" /></button>
          </form>}
      </>}
    </section>
    <p className="core-login-footer">Acceso restringido a administradores autorizados</p>
  </main>
}
