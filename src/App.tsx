import { Route, HashRouter, Routes } from 'react-router-dom'
import { RequireSession } from './components/auth/RequireSession'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './lib/auth/AuthContext'
import { AdminPage } from './pages/AdminPage'
import { CashflowPage } from './pages/CashflowPage'
import { DashboardPage } from './pages/DashboardPage'
import { EconomicsPage } from './pages/EconomicsPage'
import { LoginPage } from './pages/LoginPage'
import { PreventiviPage } from './pages/PreventiviPage'
import { ProduzionePage } from './pages/ProduzionePage'
import { TrafficoPage } from './pages/TrafficoPage'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <RequireSession>
                <AdminPage />
              </RequireSession>
            }
          />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/traffico" element={<TrafficoPage />} />
            <Route path="/preventivi" element={<PreventiviPage />} />
            <Route path="/produzione" element={<ProduzionePage />} />
            <Route path="/economics" element={<EconomicsPage />} />
            <Route path="/cashflow" element={<CashflowPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
