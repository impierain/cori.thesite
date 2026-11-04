import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, uploadFile, openFile, safeName } from '../lib/supabase'
import { useLookups, useTransactions } from '../lib/data'
import { dateIT, downloadCSV, eur, today, yearOf } from '../lib/format'
import type { Attachment, Transaction } from '../lib/types'
import { Field, Modal, YearSelect } from '../components/ui'

const METODI = ['contanti', 'bonifico', 'carta', 'pos', 'assegno', 'altro']
type Form = Partial<Transaction> & { effettuato: boolean }

const blank = (): Form => ({ tipo: 'entrata', importo: undefined, descrizione: '', category_id: null, project_id: null, controparte: '', metodo: 'contanti', conto: 'cassa', data_competenza: today(), data_effettiva: today(), numero_documento: '', note: '', effettuato: true })

export default function Movimenti() {
  const { rows, loading, error, reload } = useTransactions()
  const { categories, projects } = useLookups()
  const [params, setParams] = useSearchParams()
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [f, setF] = useState({ tipo: '', cat: '', proj: '', stato: '', q: '' })
  const [edit, setEdit] = useState<Form | null>(null)

  useEffect(() => { if (params.get('nuovo')) { setEdit(blank()); setParams({}, { replace: true }) } }, [params, setParams])

  const catName = (id: string | null) => categories.find(c => c.id === id)?.nome ?? '—'
  const projName = (id: string | null) => projects.find(p => p.id === id)?.nome ?? '—'

  const list = useMemo(() => rows.filter(r =>
    yearOf(r.data_competenza) === anno &&
    (!f.tipo || r.tipo === f.tipo) && (!f.cat || r.category_id === f.cat) && (!f.proj || r.project_id === f.proj) &&
    (!f.stato || (f.stato === 'effettuato' ? !!r.data_effettiva : !r.data_effettiva)) &&
    (!f.q || `${r.descrizione} ${r.controparte ?? ''} ${r.numero_documento ?? ''}`.toLowerCase().includes(f.q.toLowerCase()))
  ), [rows, anno, f])

  const tot = useMemo(() => ({
    in: list.filter(r => r.tipo === 'entrata').reduce((s, r) => s + r.importo, 0),
    out: list.filter(r => r.tipo === 'uscita').reduce((s, r) => s + r.importo, 0),
  }), [list])

  function exportCSV() {
    downloadCSV(`prima-nota-${anno}.csv`, [
      ['Data impegno', 'Data effettiva', 'Tipo', 'Descrizione', 'Categoria', 'Progetto', 'Controparte', 'Metodo', 'Conto', 'N. documento', 'Importo'],
      ...list.map(r => [r.data_competenza, r.data_effettiva ?? '', r.tipo, r.descrizione, catName(r.category_id), projName(r.project_id), r.controparte, r.metodo, r.conto, r.numero_documento, (r.tipo === 'uscita' ? -r.importo : r.importo).toFixed(2).replace('.', ',')]),
    ])
  }

  return (
    <>
      <div className="top">
        <h1>Prima nota</h1>
        <div className="row"><YearSelect value={anno} onChange={setAnno} /><button onClick={exportCSV}>Esporta CSV</button><button className="primary" onClick={() => setEdit(blank())}>+ Nuovo movimento</button></div>
      </div>
      {error && <div className="notice warn">{error}</div>}
      <div className="filters">
        <input placeholder="Cerca…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="">Entrate e uscite</option><option value="entrata">Entrate</option><option value="uscita">Uscite</option></select>
        <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">Tutte le categorie</option>{categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <select value={f.proj} onChange={e => setF({ ...f, proj: e.target.value })}><option value="">Tutti i progetti</option>{projects.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <select value={f.stato} onChange={e => setF({ ...f, stato: e.target.value })}><option value="">Tutti gli stati</option><option value="effettuato">Effettuati</option><option value="atteso">Da regolare</option></select>
      </div>
      <div className="card tablewrap">
        {loading ? <div className="empty">Caricamento…</div> : list.length === 0 ? <div className="empty">Nessun movimento per i filtri scelti.</div> : (
          <table>
            <thead><tr><th>Impegnato il</th><th>Avvenuto il</th><th>Descrizione</th><th>Categoria</th><th>Progetto</th><th>Conto</th><th className="right">Importo</th></tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.id} className="click" onClick={() => setEdit({ ...r, effettuato: !!r.data_effettiva })}>
                <td className="nowrap">{dateIT(r.data_competenza)}</td>
                <td className="nowrap">{r.data_effettiva ? dateIT(r.data_effettiva) : <span className="badge wait">da regolare</span>}</td>
                <td>{r.descrizione}{r.controparte && <div className="muted">{r.controparte}</div>}</td>
                <td>{catName(r.category_id)}</td><td>{projName(r.project_id)}</td>
                <td>{r.conto}<div className="muted">{r.metodo}</div></td>
                <td className={'right nowrap ' + (r.tipo === 'entrata' ? 'in' : 'out')}>{r.tipo === 'entrata' ? '+' : '−'}{eur(r.importo)}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={6} className="right">Entrate {eur(tot.in)} · Uscite {eur(tot.out)} · Saldo</td><td className={'right ' + (tot.in - tot.out >= 0 ? 'in' : 'out')}>{eur(tot.in - tot.out)}</td></tr></tfoot>
          </table>
        )}
      </div>
      {edit && <TxModal init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </>
  )
}

function TxModal({ init, onClose, onSaved }: { init: Form; onClose: () => void; onSaved: () => void }) {
  const { categories, projects } = useLookups()
  const [v, setV] = useState<Form>(init)
  const [files, setFiles] = useState<File[]>([])
  const [atts, setAtts] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const set = <K extends keyof Form>(k: K, val: Form[K]) => setV(p => ({ ...p, [k]: val }))

  useEffect(() => {
    if (init.id) supabase.from('attachments').select('*').eq('transaction_id', init.id).then(({ data }) => setAtts((data as Attachment[]) ?? []))
  }, [init.id])

  const cats = categories.filter(c => c.tipo === 'entrambi' || c.tipo === v.tipo)

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const payload = {
        tipo: v.tipo, importo: Number(String(v.importo).replace(',', '.')), descrizione: v.descrizione,
        category_id: v.category_id || null, project_id: v.project_id || null, controparte: v.controparte || null,
        metodo: v.metodo, conto: v.conto, data_competenza: v.data_competenza,
        data_effettiva: v.effettuato ? (v.data_effettiva || v.data_competenza) : null,
        numero_documento: v.numero_documento || null, note: v.note || null,
      }
      let id = v.id
      if (id) { const { error } = await supabase.from('transactions').update(payload).eq('id', id); if (error) throw error }
      else { const { data, error } = await supabase.from('transactions').insert(payload).select('id').single(); if (error) throw error; id = data.id }
      for (const file of files) {
        const path = `movimenti/${id}/${Date.now()}-${safeName(file.name)}`
        await uploadFile(path, file)
        const { error } = await supabase.from('attachments').insert({ transaction_id: id, path, nome_file: file.name }); if (error) throw error
      }
      onSaved()
    } catch (x) { setErr((x as Error).message); setBusy(false) }
  }

  async function remove() {
    if (!v.id || !confirm('Eliminare definitivamente questo movimento?')) return
    setBusy(true)
    if (atts.length) await supabase.storage.from('documenti').remove(atts.map(a => a.path))
    const { error } = await supabase.from('transactions').delete().eq('id', v.id)
    error ? (setErr(error.message), setBusy(false)) : onSaved()
  }

  async function removeAtt(a: Attachment) {
    if (!confirm(`Eliminare l'allegato "${a.nome_file}"?`)) return
    await supabase.storage.from('documenti').remove([a.path]); await supabase.from('attachments').delete().eq('id', a.id)
    setAtts(atts.filter(x => x.id !== a.id))
  }

  return (
    <Modal title={v.id ? 'Modifica movimento' : 'Nuovo movimento'} onClose={onClose}>
      <form onSubmit={save} className="fields">
        <Field label="Tipo" full>
          <div className="row">
            <button type="button" className={v.tipo === 'entrata' ? 'primary' : ''} onClick={() => { set('tipo', 'entrata'); set('category_id', null) }}>⬇ Entrata</button>
            <button type="button" className={v.tipo === 'uscita' ? 'primary' : ''} onClick={() => { set('tipo', 'uscita'); set('category_id', null) }}>⬆ Uscita</button>
          </div>
        </Field>
        <Field label="Importo (€)"><input required inputMode="decimal" value={v.importo ?? ''} onChange={e => set('importo', e.target.value as unknown as number)} /></Field>
        <Field label={v.tipo === 'entrata' ? 'Da chi arriva' : 'A chi va'}><input value={v.controparte ?? ''} onChange={e => set('controparte', e.target.value)} placeholder="Persona, ente, fornitore…" /></Field>
        <Field label="Per cosa (descrizione)" full><input required value={v.descrizione ?? ''} onChange={e => set('descrizione', e.target.value)} /></Field>
        <Field label="Categoria"><select value={v.category_id ?? ''} onChange={e => set('category_id', e.target.value || null)}><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
        <Field label="Progetto / centro di costo"><select value={v.project_id ?? ''} onChange={e => set('project_id', e.target.value || null)}><option value="">—</option>{projects.filter(p => p.attivo || p.id === v.project_id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
        <Field label="Data di impegno / competenza"><input type="date" required value={v.data_competenza ?? ''} onChange={e => set('data_competenza', e.target.value)} /></Field>
        <Field label="Movimento già avvenuto?">
          <select value={v.effettuato ? 's' : 'n'} onChange={e => set('effettuato', e.target.value === 's')}>
            <option value="s">Sì, già {v.tipo === 'entrata' ? 'incassato' : 'pagato'}</option><option value="n">No, da {v.tipo === 'entrata' ? 'incassare' : 'pagare'}</option>
          </select>
        </Field>
        {v.effettuato && <Field label={`Data effettiva ${v.tipo === 'entrata' ? 'incasso' : 'pagamento'}`}><input type="date" value={v.data_effettiva ?? ''} onChange={e => set('data_effettiva', e.target.value)} /></Field>}
        <Field label="Conto"><select value={v.conto ?? 'cassa'} onChange={e => set('conto', e.target.value)}><option value="cassa">Cassa (contanti)</option><option value="banca">Banca / conto</option></select></Field>
        <Field label="Metodo"><select value={v.metodo ?? ''} onChange={e => set('metodo', e.target.value)}>{METODI.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="N. fattura / ricevuta"><input value={v.numero_documento ?? ''} onChange={e => set('numero_documento', e.target.value)} /></Field>
        <Field label="Note" full><textarea value={v.note ?? ''} onChange={e => set('note', e.target.value)} /></Field>
        <Field label="Allegati (ricevute, fatture)" full>
          {atts.map(a => <div key={a.id} className="row" style={{ marginBottom: 4 }}><a href="#" onClick={e => { e.preventDefault(); openFile(a.path) }}>📎 {a.nome_file}</a><button type="button" className="sm danger" onClick={() => removeAtt(a)}>Rimuovi</button></div>)}
          <input type="file" multiple onChange={e => setFiles([...(e.target.files ?? [])])} />
        </Field>
        {err && <div className="notice warn full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'space-between' }}>
          <div>{v.id && <button type="button" className="danger" onClick={remove} disabled={busy}>Elimina</button>}</div>
          <div className="row"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button></div>
        </div>
      </form>
    </Modal>
  )
}
