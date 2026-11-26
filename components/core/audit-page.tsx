'use client'

import { Fragment, FormEvent, useMemo, useState } from 'react'
import { Download, FileJson, FileSpreadsheet, Search } from 'lucide-react'
import useSWR from 'swr'
import { coreFetch, fetcher } from '@/lib/core-client'
import { toNumber, type CoreApp, type CoreAuditPage } from '@/lib/core-api/types'
import { formatUtc } from './overview-apps'
import { EmptyState, ErrorNotice, Field, LoadingState, PageHeading, Panel, SecondaryButton, StatusBadge } from './shared'

type Filters = { from: string; to: string; appKey: string; actorType: string; actorId: string; action: string; entityType: string; entityId: string; correlationId: string; page: string; pageSize: string }
const initialFilters: Filters = { from: '', to: '', appKey: '', actorType: '', actorId: '', action: '', entityType: '', entityId: '', correlationId: '', page: '1', pageSize: '25' }

export function AuditPage() {
  const { data: apps } = useSWR<CoreApp[]>('api/apps', fetcher<CoreApp[]>)
  const [draft, setDraft] = useState<Filters>(initialFilters)
  const [active, setActive] = useState<Filters>(initialFilters)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exportError, setExportError] = useState<unknown>(null)
  const [exporting, setExporting] = useState(false)
  const query = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(active).forEach(([key, value]) => {
      if (!value) return
      if (key === 'from' || key === 'to') params.set(key, new Date(value).toISOString())
      else params.set(key, value)
    })
    return params.toString()
  }, [active])
  const key = `api/audit-logs?${query}`
  const { data, error, isLoading } = useSWR<CoreAuditPage>(key, fetcher<CoreAuditPage>)

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActive({ ...draft, page: '1' })
  }

  async function exportData(format: 'csv' | 'json') {
    setExportError(null); setExporting(true)
    const params = new URLSearchParams()
    Object.entries(active).forEach(([key, value]) => {
      if (key === 'page' || key === 'pageSize' || !value) return
      if (key === 'from' || key === 'to') params.set(key, new Date(value).toISOString())
      else params.set(key, value)
    })
    // El export no pagina: usa los mismos filtros y falla con AuditLogs.ExportTooLarge si pasa las 100.000 filas.
    params.set('format', format)
    try {
      const response = await coreFetch(`api/audit-logs/export?${params.toString()}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `href-core-audit-${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
    } catch (caught) { setExportError(caught) }
    finally { setExporting(false) }
  }

  function changePage(page: number) {
    const next = { ...active, page: String(page) }
    setDraft(next); setActive(next); setExpanded(null)
  }

  return <>
    <PageHeading eyebrow="CONTROL · TRAZABILIDAD" title="Auditoría" description="Filtrá eventos registrados y exportá hasta 100.000 filas con los mismos filtros." action={<div className="core-action-group"><SecondaryButton disabled={exporting} onClick={() => void exportData('csv')}><FileSpreadsheet aria-hidden="true" /> CSV</SecondaryButton><SecondaryButton disabled={exporting} onClick={() => void exportData('json')}><FileJson aria-hidden="true" /> JSON</SecondaryButton></div>} />
    {error && <ErrorNotice error={error} />}{exportError && <ErrorNotice error={exportError} onDismiss={() => setExportError(null)} />}
    <Panel className="core-audit-filters"><form onSubmit={applyFilters}><div className="core-filter-grid"><Field label="Desde"><input type="datetime-local" className="core-input" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field><Field label="Hasta"><input type="datetime-local" className="core-input" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field><Field label="Aplicación"><select className="core-input" value={draft.appKey} onChange={(event) => setDraft({ ...draft, appKey: event.target.value })}><option value="">Todas</option>{apps?.map((app) => <option key={app.appKey} value={app.appKey}>{app.name}</option>)}</select></Field><Field label="Tipo de actor"><select className="core-input" value={draft.actorType} onChange={(event) => setDraft({ ...draft, actorType: event.target.value })}><option value="">Todos</option>{['User', 'Application', 'System', 'Anonymous'].map((type) => <option key={type}>{type}</option>)}</select></Field>{(['actorId', 'action', 'entityType', 'entityId', 'correlationId'] as const).map((name) => <Field key={name} label={name}><input className="core-input" value={draft[name]} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} /></Field>)}<Field label="Filas por página"><select className="core-input" value={draft.pageSize} onChange={(event) => setDraft({ ...draft, pageSize: event.target.value })}>{['25', '50', '100', '200'].map((count) => <option key={count}>{count}</option>)}</select></Field></div><div className="core-filter-footer"><span>Exportación limitada a 100.000 filas.</span><button className="core-primary-button" type="submit"><Search aria-hidden="true" /> Aplicar filtros</button></div></form></Panel>
    <Panel className="core-table-panel">{isLoading ? <LoadingState /> : !data?.items.length ? <EmptyState title="No hay eventos para estos filtros" detail="Modificá el rango de fechas o los criterios de búsqueda." /> : <div className="core-table-scroll"><table className="core-table core-audit-table"><thead><tr><th>FECHA</th><th>ACCIÓN</th><th>ENTITY TYPE</th><th>ENTITY ID</th><th>ACTOR TYPE</th><th>ACTOR ID</th><th>APP KEY</th><th>CORRELATION ID</th><th>IP</th></tr></thead><tbody>{data.items.map((row) => { const rowKey = row.id; const isExpanded = expanded === rowKey; return <Fragment key={rowKey}><tr className="core-clickable-row" onClick={() => setExpanded(isExpanded ? null : rowKey)}><td><button type="button" className="core-link-button" aria-expanded={isExpanded} onClick={(event) => { event.stopPropagation(); setExpanded(isExpanded ? null : rowKey) }}>{formatUtc(row.occurredAtUtc)}</button></td><td><strong>{row.action}</strong></td><td>{row.entityType}</td><td><code>{row.entityId}</code></td><td>{row.actorType}</td><td><code>{row.actorId}</code></td><td><code>{row.appKey || '—'}</code></td><td><code>{row.correlationId}</code></td><td>{row.ipAddress || '—'}</td></tr>{isExpanded && <tr className="core-audit-detail-row"><td colSpan={9}><div className="core-json-diff"><div><h3>oldValues</h3><pre>{JSON.stringify(row.oldValues ?? null, null, 2)}</pre></div><div><h3>newValues</h3><pre>{JSON.stringify(row.newValues ?? null, null, 2)}</pre></div></div></td></tr>}</Fragment> })}</tbody></table></div>}</Panel>
    {data && (() => { const page = toNumber(data.page); const pageSize = toNumber(data.pageSize); const total = toNumber(data.totalCount); return <div className="core-pagination"><span>{total.toLocaleString('es-AR')} filas en total</span><div><SecondaryButton disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</SecondaryButton><span>Página {page} · {pageSize} por página</span><SecondaryButton disabled={page * pageSize >= total} onClick={() => changePage(page + 1)}>Siguiente</SecondaryButton></div></div> })()}
  </>
}
