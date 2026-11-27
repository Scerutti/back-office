import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/core/toast'
import './globals.css'
import './core.css'

export const metadata: Metadata = {
  title: 'HREF Core · Backoffice',
  description: 'Backoffice de administración para HREF Core: aplicaciones, identidades, roles, templates y auditoría.',
  icons: {
    // Marca del panel (la "H" del sidebar). El SVG lo usan los navegadores actuales; el PNG, el resto.
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-AR">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
