'use client'

import { Fingerprint, ShieldCheck } from 'lucide-react'
import useSWR from 'swr'
import { fetcher } from '@/lib/core-client'
import type { CoreJwks } from '@/lib/core-api/types'
import { EmptyState, ErrorNotice, LoadingState, PageHeading, Panel, StatusBadge, useCurrentSession } from './shared'

export function SecurityPage() {
  const jwksUrl = useCurrentSession()?.jwksUrl ?? ''
  // Las claves se piden a través del BFF; la URL se muestra solo como referencia (no es un link
  // para que el navegador no llame a la API directo).
  const { data, error, isLoading } = useSWR<CoreJwks>('.well-known/jwks.json', fetcher<CoreJwks>)
  return <>
    <PageHeading eyebrow="CONTROL · SOLO LECTURA" title="Seguridad" description="Claves públicas publicadas por HREF Core. No hay acciones de rotación desde este panel." />
    {error && <ErrorNotice error={error} />}
    <Panel className="core-security-panel"><div className="core-security-banner"><div className="core-security-icon"><ShieldCheck aria-hidden="true" /></div><div><h2>JSON Web Key Set</h2><p>Las claves aquí publicadas se usan para verificar firmas JWT. La clave privada no se muestra.</p></div><StatusBadge tone="success">Solo lectura</StatusBadge></div><div className="core-jwks-url"><span>URL del JWKS</span><code>{jwksUrl}</code></div><div className="core-panel-heading"><div><h2>Claves publicadas</h2><p>kid y algoritmo informados por la API.</p></div></div>{isLoading ? <LoadingState /> : data?.keys?.length ? <div className="core-key-list">{data.keys.map((key, index) => <div className="core-key-row" key={`${key.kid ?? 'key'}-${index}`}><div className="core-key-icon"><Fingerprint aria-hidden="true" /></div><div><strong>{key.kid || 'Sin kid'}</strong><span>Identificador de clave</span></div><code>{key.alg || 'Algoritmo no informado'}</code></div>)}</div> : !error ? <EmptyState title="No hay claves publicadas" detail="El JWKS no contiene claves." /> : null}</Panel>
  </>
}
