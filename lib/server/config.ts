import 'server-only'

// Configuración del BFF. Solo se lee del lado del servidor: `server-only` hace fallar el build
// si algún componente del navegador importa este módulo. Nunca loguear estos valores.
export type CoreConfig = { baseUrl: string; appKey: string; appSecret: string }

export function coreConfig(): CoreConfig | null {
  const rawUrl = process.env.CORE_API_URL?.trim()
  const appKey = process.env.CORE_APP_KEY?.trim() || 'core'
  const appSecret = process.env.CORE_APP_SECRET?.trim()
  if (!rawUrl || !appSecret) return null
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return null
    if (url.username || url.password || url.search || url.hash) return null
    return { baseUrl: url.toString().replace(/\/$/, ''), appKey, appSecret }
  } catch {
    return null
  }
}
