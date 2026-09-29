import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◈', end: true },
  { to: '/traffico', label: 'Traffico', icon: '👥' },
  { to: '/preventivi', label: 'Preventivi', icon: '📋' },
  { to: '/produzione', label: 'Produzione', icon: '🦷' },
  { to: '/economics', label: 'Economics', icon: '📊' },
  { to: '/cashflow', label: 'Cashflow', icon: '💶' },
]

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-5">
        <p className="text-sm font-semibold tracking-wide text-slate-900">ASISD · CdG</p>
        <p className="text-xs text-slate-400">Controllo di Gestione PMOS</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )
            }
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 px-3 py-3">
        <NavLink
          to="/admin"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <span aria-hidden>🔐</span>
          Amministrazione
        </NavLink>
      </div>
      <div className="border-t border-slate-100 px-5 py-4">
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            isSupabaseConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          )}
        >
          <span className={clsx('h-1.5 w-1.5 rounded-full', isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500')} />
          {isSupabaseConfigured ? 'Connesso a Supabase' : 'Dati demo (locali)'}
        </span>
      </div>
    </aside>
  )
}
