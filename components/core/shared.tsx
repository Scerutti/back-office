'use client'

import { KeyboardEvent, ReactNode, useEffect, useRef } from 'react'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { CoreApiError } from '@/lib/core-client'
import { errorMessage } from '@/lib/error-messages'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="core-page-heading"><div><p className="core-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action && <div className="core-heading-action">{action}</div>}</div>
}

export function PrimaryButton({ children, type = 'button', disabled, onClick, className = '' }: { children: ReactNode; type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void; className?: string }) {
  return <button type={type} className={`core-primary-button ${className}`} disabled={disabled} onClick={onClick}>{children}</button>
}

export function SecondaryButton({ children, disabled, onClick, className = '' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; className?: string }) {
  return <button type="button" className={`core-secondary-button ${className}`} disabled={disabled} onClick={onClick}>{children}</button>
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return <span className={`core-badge core-badge-${tone}`}>{children}</span>
}

export function ErrorNotice({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  const apiError = error instanceof CoreApiError ? error : null
  return <div className="core-error" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>{errorMessage(error)}</strong><small>{apiError ? `Código: ${apiError.errorCode} · Correlation ID: ${apiError.correlationId}` : 'Volvé a intentar. Si el problema continúa, contactá soporte.'}</small></div>{onDismiss && <button type="button" aria-label="Cerrar aviso" onClick={onDismiss}><X aria-hidden="true" /></button>}</div>
}

export function LoadingState({ label = 'Cargando datos…' }: { label?: string }) {
  return <div className="core-loading" role="status"><LoaderCircle aria-hidden="true" /> {label}</div>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`core-panel ${className}`}>{children}</section>
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    return () => { if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], iframe, [tabindex="0"]')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (document.activeElement === dialogRef.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="core-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} className={`core-modal${wide ? ' core-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="core-modal-title"><header className="core-modal-head"><div><p className="core-eyebrow">HREF CORE</p><h2 id="core-modal-title">{title}</h2></div><button className="core-icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button></header><div className="core-modal-content">{children}</div></section></div>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="core-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function EmptyState({ title = 'No hay resultados', detail = 'Ajustá los filtros o creá un nuevo registro.' }: { title?: string; detail?: string }) {
  return <div className="core-empty"><strong>{title}</strong><span>{detail}</span></div>
}

export function ConfirmAction({ label, disabled, onClick, danger = false }: { label: string; disabled?: boolean; onClick: () => void; danger?: boolean }) {
  return <button type="button" disabled={disabled} className={danger ? 'core-text-button core-danger-text' : 'core-text-button'} onClick={onClick}>{label}</button>
}
