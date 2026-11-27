'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { CoreApiError } from '@/lib/core-client'
import { errorField, errorMessage, errorTone, type ErrorOverrides, type Tone } from '@/lib/error-messages'

// ---------------------------------------------------------------------------------------------
// Toasts del panel. Reglas (anexo de toasts de Core):
// - escritura OK → success; 202 → info; lectura OK → nada.
// - 404 / 409 / 429 → warning; 400 / 403 / 413 / 5xx / red → error; los "ya estaba así" → info.
// - 400 de un campo → debajo del campo, no toast. 401 con la sesión cerrada → lo avisa el login.
// ---------------------------------------------------------------------------------------------

type ToastItem = { id: number; tone: Tone; message: string; detail?: string }

const DURATION: Record<Tone, number> = { success: 4000, info: 5000, warning: 7000, error: 9000 }
const MAX_VISIBLE = 4
const ICONS: Record<Tone, typeof Info> = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle }
const LABELS: Record<Tone, string> = { success: 'Listo', info: 'Información', warning: 'Atención', error: 'Error' }

export type ToastApi = {
  success: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
  error: (message: string, detail?: string) => void
  /** Toast para un error de la API, con el tono y el texto que corresponden a su status/errorCode. */
  fromError: (error: unknown, overrides?: ErrorOverrides) => void
  /**
   * Error de un formulario: si el código es de un campo que el formulario tiene, lo deja para
   * mostrar debajo del campo (`setInline`); si no, toast.
   */
  formError: (error: unknown, fields: readonly string[], setInline: (error: unknown) => void, overrides?: ErrorOverrides) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), [])
  const push = useCallback((tone: Tone, message: string, detail?: string) => {
    const id = nextId.current++
    // El mismo aviso repetido (por ejemplo, dos clics) no se apila: se reemplaza.
    setItems((current) => [...current.filter((item) => item.message !== message || item.tone !== tone), { id, tone, message, detail }].slice(-MAX_VISIBLE))
  }, [])

  const api = useMemo<ToastApi>(() => {
    const fromError = (error: unknown, overrides?: ErrorOverrides) => {
      if (error instanceof CoreApiError && error.sessionEnded) return
      const tone = errorTone(error, overrides)
      const detail = tone === 'error' ? errorDetail(error) : undefined
      push(tone, errorMessage(error, overrides), detail)
    }
    return {
      success: (message) => push('success', message),
      info: (message) => push('info', message),
      warning: (message) => push('warning', message),
      error: (message, detail) => push('error', message, detail),
      fromError,
      formError: (error, fields, setInline, overrides) => {
        const field = errorField(error)
        if (field && fields.includes(field)) { setInline(error); return }
        setInline(null)
        fromError(error, overrides)
      },
    }
  }, [push])

  return <ToastContext.Provider value={api}>{children}<div className="core-toaster" aria-label="Notificaciones">{items.map((item) => <Toast key={item.id} item={item} onDismiss={() => dismiss(item.id)} />)}</div></ToastContext.Provider>
}

function errorDetail(error: unknown) {
  if (!(error instanceof CoreApiError)) return 'Revisá tu conexión. Si se repite, contactá soporte.'
  return error.correlationId !== 'no-disponible' ? `Código ${error.errorCode} · Correlation ID ${error.correlationId}` : `Código ${error.errorCode}`
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const timeout = window.setTimeout(onDismiss, DURATION[item.tone])
    return () => window.clearTimeout(timeout)
  }, [paused, item.tone, onDismiss])
  const Icon = ICONS[item.tone]
  // error/warning interrumpen al lector de pantalla; success/info se anuncian sin cortar.
  const urgent = item.tone === 'error' || item.tone === 'warning'
  return <div className={`core-toast core-toast-${item.tone}`} role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <Icon aria-hidden="true" />
    <div><span className="sr-only">{LABELS[item.tone]}: </span><strong>{item.message}</strong>{item.detail && <small>{item.detail}</small>}</div>
    <button type="button" aria-label="Cerrar notificación" onClick={onDismiss}><X aria-hidden="true" /></button>
  </div>
}

export function useToast() {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast requiere ToastProvider')
  return toast
}
