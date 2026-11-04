import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLookups } from '../lib/data'

export default function Impostazioni() {
  const { categories, projects, reload } = useLookups()
  const [cn, setCn] = useState(''); const [ct, setCt] = useState('entrambi'); const [pn, setPn] = useState(''); const [err, setErr] = useState('')

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; setErr(error?.message ?? ''); reload() }

  return (
    <>
      <div className="top"><h1>Categorie e progetti</h1></div>
      {err && <div className="notice warn">{err}</div>}
      <div className="grid g2">
        <div className="card"><h2>Categorie</h2>
          <form className="row" onSubmit={e => { e.preventDefault(); if (cn.trim()) run(supabase.from('categories').insert({ nome: cn.trim(), tipo: ct })).then(() => setCn('')) }}>
            <input placeholder="Nuova categoria" value={cn} onChange={e => setCn(e.target.value)} style={{ flex: 1 }} />
            <select value={ct} onChange={e => setCt(e.target.value)} style={{ width: 'auto' }}><option value="entrambi">Entrambi</option><option value="entrata">Entrate</option><option value="uscita">Uscite</option></select>
            <button className="primary">Aggiungi</button></form>
          <table><tbody>{categories.map(c => <tr key={c.id}><td>{c.nome}</td><td><span className="badge">{c.tipo}</span></td>
            <td className="right"><button className="sm danger" onClick={() => confirm(`Eliminare "${c.nome}"? I movimenti resteranno senza categoria.`) && run(supabase.from('categories').delete().eq('id', c.id))}>Elimina</button></td></tr>)}</tbody></table>
        </div>
        <div className="card"><h2>Progetti / centri di costo</h2>
          <form className="row" onSubmit={e => { e.preventDefault(); if (pn.trim()) run(supabase.from('projects').insert({ nome: pn.trim() })).then(() => setPn('')) }}>
            <input placeholder="Nuovo progetto (es. Pride 2026)" value={pn} onChange={e => setPn(e.target.value)} style={{ flex: 1 }} /><button className="primary">Aggiungi</button></form>
          {projects.length === 0 && <p className="muted">Nessun progetto. Aggiungine uno per assegnare entrate e uscite a un'iniziativa o a un bando.</p>}
          <table><tbody>{projects.map(p => <tr key={p.id}><td>{p.nome}{!p.attivo && <span className="badge" style={{ marginLeft: 6 }}>chiuso</span>}</td>
            <td className="right"><button className="sm" onClick={() => run(supabase.from('projects').update({ attivo: !p.attivo }).eq('id', p.id))}>{p.attivo ? 'Chiudi' : 'Riapri'}</button>{' '}
              <button className="sm danger" onClick={() => confirm(`Eliminare "${p.nome}"?`) && run(supabase.from('projects').delete().eq('id', p.id))}>Elimina</button></td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  )
}
