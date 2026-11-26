'use client'

import { cloneElement, createContext, FormEvent, isValidElement, KeyboardEvent, ReactElement, ReactNode, RefObject, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Tooltip } from '@base-ui/react/tooltip'
import { AlertTriangle, LoaderCircle, MoreHorizontal, X } from 'lucide-react'
import useSWR from 'swr'
import { CoreApiError, CoreSession, SESSION_KEY, fetchSession } from '@/lib/core-client'
import { errorMessage } from '@/lib/error-messages'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="core-page-heading"><div><p className="core-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action && <div className="core-heading-action">{action}</div>}</div>
}

type ButtonProps = { children: ReactNode; disabled?: boolean; onClick?: () => void; className?: string; 'aria-label'?: string }

export function PrimaryButton({ children, type = 'button', disabled, onClick, className = '', ...rest }: ButtonProps & { type?: 'button' | 'submit' }) {
  return <button type={type} className={`core-primary-button ${className}`} disabled={disabled} onClick={onClick} aria-label={rest['aria-label']}>{children}</button>
}

export function SecondaryButton({ children, disabled, onClick, className = '', ...rest }: ButtonProps) {
  return <button type="button" className={`core-secondary-button ${className}`} disabled={disabled} onClick={onClick} aria-label={rest['aria-label']}>{children}</button>
}

export function DangerButton({ children, type = 'button', disabled, onClick, className = '' }: ButtonProps & { type?: 'button' | 'submit' }) {
  return <button type={type} className={`core-primary-button core-danger-button ${className}`} disabled={disabled} onClick={onClick}>{children}</button>
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return <span className={`core-badge core-badge-${tone}`}>{children}</span>
}

export function ErrorNotice({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  const apiError = error instanceof CoreApiError ? error : null
  return <div className="core-error" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>{errorMessage(error)}</strong><small>{apiError ? `Código: ${apiError.errorCode} · Correlation ID: ${apiError.correlationId}` : 'Volvé a intentar. Si el problema continúa, contactá soporte.'}</small></div>{onDismiss && <button type="button" aria-label="Cerrar aviso" onClick={onDismiss}><X aria-hidden="true" /></button>}</div>
}

/**
 * Aviso de error de la página. Mientras haya un modal o panel lateral abierto no se muestra: el
 * error ya aparece adentro del diálogo y el banner quedaría tapado por el overlay.
 */
export function PageErrorNotice({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  const overlayOpen = useOverlayOpen()
  if (!error || overlayOpen) return null
  return <ErrorNotice error={error} onDismiss={onDismiss} />
}

export function LoadingState({ label = 'Cargando datos…' }: { label?: string }) {
  return <div className="core-loading" role="status"><LoaderCircle aria-hidden="true" /> {label}</div>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`core-panel ${className}`}>{children}</section>
}

// ---------------------------------------------------------------------------------------------
// Overlays (modales y panel lateral): cuántos hay abiertos, foco inicial, trampa de foco y Escape.
// ---------------------------------------------------------------------------------------------
let openOverlays = 0
const overlayListeners = new Set<() => void>()
const overlayStore = {
  subscribe(listener: () => void) { overlayListeners.add(listener); return () => { overlayListeners.delete(listener) } },
  get: () => openOverlays > 0,
  change(delta: number) { openOverlays = Math.max(0, openOverlays + delta); overlayListeners.forEach((l) => l()) },
}

/** `true` mientras haya algún modal o panel lateral abierto. */
export function useOverlayOpen() {
  return useSyncExternalStore(overlayStore.subscribe, overlayStore.get, () => false)
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], iframe, [tabindex="0"]'
const INITIAL_FOCUS = '[data-autofocus], input:not(:disabled):not([readonly]):not([type="hidden"]):not([type="checkbox"]), select:not(:disabled), textarea:not(:disabled):not([readonly])'

/**
 * Comportamiento común de los diálogos: registra el overlay, pone el foco en el primer campo
 * editable (o en `[data-autofocus]`), lo devuelve al cerrar, encierra Tab adentro y cierra con
 * Escape cuando `onEscape` está definido.
 */
export function useDialogBehavior(ref: RefObject<HTMLElement | null>, onEscape?: () => void) {
  useEffect(() => {
    overlayStore.change(1)
    const previous = document.activeElement
    const node = ref.current
    const target = node?.querySelector<HTMLElement>(INITIAL_FOCUS)
    ;(target ?? node)?.focus()
    return () => {
      overlayStore.change(-1)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
    // El foco inicial se resuelve una sola vez, al abrir.
  }, [])

  return function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      // Un diálogo anidado (por ejemplo, un modal dentro del panel de usuario) no cierra al padre.
      event.stopPropagation()
      if (onEscape) { event.preventDefault(); onEscape() }
      return
    }
    if (event.key !== 'Tab' || !ref.current) return
    const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null || element === document.activeElement)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first) { event.preventDefault(); return }
    if (!ref.current.contains(document.activeElement) || document.activeElement === ref.current) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}

/**
 * Modal del panel. `dismissible={false}` para los que muestran un secreto: no se cierran con
 * Escape ni con un clic afuera, solo con el botón explícito.
 */
export function Modal({ title, children, onClose, wide = false, dismissible = true }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; dismissible?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const handleKeyDown = useDialogBehavior(dialogRef, dismissible ? onClose : undefined)
  return <div className="core-modal-backdrop" onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose() }}><section ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()} className={`core-modal${wide ? ' core-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header className="core-modal-head"><div><p className="core-eyebrow">HREF CORE</p><h2 id={titleId}>{title}</h2></div>{dismissible && <button className="core-icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button>}</header><div className="core-modal-content">{children}</div></section></div>
}

/**
 * Campo con label asociado: el control hijo recibe `id` (y `aria-describedby` si hay ayuda),
 * así lectores de pantalla y tests encuentran el campo por su label.
 */
export function Field({ label, children, hint }: { label: string; children: ReactElement<{ id?: string; 'aria-describedby'?: string }>; hint?: ReactNode }) {
  const generatedId = useId()
  const hintId = useId()
  const id = children.props.id ?? generatedId
  const describedBy = [children.props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return <div className="core-field"><label htmlFor={id}>{label}</label>{isValidElement(children) ? cloneElement(children, { id, 'aria-describedby': describedBy }) : children}{hint && <small id={hintId}>{hint}</small>}</div>
}

/** Checkbox con label y descripción asociados (evita que se anuncie como "on"). */
export function CheckRow({ name, label, detail, defaultChecked, checked, disabled, onChange }: { name?: string; label: string; detail?: string; defaultChecked?: boolean; checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }) {
  const id = useId()
  return <div className="core-check-row"><input id={id} type="checkbox" aria-label={label} name={name} defaultChecked={defaultChecked} checked={checked} disabled={disabled} aria-describedby={detail ? `${id}-detail` : undefined} onChange={onChange ? (event) => onChange(event.target.checked) : undefined} /><label htmlFor={id}><strong>{label}</strong>{detail && <small id={`${id}-detail`}>{detail}</small>}</label></div>
}

export function EmptyState({ title = 'No hay resultados', detail = 'Ajustá los filtros o creá un nuevo registro.' }: { title?: string; detail?: string }) {
  return <div className="core-empty"><strong>{title}</strong><span>{detail}</span></div>
}

// ---------------------------------------------------------------------------------------------
// Tooltip para explicar por qué una acción está deshabilitada. Un botón deshabilitado no recibe
// foco ni eventos de mouse, así que el tooltip va en un envoltorio enfocable.
// ---------------------------------------------------------------------------------------------
export function DisabledReason({ reason, children }: { reason?: string | null; children: ReactNode }) {
  const id = useId()
  if (!reason) return <>{children}</>
  return <Tooltip.Root>
    <Tooltip.Trigger delay={150} render={<span className="core-disabled-reason" tabIndex={0} aria-describedby={id} />}>{children}</Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Positioner sideOffset={6} className="core-tooltip-positioner"><Tooltip.Popup className="core-tooltip" id={id}>{reason}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>
}

// ---------------------------------------------------------------------------------------------
// Menú de acciones de una fila (accesible: teclado, Escape, foco). Se renderiza en un portal para
// que no lo recorte el scroll de la tabla.
// ---------------------------------------------------------------------------------------------
export type RowAction = { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; reason?: string; danger?: boolean }

export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  // La acción corre cuando el menú terminó de cerrarse: el foco ya volvió al botón "⋯", así el
  // modal que abre la acción lo devuelve ahí al cerrarse.
  const pending = useRef<(() => void) | null>(null)
  return <Menu.Root onOpenChangeComplete={(open) => { if (!open && pending.current) { const run = pending.current; pending.current = null; window.setTimeout(run, 0) } }}>
    <Menu.Trigger className="core-icon-button core-row-menu-trigger" aria-label={label}><MoreHorizontal aria-hidden="true" /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={4} align="end" className="core-menu-positioner"><Menu.Popup className="core-menu">
      {actions.map((action) => <Menu.Item key={action.label} className={`core-menu-item${action.danger ? ' core-menu-item-danger' : ''}`} disabled={action.disabled} onClick={() => { pending.current = action.onSelect }}>{action.icon}<span>{action.label}{action.disabled && action.reason && <small>{action.reason}</small>}</span></Menu.Item>)}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>
}

// ---------------------------------------------------------------------------------------------
// Sesión actual (para no ofrecerle al admin acciones sobre sí mismo).
// ---------------------------------------------------------------------------------------------
export function useCurrentSession(): CoreSession | null {
  const { data } = useSWR<CoreSession | null>(SESSION_KEY, fetchSession, { revalidateOnFocus: false, revalidateIfStale: false })
  return data ?? null
}

export function isCurrentUser(session: CoreSession | null, user: { id: string; email: string } | null | undefined) {
  if (!session || !user) return false
  if (session.userId) return session.userId === user.id
  return Boolean(session.email) && session.email.toLowerCase() === user.email.toLowerCase()
}

// ---------------------------------------------------------------------------------------------
// Diálogo de confirmación propio (reemplaza window.confirm / window.prompt).
// La acción corre con el diálogo abierto: si falla, el error se muestra adentro.
// ---------------------------------------------------------------------------------------------
export type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  /** Campo de texto opcional (por ejemplo, el motivo del bloqueo). */
  reason?: { label: string; maxLength: number; hint?: string }
  /** Texto que hay que tipear para habilitar el botón (por ejemplo, la app key `core`). */
  requireText?: string
  /** Si devuelve una promesa, el diálogo espera; si falla, muestra el error y sigue abierto. */
  action: (reason: string) => unknown
}

type ConfirmState = ConfirmOptions & { resolve: (confirmed: boolean) => void }
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })), [])
  return <ConfirmContext.Provider value={confirm}>{children}{state && <ConfirmDialog key={state.title} state={state} onDone={(confirmed) => { state.resolve(confirmed); setState(null) }} />}</ConfirmContext.Provider>
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm requiere ConfirmProvider')
  return confirm
}

function ConfirmDialog({ state, onDone }: { state: ConfirmState; onDone: (confirmed: boolean) => void }) {
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const blocked = Boolean(state.requireText) && typed.trim() !== state.requireText

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked || busy) return
    setBusy(true); setError(null)
    try {
      await state.action(reason.trim())
      onDone(true)
    } catch (caught) {
      setError(caught)
      setBusy(false)
    }
  }

  const ConfirmButton = state.danger ? DangerButton : PrimaryButton
  return <Modal title={state.title} onClose={() => { if (!busy) onDone(false) }}>
    {error ? <ErrorNotice error={error} /> : null}
    <form className="core-form" onSubmit={submit}>
      <div className="core-confirm-message">{state.message}</div>
      {state.reason && <Field label={state.reason.label} hint={state.reason.hint ?? `Opcional. Máximo ${state.reason.maxLength} caracteres (${reason.length}/${state.reason.maxLength}).`}><textarea className="core-input core-textarea" value={reason} maxLength={state.reason.maxLength} onChange={(event) => setReason(event.target.value)} /></Field>}
      {state.requireText && <Field label={`Escribí ${state.requireText} para confirmar`}><input className="core-input" value={typed} autoComplete="off" spellCheck={false} onChange={(event) => setTyped(event.target.value)} /></Field>}
      <div className="core-form-actions"><SecondaryButton disabled={busy} onClick={() => onDone(false)}>Cancelar</SecondaryButton><ConfirmButton type="submit" disabled={busy || blocked}>{busy ? 'Procesando…' : state.confirmLabel}</ConfirmButton></div>
    </form>
  </Modal>
}
