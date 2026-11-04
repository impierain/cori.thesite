import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Movimenti from './pages/Movimenti'
import Soci from './pages/Soci'
import SocioScheda from './pages/SocioScheda'
import Quote from './pages/Quote'
import Verbali from './pages/Verbali'
import Rendiconto from './pages/Rendiconto'
import Impostazioni from './pages/Impostazioni'
import AreaSocio from './pages/AreaSocio'

export default function App() {
  const { session, role, loading } = useAuth()

  if (!configured) return (
    <div className="login"><div className="card">
      <h2>Configurazione mancante</h2>
      <p>Crea il file <code>.env</code> con <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (vedi <code>README.md</code>).</p>
    </div></div>
  )
  if (loading) return <div className="empty">Caricamento…</div>
  if (!session) return <Login />

  if (role !== 'direttivo') return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<AreaSocio />} />
        <Route path="verbali" element={<Verbali />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="movimenti" element={<Movimenti />} />
        <Route path="soci" element={<Soci />} />
        <Route path="soci/:id" element={<SocioScheda />} />
        <Route path="quote" element={<Quote />} />
        <Route path="verbali" element={<Verbali />} />
        <Route path="rendiconto" element={<Rendiconto />} />
        <Route path="impostazioni" element={<Impostazioni />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
