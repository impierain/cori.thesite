import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dateIT, downloadCSV } from '../lib/format'
import type { Member } from '../lib/types'

export default function Soci() {
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [stato, setStato] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    supabase.from('members').select('*').order('numero_tessera', { ascending: true, nullsFirst: false })
      .then(({ data }) => { setRows((data as Member[]) ?? []); setLoading(false) })
  }, [])

  const list = useMemo(() => rows.filter(m =>
    (!stato || m.stato === stato) &&
    (!q || `${m.nome} ${m.cognome} ${m.codice_fiscale ?? ''} ${m.email ?? ''} ${m.numero_tessera ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, stato])

  const exportCSV = () => downloadCSV('libro-soci.csv', [
    ['N. tessera', 'Cognome', 'Nome', 'Codice fiscale', 'Data nascita', 'Luogo nascita', 'Indirizzo', 'CAP', 'Comune', 'Prov.', 'Email', 'Telefono', 'Data iscrizione', 'Stato', 'Data cessazione'],
    ...list.map(m => [m.numero_tessera, m.cognome, m.nome, m.codice_fiscale, m.data_nascita, m.luogo_nascita, m.indirizzo, m.cap, m.comune, m.provincia, m.email, m.telefono, m.data_iscrizione, m.stato, m.data_cessazione]),
  ])

  return (
    <>
      <div className="top">
        <div><h1>Libro soci</h1><div className="muted">{rows.filter(m => m.stato === 'attivo').length} soci attivi su {rows.length} registrati</div></div>
        <div className="row no-print"><button onClick={() => window.print()}>Stampa</button><button onClick={exportCSV}>Esporta CSV</button><Link className="btn primary" to="/soci/nuovo">+ Nuovo socio</Link></div>
      </div>
      <div className="filters no-print">
        <input placeholder="Cerca per nome, CF, email, tessera…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={stato} onChange={e => setStato(e.target.value)}><option value="">Tutti</option><option value="attivo">Attivi</option><option value="sospeso">Sospesi</option><option value="cessato">Cessati</option></select>
      </div>
      <div className="card tablewrap">
        {loading ? <div className="empty">Caricamento…</div> : list.length === 0 ? <div className="empty">Nessun socio. Aggiungi il primo caricando il modulo di adesione.</div> : (
          <table>
            <thead><tr><th>N.</th><th>Cognome e nome</th><th>Codice fiscale</th><th>Contatti</th><th>Iscritto dal</th><th>Stato</th></tr></thead>
            <tbody>{list.map(m => (
              <tr key={m.id} className="click" onClick={() => nav(`/soci/${m.id}`)}>
                <td>{m.numero_tessera ?? '—'}</td><td><b>{m.cognome}</b> {m.nome}</td><td>{m.codice_fiscale ?? '—'}</td>
                <td>{m.email}<div className="muted">{m.telefono}</div></td><td className="nowrap">{dateIT(m.data_iscrizione)}</td>
                <td><span className={'badge ' + (m.stato === 'attivo' ? 'ok' : m.stato === 'sospeso' ? 'wait' : 'bad')}>{m.stato}</span></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}
