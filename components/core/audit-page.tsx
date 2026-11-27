'use client'

import { Fragment, FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileJson, FileSpreadsheet, Search, SlidersHorizontal, X } from 'lucide-react'
import useSWR from 'swr'
import { coreFetch, coreJson, fetcher, seg } from '@/lib/core-client'
import { toNumber, type CoreApp, type CoreAuditPage, type CoreAuditRow, type CoreUserDetail } from '@/lib/core-api/types'
import { AUDIT_ACTIONS, auditActionLabel, auditActionText, auditActorTypeLabel, auditEntityTypeLabel } from '@/lib/audit-labels'
import { errorField } from '@/lib/error-messages'
import { formatUtc } from './overview-apps'
import { DisabledReason, EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, SecondaryButton, fieldError } from './shared'
import { useToast } from './toast'
import { ROUTES, useUrlParams } from './url-state'

// `applicationId` no está en el formulario: llega desde "Ver auditoría" de una aplicación y se muestra como aviso.
const FILTER_KEYS = ['from', 'to', 'appKey', 'applicationId', 'actorType', 'actorId', 'action', 'entityType', 'entityId', 'correlationId'] as const
type FilterKey = (typeof FILTER_KEYS)[number]
type Filters = Record<FilterKey, string> & { page: string; pageSize: string }
const PAGE_SIZES = ['25', '50', '100', '200']
/** En el historial de un usuario se traen hasta 200 eventos por criterio (máximo de la API). */
const USER_HISTORY_LIMIT = 200
const TEXT_FILTERS: Array<{ name: FilterKey; label: string; list?: string }> = [
  { name: 'action', label: 'Acción', list: 'audit-actions' },
  { name: 'actorId', label: 'ID del actor' },
  { name: 'entityType', label: 'Tipo de entidad', list: 'audit-entity-types' },
  { name: 'entityId', label: 'ID de la entidad' },
  { name: 'correlationId', label: 'Correlation ID' },
]
const ENTITY_TYPES = ['User', 'Application', 'Role', 'Permission', 'UserApplicationAccess', 'EmailTemplate', 'RefreshTokenFamily', 'Notification']

function filtersFromParams(params: URLSearchParams): Filters {
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ''])) as Record<FilterKey, string>
  const pageSize = params.get('pageSize') ?? '25'
  return { ...filters, page: params.get('page') ?? '1', pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : '25' }
}

function apiQuery(filters: Partial<Filters>, { paged }: { paged: boolean }) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (!value || (!paged && (key === 'page' || key === 'pageSize'))) continue
    // Los filtros de fecha se tipean en hora local y se mandan en UTC.
    if (key === 'from' || key === 'to') query.set(key, new Date(value).toISOString())
    else query.set(key, value)
  }
  return query
}

/** Historial de un usuario: Core combina los filtros con AND, así que se piden dos listas y se unen. */
async function fetchUserHistory(key: string): Promise<CoreAuditRow[]> {
  const userId = key.split(':')[1]
  const [asEntity, asActor] = await Promise.all([
    coreJson<CoreAuditPage>(`api/audit-logs?entityId=${seg(userId)}&pageSize=${USER_HISTORY_LIMIT}`),
    coreJson<CoreAuditPage>(`api/audit-logs?actorId=${seg(userId)}&pageSize=${USER_HISTORY_LIMIT}`),
  ])
  const byId = new Map<string, CoreAuditRow>()
  for (const row of [...asEntity.items, ...asActor.items]) byId.set(row.id, row)
  return [...byId.values()].sort((a, b) => b.occurredAtUtc.localeCompare(a.occurredAtUtc) || b.id.localeCompare(a.id))
}

export function AuditPage() {
  const { data: apps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [params, setParams] = useUrlParams()
  // Los filtros aplicados viven en la URL: refresh, atrás/adelante y links (desde el Resumen o el
  // detalle de un usuario) muestran lo mismo. El formulario edita un borrador hasta "Aplicar".
  const active = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params])
  const historyUserId = params.get('usuario')
  const highlighted = params.get('evento')
  const [draft, setDraft] = useState<Filters>(active)
  useEffect(() => { setDraft(active) }, [active])
  const [expanded, setExpanded] = useState<string | null>(highlighted)
  useEffect(() => { if (highlighted) setExpanded(highlighted) }, [highlighted])
  const [exporting, setExporting] = useState(false)
  // Los filtros arrancan colapsados para que la tabla quede a la vista; se abren solos si hay un error de fecha.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const toast = useToast()

  const pageKey = historyUserId ? null : `api/audit-logs?${apiQuery(active, { paged: true }).toString()}`
  const { data, error, isLoading } = useSWR<CoreAuditPage>(pageKey, fetcher<CoreAuditPage>, { keepPreviousData: true })
  const history = useSWR<CoreAuditRow[]>(historyUserId ? `audit-user:${historyUserId}` : null, fetchUserHistory)
  const historyUser = useSWR<CoreUserDetail>(historyUserId ? `api/users/${seg(historyUserId)}` : null, fetcher<CoreUserDetail>, { shouldRetryOnError: false })
  const rows = historyUserId ? history.data : data?.items
  const loading = historyUserId ? history.isLoading : isLoading && !data
  const viewError = historyUserId ? history.error : error

  useEffect(() => {
    if (!highlighted || !rows?.length) return
    document.getElementById(`audit-row-${highlighted}`)?.scrollIntoView({ block: 'center' })
  }, [highlighted, rows])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: Record<string, string | null> = { usuario: null, evento: null, page: null, pageSize: draft.pageSize === '25' ? null : draft.pageSize }
    for (const key of FILTER_KEYS) next[key] = draft[key] || null
    setParams(next)
    setFiltersOpen(false)
  }

  async function exportData(format: 'csv' | 'json') {
    setExporting(true)
    // El export no pagina: usa los mismos filtros y falla con AuditLogs.ExportTooLarge si pasa las 100.000 filas.
    const query = apiQuery(active, { paged: false })
    query.set('format', format)
    try {
      const response = await coreFetch(`api/audit-logs/export?${query.toString()}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `href-core-audit-${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
      toast.success('Exportación descargada.')
    } catch (caught) { toast.fromError(caught) }
    finally { setExporting(false) }
  }

  function changePage(page: number) {
    setParams({ page: page > 1 ? String(page) : null, evento: null })
    setExpanded(null)
  }

  const exportReason = historyUserId ? 'El historial de un usuario combina dos búsquedas. Para exportar, filtrá por ID de la entidad o por ID del actor.' : null
  const filteredApp = active.applicationId ? apps?.find((app) => app.id === active.applicationId) : null
  // Los errores de fecha van debajo del campo "Desde"; el resto, en el aviso de la página.
  const dateError = fieldError(viewError, 'from')
  useEffect(() => { if (dateError) setFiltersOpen(true) }, [dateError])
  // applicationId se muestra en su propio aviso: no cuenta como filtro del formulario.
  const activeFilterCount = FILTER_KEYS.filter((key) => key !== 'applicationId' && active[key]).length
  const userLabel = historyUser.data ? `${historyUser.data.fullName} (${historyUser.data.email})` : historyUserId

  return <>
    <PageHeading eyebrow="CONTROL · TRAZABILIDAD" title="Auditoría" description="Filtrá eventos registrados y exportá hasta 100.000 filas con los mismos filtros." action={<div className="core-action-group"><DisabledReason reason={exportReason}><SecondaryButton disabled={exporting || Boolean(historyUserId)} onClick={() => void exportData('csv')}><FileSpreadsheet aria-hidden="true" /> CSV</SecondaryButton></DisabledReason><DisabledReason reason={exportReason}><SecondaryButton disabled={exporting || Boolean(historyUserId)} onClick={() => void exportData('json')}><FileJson aria-hidden="true" /> JSON</SecondaryButton></DisabledReason></div>} />
    {viewError && !errorField(viewError) && <ErrorNotice error={viewError} />}
    {active.applicationId && !historyUserId && <div className="core-inline-note core-history-note"><div><strong>Auditoría de la aplicación {filteredApp ? `${filteredApp.name} (${filteredApp.appKey})` : <code>{active.applicationId}</code>}</strong><p>Filtra por el id de la aplicación: no incluye eventos de otra aplicación que haya usado el mismo key.{!filteredApp && apps ? ' La aplicación ya no existe; se muestra su historial.' : ''}</p></div><button type="button" className="core-icon-button" aria-label="Quitar el filtro de aplicación" onClick={() => setParams({ applicationId: null, page: null, evento: null })}><X aria-hidden="true" /></button></div>}
    {historyUserId && <div className="core-inline-note core-history-note"><div><strong>Historial de {userLabel}</strong><p>Eventos donde el usuario es la entidad (bloqueos, cambios de datos, cierre de sesiones) o el actor (lo que hizo él), unidos y ordenados por fecha; hasta {USER_HISTORY_LIMIT} de cada tipo. Los cambios de acceso a aplicaciones se registran con el id del acceso, no del usuario, así que no aparecen acá: buscalos con tipo de entidad <code>UserApplicationAccess</code>.</p></div><Link href={ROUTES.audit} className="core-icon-button" aria-label="Quitar el filtro de usuario"><X aria-hidden="true" /></Link></div>}
    <Panel className={`core-audit-filters${filtersOpen ? ' is-open' : ''}`}><button type="button" className="core-filters-toggle" aria-expanded={filtersOpen} aria-controls="audit-filters-form" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal aria-hidden="true" /><strong>Filtros</strong>{activeFilterCount > 0 ? <span className="core-badge core-badge-neutral">{activeFilterCount} {activeFilterCount === 1 ? 'activo' : 'activos'}</span> : <small>Sin filtros aplicados</small>}<ChevronDown aria-hidden="true" className="core-filters-chevron" /></button><form id="audit-filters-form" hidden={!filtersOpen} onSubmit={applyFilters}><div className="core-filter-grid">
      <Field label="Desde" error={dateError}><input type="datetime-local" className="core-input" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field>
      <Field label="Hasta"><input type="datetime-local" className="core-input" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field>
      <Field label="App key" hint="Trae los eventos de todas las aplicaciones que usaron ese key."><select className="core-input" value={draft.appKey} onChange={(event) => setDraft({ ...draft, appKey: event.target.value })}><option value="">Todas</option>{apps?.map((app) => <option key={app.appKey} value={app.appKey}>{app.name}</option>)}</select></Field>
      <Field label="Tipo de actor"><select className="core-input" value={draft.actorType} onChange={(event) => setDraft({ ...draft, actorType: event.target.value })}><option value="">Todos</option>{['User', 'Application', 'System', 'Anonymous'].map((type) => <option key={type} value={type}>{auditActorTypeLabel(type)}</option>)}</select></Field>
      {TEXT_FILTERS.map(({ name, label, list }) => <Field key={name} label={label}><input className="core-input" value={draft[name]} list={list} autoComplete="off" spellCheck={false} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} /></Field>)}
      <Field label="Filas por página"><select className="core-input" value={draft.pageSize} onChange={(event) => setDraft({ ...draft, pageSize: event.target.value })}>{PAGE_SIZES.map((count) => <option key={count} value={count}>{count}</option>)}</select></Field>
    </div>
      <datalist id="audit-actions">{AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{auditActionLabel(action)}</option>)}</datalist>
      <datalist id="audit-entity-types">{ENTITY_TYPES.map((type) => <option key={type} value={type}>{auditEntityTypeLabel(type)}</option>)}</datalist>
      <div className="core-filter-footer"><span>{historyUserId ? 'Aplicar filtros reemplaza el historial del usuario.' : 'Exportación limitada a 100.000 filas.'}</span><button className="core-primary-button" type="submit"><Search aria-hidden="true" /> Aplicar filtros</button></div></form></Panel>
    <Panel className="core-table-panel">{loading ? <LoadingState /> : !rows?.length ? <EmptyState title="No hay eventos para estos filtros" detail="Modificá el rango de fechas o los criterios de búsqueda." /> : <div className="core-table-scroll"><table className="core-table core-audit-table"><thead><tr><th>FECHA</th><th>ACCIÓN</th><th>ENTIDAD</th><th>ENTITY ID</th><th>ACTOR</th><th>ACTOR ID</th><th>APP KEY</th><th>CORRELATION ID</th><th>IP</th></tr></thead><tbody>{rows.map((row) => {
      const isExpanded = expanded === row.id
      return <Fragment key={row.id}><tr id={`audit-row-${row.id}`} className={`core-clickable-row${highlighted === row.id ? ' core-audit-highlight' : ''}`} onClick={() => setExpanded(isExpanded ? null : row.id)}>
        <td><button type="button" className="core-link-button" aria-expanded={isExpanded} onClick={(event) => { event.stopPropagation(); setExpanded(isExpanded ? null : row.id) }}>{formatUtc(row.occurredAtUtc)}</button></td>
        <td><strong>{auditActionText(row)}</strong><small className="core-cell-subtitle">{row.action}</small></td>
        <td>{auditEntityTypeLabel(row.entityType) || '—'}</td><td><code>{row.entityId ?? '—'}</code></td>
        <td>{auditActorTypeLabel(row.actorType)}</td><td><code>{row.actorId ?? '—'}</code></td>
        <td><code>{row.appKey || '—'}</code></td><td><code>{row.correlationId ?? '—'}</code></td><td>{row.ipAddress || '—'}</td>
      </tr>{isExpanded && <tr className="core-audit-detail-row"><td colSpan={9}><div className="core-json-diff"><div><h3>oldValues</h3><pre>{JSON.stringify(row.oldValues ?? null, null, 2)}</pre></div><div><h3>newValues</h3><pre>{JSON.stringify(row.newValues ?? null, null, 2)}</pre></div></div>{row.applicationId && <p className="core-detail-note">Application ID: <code>{row.applicationId}</code></p>}{row.userAgent && <p className="core-detail-note">User-Agent: {row.userAgent}</p>}</td></tr>}</Fragment>
    })}</tbody></table></div>}</Panel>
    {historyUserId && history.data && <div className="core-pagination"><span>{history.data.length.toLocaleString('es-AR')} eventos</span></div>}
    {!historyUserId && data && (() => { const page = toNumber(data.page); const pageSize = toNumber(data.pageSize); const total = toNumber(data.totalCount); return <div className="core-pagination"><span>{total.toLocaleString('es-AR')} filas en total</span><div><SecondaryButton disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</SecondaryButton><span>Página {page} · {pageSize} por página</span><SecondaryButton disabled={page * pageSize >= total} onClick={() => changePage(page + 1)}>Siguiente</SecondaryButton></div></div> })()}
  </>
}
