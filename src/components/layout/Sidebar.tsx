import clsx from 'clsx'
import { Armchair, BarChart3, ClipboardList, Euro, LayoutDashboard, LogOut, ShieldCheck, Stethoscope, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useStudio } from '../../lib/studio/StudioContext'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/traffico', label: 'Traffico', icon: Users },
  { to: '/preventivi', label: 'Preventivi', icon: ClipboardList },
  { to: '/produzione', label: 'Produzione', icon: Stethoscope },
  { to: '/saturazione', label: 'Saturazione', icon: Armchair },
  { to: '/economics', label: 'Economics', icon: BarChart3 },
  { to: '/cashflow', label: 'Cashflow', icon: Euro },
]

export function Sidebar() {
  const { session, signOut } = useAuth()
  const studio = useStudio()

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-navy-700">
      <div className="bg-white px-5 py-5">
        <img src="/logo-asisd-transparent.png" alt="ASISD" className="h-10 w-auto" />
        <p className="mt-2 text-xs font-semibold text-stone-600">{studio.studioName ?? 'Controllo di Gestione'}</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 border-l-[3px] px-2.5 py-2 text-sm font-semibold transition-colors',
                isActive ? 'border-amber-500 bg-white/10 text-white' : 'border-transparent text-navy-100 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        <NavLink
          to="/admin"
          className="flex items-center gap-2.5 border-l-[3px] border-transparent px-2.5 py-2 text-sm font-semibold text-navy-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Amministrazione
        </NavLink>
        {session && (
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 border-l-[3px] border-transparent px-2.5 py-2 text-left text-sm font-semibold text-navy-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Esci
          </button>
        )}
      </div>
      <div className="border-t border-white/10 px-5 py-4">
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
