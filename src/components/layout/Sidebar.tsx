import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useStudio } from '../../lib/studio/StudioContext'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◈', end: true },
  { to: '/traffico', label: 'Traffico', icon: '👥' },
  { to: '/preventivi', label: 'Preventivi', icon: '📋' },
  { to: '/produzione', label: 'Produzione', icon: '🦷' },
  { to: '/saturazione', label: 'Saturazione', icon: '🪑' },
  { to: '/economics', label: 'Economics', icon: '📊' },
  { to: '/cashflow', label: 'Cashflow', icon: '💶' },
]

export function Sidebar() {
  const { session, signOut } = useAuth()
  const studio = useStudio()

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-stone-300 bg-white">
      <div className="px-5 py-5">
        <img src="/logo-asisd-transparent.png" alt="ASISD" className="h-10 w-auto" />
        <p className="mt-2 text-xs font-semibold text-stone-600">{studio.studioName ?? 'Controllo di Gestione'}</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-card px-3 py-2 text-sm font-semibold transition-colors',
                isActive ? 'bg-navy-50 text-navy-700' : 'text-stone-600 hover:bg-navy-50 hover:text-navy-900',
              )
            }
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-stone-100 px-3 py-3">
        <NavLink
          to="/admin"
          className="flex items-center gap-2.5 rounded-card px-3 py-2 text-sm font-semibold text-stone-500 transition-colors hover:bg-navy-50 hover:text-navy-900"
        >
          <span aria-hidden>🔐</span>
          Amministrazione
        </NavLink>
        {session && (
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-card px-3 py-2 text-left text-sm font-semibold text-stone-500 transition-colors hover:bg-navy-50 hover:text-navy-900"
          >
            <span aria-hidden>↩</span>
            Esci
          </button>
        )}
      </div>
      <div className="border-t border-stone-100 px-5 py-4">
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-xs font-semibold',
            isSupabaseConfigured ? 'bg-success-100 text-success-600' : 'bg-amber-100 text-amber-700',
          )}
        >
          <span className={clsx('h-1.5 w-1.5 rounded-full', isSupabaseConfigured ? 'bg-success-600' : 'bg-amber-500')} />
          {isSupabaseConfigured ? 'Connesso a Supabase' : 'Dati demo (locali)'}
        </span>
      </div>
    </aside>
  )
}
