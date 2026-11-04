import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV_DIRETTIVO: [string, string][] = [
  ['/', 'Dashboard'], ['/movimenti', 'Prima nota'], ['/soci', 'Libro soci'], ['/quote', 'Quote'],
  ['/verbali', 'Libro verbali'], ['/rendiconto', 'Rendiconto'], ['/impostazioni', 'Categorie e progetti'],
]
const NAV_SOCIO: [string, string][] = [['/', 'La mia area'], ['/verbali', 'Verbali']]

export default function Layout() {
  const { role, session, signOut } = useAuth()
  const nav = role === 'direttivo' ? NAV_DIRETTIVO : NAV_SOCIO
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Cori · Gestionale</div>
        {nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}>{label}</NavLink>)}
        <div className="grow" />
        <div className="who">{session?.user.email}<br />{role === 'direttivo' ? 'Direttivo' : 'Socio'}</div>
        <button className="sm" onClick={signOut} style={{ margin: '.5rem .75rem' }}>Esci</button>
      </aside>
      <main><Outlet /></main>
    </div>
  )
}
