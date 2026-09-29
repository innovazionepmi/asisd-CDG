import { Route, HashRouter, Routes } from 'react-router-dom'
import { RequireSession } from './components/auth/RequireSession'
import { RequireStudioSession } from './components/auth/RequireStudioSession'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './lib/auth/AuthContext'
import { StudioProvider } from './lib/studio/StudioContext'
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
      <StudioProvider>
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
            <Route
              element={
                <RequireStudioSession>
                  <AppLayout />
                </RequireStudioSession>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/traffico" element={<TrafficoPage />} />
              <Route path="/preventivi" element={<PreventiviPage />} />
              <Route path="/produzione" element={<ProduzionePage />} />
              <Route path="/economics" element={<EconomicsPage />} />
              <Route path="/cashflow" element={<CashflowPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </StudioProvider>
    </AuthProvider>
  )
}
