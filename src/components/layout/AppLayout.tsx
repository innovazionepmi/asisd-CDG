import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-paper md:flex-row">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-stone-300 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Apri il menu"
            className="rounded-card p-1.5 text-navy-700 hover:bg-navy-50"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </button>
          <img src="/logo-asisd-transparent.png" alt="ASISD" className="h-6 w-auto" />
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
