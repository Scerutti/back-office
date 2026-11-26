'use client'

import { FormEvent, useState } from 'react'
import { Eye, Plus, Save, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { coreJson, fetcher, jsonBody, seg } from '@/lib/core-client'
import type { CoreCreateTemplate, CoreTemplate, CoreTemplatePreview, CoreTemplateSummary, CoreUpdateTemplate } from '@/lib/core-api/types'
import { formatUtc } from './overview-apps'
import { EmptyState, ErrorNotice, Field, LoadingState, Modal, PageErrorNotice, PageHeading, Panel, PrimaryButton, SecondaryButton, StatusBadge, useConfirm } from './shared'
import { useUrlParams } from './url-state'

const placeholderKey = (value: string) => value.replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
const placeholderToken = (value: string) => `{{${placeholderKey(value)}}}`
const TEMPLATE_KEY_RULE = <>De 3 a 100 caracteres: minúsculas, números y guiones (no al principio ni al final). Ejemplo: <code>bienvenida-cliente</code>. No se puede cambiar después.</>

export function TemplatesPage() {
  const { data: templates, error, isLoading, mutate: refresh } = useSWR<CoreTemplateSummary[]>('api/notifications/templates', fetcher<CoreTemplateSummary[]>)
  // El template abierto vive en la URL (?key=), así funcionan refresh, atrás/adelante y links directos.
  const [params, setParams] = useUrlParams()
  const selectedKey = params.get('key')
  const setSelectedKey = (key: string | null) => setParams({ key })
  const confirm = useConfirm()
  const [editorOpen, setEditorOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewError, setPreviewError] = useState<unknown>(null)
  const [rendered, setRendered] = useState<CoreTemplatePreview | null>(null)
  const [templateError, setTemplateError] = useState<unknown>(null)
  const [placeholderWarning, setPlaceholderWarning] = useState('')
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const selectedSummary = templates?.find((item) => item.key === selectedKey)
  const { data: template, error: detailError, isLoading: detailLoading, mutate: refreshDetail } = useSWR<CoreTemplate>(selectedKey ? `api/notifications/templates/${seg(selectedKey)}` : null, fetcher<CoreTemplate>)
  const selected = template
  const editing = creating ? null : template
  const placeholders = selected?.placeholders?.map(placeholderKey) ?? []

  function openEditor(newTemplate: boolean) {
    setCreating(newTemplate); setTemplateError(null); setPlaceholderWarning(''); setEditorOpen(true)
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const content: CoreUpdateTemplate = {
      name: String(form.get('name')).trim(),
      description: String(form.get('description')).trim() || null,
      subject: String(form.get('subject')),
      htmlBody: String(form.get('htmlBody')),
      textBody: String(form.get('textBody')) || null,
    }
    // Los placeholders obligatorios de las plantillas de sistema los valida la API
    // (Templates.MissingRequiredPlaceholders / Templates.UnknownPlaceholders).
    setPlaceholderWarning('')
    setSaving(true); setTemplateError(null)
    try {
      if (creating) {
        const body: CoreCreateTemplate = { key: String(form.get('key')).trim(), ...content }
        const result = await coreJson<CoreTemplate>('api/notifications/templates', { method: 'POST', ...jsonBody(body) })
        await refresh(); setSelectedKey(result.key)
      } else if (editing) {
        await coreJson<CoreTemplate>(`api/notifications/templates/${seg(editing.key)}`, { method: 'PUT', ...jsonBody(content) })
        await Promise.all([refresh(), refreshDetail()])
      }
      setEditorOpen(false)
    } catch (caught) { setTemplateError(caught) }
    finally { setSaving(false) }
  }

  function deleteTemplate(item: CoreTemplate) {
    if (item.isSystem) return
    setTemplateError(null)
    void confirm({
      title: 'Eliminar template',
      message: <p>¿Eliminar la plantilla <strong>{item.name}</strong> (<code>{item.key}</code>)? No se puede deshacer.</p>,
      confirmLabel: 'Eliminar template',
      danger: true,
      action: async () => { await coreJson(`api/notifications/templates/${seg(item.key)}`, { method: 'DELETE' }); await refresh(); if (selectedKey === item.key) setSelectedKey(null) },
    })
  }

  async function renderPreview() {
    if (!selected) return
    setPreviewError(null); setPreviewing(true)
    try {
      const result = await coreJson<CoreTemplatePreview>(`api/notifications/templates/${seg(selected.key)}/preview`, { method: 'POST', ...jsonBody({ variables: values }) })
      setRendered(result)
    } catch (caught) { setPreviewError(caught) }
    finally { setPreviewing(false) }
  }

  return <>
    <PageHeading eyebrow="NOTIFICACIONES · CONTENIDO" title="Templates de email" description="Editá el contenido de las plantillas y revisá su renderizado." action={<PrimaryButton onClick={() => openEditor(true)}><Plus aria-hidden="true" /> Nuevo template</PrimaryButton>} />
    {error ? <ErrorNotice error={error} /> : null}<PageErrorNotice error={templateError} onDismiss={() => setTemplateError(null)} />{detailError ? <ErrorNotice error={detailError} /> : null}
    <div className="core-template-layout"><Panel className="core-template-list"><div className="core-panel-heading"><div><h2>Plantillas</h2><p>{templates?.length ?? 0} disponibles</p></div></div>{isLoading ? <LoadingState /> : templates?.length ? templates.map((item) => <button type="button" className={`core-template-list-item${selectedKey === item.key ? ' is-selected' : ''}`} key={item.key} aria-label={`${item.name} (${item.key}), ${item.isSystem ? 'sistema' : 'custom'}`} aria-current={selectedKey === item.key ? 'true' : undefined} onClick={() => { setSelectedKey(item.key); setValues({}); setEditorOpen(false) }}><span><strong>{item.name}</strong><code>{item.key}</code></span><span className="core-template-meta">{item.isSystem ? <StatusBadge>Sistema</StatusBadge> : <StatusBadge tone="neutral">Custom</StatusBadge>}<small>{formatUtc(item.updatedAtUtc)}</small></span></button>) : <EmptyState title="No hay templates" detail="Creá una plantilla personalizada para empezar." />}</Panel>
      <Panel className="core-template-editor-panel">{!selectedKey ? <EmptyState title="Seleccioná una plantilla" detail="Elegí una plantilla de la lista para editarla o previsualizarla." /> : detailLoading || !selected ? <LoadingState label="Cargando plantilla…" /> : <><div className="core-panel-heading"><div><div className="core-template-heading-line"><h2>{selected.name}</h2>{selected.isSystem && <StatusBadge>Sistema</StatusBadge>}</div><p><code>{selected.key}</code> · Actualizada {formatUtc(selected.updatedAtUtc)}</p></div><div className="core-action-group"><SecondaryButton onClick={() => { setValues(Object.fromEntries(placeholders.map((name) => [name, '']))); setRendered(null); setPreviewError(null); setPreviewOpen(true) }}><Eye aria-hidden="true" /> Vista previa</SecondaryButton><SecondaryButton onClick={() => openEditor(false)}><Save aria-hidden="true" /> Editar</SecondaryButton>{!selected.isSystem && <SecondaryButton onClick={() => deleteTemplate(selected)}><Trash2 aria-hidden="true" /> Borrar</SecondaryButton>}</div></div><div className="core-template-detail"><p>{selected.description || 'Sin descripción.'}</p><div><span>Asunto</span><strong>{selected.subject || '—'}</strong></div><div><span>Variables</span><div className="core-placeholder-list">{placeholders.length ? placeholders.map((name) => <code key={name}>{placeholderToken(name)}</code>) : <span>Sin variables</span>}</div></div><div className="core-template-columns"><div><span>HTML</span><pre>{selected.htmlBody || '—'}</pre></div><div><span>Texto</span><pre>{selected.textBody || '—'}</pre></div></div></div></>}</Panel></div>
    {editorOpen && <Modal title={creating ? 'Crear template custom' : 'Editar template'} onClose={() => { if (!saving) { setEditorOpen(false); setTemplateError(null) } }} wide>{templateError ? <ErrorNotice error={templateError} /> : null}<form className="core-form" onSubmit={saveTemplate}>{creating && <Field label="Key" hint={TEMPLATE_KEY_RULE}><input className="core-input" name="key" required minLength={3} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Minúsculas, números y guiones" autoComplete="off" spellCheck={false} /></Field>}<Field label="Nombre"><input className="core-input" name="name" defaultValue={editing?.name ?? ''} required maxLength={120} /></Field><Field label="Descripción"><input className="core-input" name="description" defaultValue={editing?.description ?? ''} maxLength={500} /></Field><Field label="Asunto"><input className="core-input" name="subject" defaultValue={editing?.subject ?? ''} required maxLength={998} /></Field><Field label="HTML body"><textarea className="core-input core-code-textarea" name="htmlBody" defaultValue={editing?.htmlBody ?? ''} required /></Field><Field label="Texto body (opcional)"><textarea className="core-input core-code-textarea" name="textBody" defaultValue={editing?.textBody ?? ''} /></Field>{editing?.isSystem && <div className="core-inline-note">Plantilla de sistema: tiene que conservar sus placeholders obligatorios ({placeholders.map(placeholderToken).join(', ') || 'sin placeholders'}).</div>}{placeholderWarning && <p className="core-validation-warning" role="alert">{placeholderWarning}</p>}<div className="core-form-actions"><SecondaryButton disabled={saving} onClick={() => { setEditorOpen(false); setTemplateError(null) }}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar template'}</PrimaryButton></div></form></Modal>}
    {previewOpen && selected && <Modal title="Vista previa del email" onClose={() => setPreviewOpen(false)} wide><div className="core-preview-layout"><div className="core-preview-values"><h3>Valores de variables</h3>{placeholders.length ? placeholders.map((name) => <Field key={name} label={placeholderToken(name)}><input className="core-input" value={values[name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} /></Field>) : <p>Esta plantilla no tiene variables.</p>}<PrimaryButton disabled={previewing} onClick={() => void renderPreview()}>{previewing ? 'Renderizando…' : previewError ? 'Reintentar vista previa' : 'Renderizar vista previa'}</PrimaryButton>{previewError ? <ErrorNotice error={previewError} /> : null}</div><div className="core-rendered-preview">{!rendered ? <p>Completá las variables y solicitá la vista previa.</p> : <><div><span>ASUNTO</span><strong>{rendered.subject || '—'}</strong></div><div><span>HTML RENDERIZADO</span><iframe title="Vista previa HTML" sandbox="" srcDoc={rendered.html} /></div><div><span>TEXTO RENDERIZADO</span><pre>{rendered.text ?? '—'}</pre></div></>}</div></div></Modal>}
    {selectedSummary && <span className="sr-only">Plantilla seleccionada: {selectedSummary.key}</span>}
  </>
}
