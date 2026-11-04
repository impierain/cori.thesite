import { useEffect, useState, type FormEvent } from 'react'
import { openFile, safeName, supabase, uploadFile } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateIT, today } from '../lib/format'
import type { Minute } from '../lib/types'
import { Field, Modal } from '../components/ui'

const TIPI = { assemblea: 'Assemblea', direttivo: 'Direttivo', altro: 'Altro' } as const
type Form = Partial<Minute>

export default function Verbali() {
  const { role } = useAuth(); const admin = role === 'direttivo'
  const [rows, setRows] = useState<Minute[]>([]); const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [tipo, setTipo] = useState('')
  const [view, setView] = useState<Minute | null>(null); const [edit, setEdit] = useState<Form | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('minutes').select('*').order('data', { ascending: false })
    setRows((data as Minute[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const list = rows.filter(m => (!tipo || m.tipo === tipo) && (!q || `${m.titolo} ${m.testo ?? ''} ${m.odg ?? ''}`.toLowerCase().includes(q.toLowerCase())))

  return (
    <>
      <div className="top"><h1>Libro verbali</h1>{admin && <button className="primary" onClick={() => setEdit({ tipo: 'direttivo', data: today(), titolo: '', visibile_soci: false })}>+ Nuovo verbale</button>}</div>
      <div className="filters">
        <input placeholder="Cerca nei verbali…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Tutti i tipi</option>{Object.entries(TIPI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="card tablewrap">
        {loading ? <div className="empty">Caricamento…</div> : list.length === 0 ? <div className="empty">Nessun verbale.</div> : (
          <table><thead><tr><th>Data</th><th>Tipo</th><th>Titolo</th>{admin && <th>Visibilità</th>}<th></th></tr></thead>
            <tbody>{list.map(m => (
              <tr key={m.id} className="click" onClick={() => setView(m)}>
                <td className="nowrap">{dateIT(m.data)}</td><td><span className="badge">{TIPI[m.tipo]}</span></td><td>{m.titolo}</td>
                {admin && <td>{m.visibile_soci ? <span className="badge ok">visibile ai soci</span> : <span className="badge">solo direttivo</span>}</td>}
                <td>{m.file_path && '📎'}</td></tr>))}</tbody></table>
        )}
      </div>

      {view && (
        <Modal title={view.titolo} onClose={() => setView(null)}>
          <p className="muted">{TIPI[view.tipo]} · {dateIT(view.data)}{view.luogo && ` · ${view.luogo}`}</p>
          {view.presenti && <><h3>Presenti</h3><p className="pre">{view.presenti}</p></>}
          {view.odg && <><h3>Ordine del giorno</h3><p className="pre">{view.odg}</p></>}
          {view.testo && <><h3>Verbale</h3><p className="pre">{view.testo}</p></>}
          <div className="row no-print">
            {view.file_path && <button onClick={() => openFile(view.file_path!)}>📎 Apri PDF allegato</button>}
            <button onClick={() => window.print()}>Stampa</button>
            {admin && <button onClick={() => { setEdit(view); setView(null) }}>Modifica</button>}
          </div>
        </Modal>
      )}
      {edit && <MinuteModal init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function MinuteModal({ init, onClose, onSaved }: { init: Form; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Form>(init); const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const set = <K extends keyof Minute>(k: K, x: Minute[K] | null) => setV(p => ({ ...p, [k]: x }))

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const payload = { tipo: v.tipo, data: v.data, titolo: v.titolo, luogo: v.luogo || null, presenti: v.presenti || null, odg: v.odg || null, testo: v.testo || null, visibile_soci: !!v.visibile_soci }
      let id = v.id
      if (id) { const { error } = await supabase.from('minutes').update(payload).eq('id', id); if (error) throw error }
      else { const { data, error } = await supabase.from('minutes').insert(payload).select('id').single(); if (error) throw error; id = data.id }
      if (file) {
        const path = `verbali/${id}/${Date.now()}-${safeName(file.name)}`
        await uploadFile(path, file)
        const { error } = await supabase.from('minutes').update({ file_path: path }).eq('id', id!); if (error) throw error
      }
      onSaved()
    } catch (x) { setErr((x as Error).message); setBusy(false) }
  }
  async function remove() {
    if (!v.id || !confirm('Eliminare definitivamente il verbale?')) return
    if (v.file_path) await supabase.storage.from('documenti').remove([v.file_path])
    const { error } = await supabase.from('minutes').delete().eq('id', v.id)
    error ? setErr(error.message) : onSaved()
  }

  return (
    <Modal title={v.id ? 'Modifica verbale' : 'Nuovo verbale'} onClose={onClose}>
      <form onSubmit={save} className="fields">
        <Field label="Tipo"><select value={v.tipo} onChange={e => set('tipo', e.target.value as Minute['tipo'])}>{Object.entries(TIPI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Data"><input type="date" required value={v.data ?? ''} onChange={e => set('data', e.target.value)} /></Field>
        <Field label="Titolo" full><input required value={v.titolo ?? ''} onChange={e => set('titolo', e.target.value)} placeholder="Es. Assemblea ordinaria dei soci" /></Field>
        <Field label="Luogo" full><input value={v.luogo ?? ''} onChange={e => set('luogo', e.target.value)} /></Field>
        <Field label="Presenti" full><textarea value={v.presenti ?? ''} onChange={e => set('presenti', e.target.value)} placeholder="Un nome per riga" /></Field>
        <Field label="Ordine del giorno" full><textarea value={v.odg ?? ''} onChange={e => set('odg', e.target.value)} /></Field>
        <Field label="Testo del verbale / delibere" full><textarea style={{ minHeight: 200 }} value={v.testo ?? ''} onChange={e => set('testo', e.target.value)} /></Field>
        <Field label={v.file_path ? 'Sostituisci PDF allegato (firmato / scansione)' : 'Allega PDF (firmato / scansione)'} full><input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="" full><label><input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={!!v.visibile_soci} onChange={e => set('visibile_soci', e.target.checked)} />Rendi visibile ai soci nella loro area personale</label></Field>
        {err && <div className="notice warn full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'space-between' }}>
          <div>{v.id && <button type="button" className="danger" onClick={remove}>Elimina</button>}</div>
          <div className="row"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button></div>
        </div>
      </form>
    </Modal>
  )
}
