import Link from 'next/link'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-svh bg-[#09090b] px-6 text-zinc-100">
      <div className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center text-center">
        <div className="mb-8 grid size-14 place-items-center rounded-2xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300">
          <ShieldAlert aria-hidden="true" className="size-6" />
        </div>
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-indigo-300">HREF Core · Control Plane</p>
        <h1 className="text-7xl font-semibold tracking-tight sm:text-8xl">404</h1>
        <h2 className="mt-5 text-xl font-medium">No encontramos esta página</h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">La dirección puede haber cambiado o no existir. Volvé al panel para seguir trabajando.</p>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
          <ArrowLeft aria-hidden="true" className="size-4" /> Volver al panel
        </Link>
      </div>
    </main>
  )
}
