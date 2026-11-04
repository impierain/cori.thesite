import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { dateIT, eur, today } from '../lib/format'
import type { Fee, Member } from '../lib/types'
import { Field, Kpi, Modal, YearSelect } from '../components/ui'

const getDefault = () => { try { return Number(localStorage.getItem('quotaDefault') ?? '20') } catch { return 20 } }

export default function Quote() {
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [members, setMembers] = useState<Member[]>([])
  const [fees, setFees] = useState<Fee[]>([])
  const [loading, setLoading] = useState(true)
  const [quota, setQuota] = useState(getDefault())
  const [pay, setPay] = useState<Member | null>(null)
  const [show, setShow] = useState<'tutti' | 'pagata' | 'mancante'>('tutti')

  async function load() {
    setLoading(true)
    const [m, f] = await Promise.all([
      supabase.from('members').select('*').neq('stato', 'cessato').order('cognome'),
      supabase.from('fees').select('*').eq('anno', anno),
    ])
    setMembers((m.data as Member[]) ?? []); setFees(((f.data as Fee[]) ?? []).map(x => ({ ...x, importo: Number(x.importo) }))); setLoading(false)
  }
  useEffect(() => { load() }, [anno])  // eslint-disable-line react-hooks/exhaustive-deps

  const feeOf = (mid: string) => fees.find(f => f.member_id === mid)
  const list = useMemo(() => members.filter(m => show === 'tutti' || (show === 'pagata') === !!feeOf(m.id)), [members, fees, show])  // eslint-disable-line react-hooks/exhaustive-deps
  const paid = members.filter(m => feeOf(m.id)).length
  const incassato = fees.reduce((s, f) => s + f.importo, 0)

  async function undo(f: Fee) {
    if (!confirm('Annullare questo pagamento? Verrà eliminato anche il movimento di cassa collegato.')) return
    if (f.transaction_id) await supabase.from('transactions').delete().eq('id', f.transaction_id)
    await supabase.from('fees').delete().eq('id', f.id); load()
  }

  return (
    <>
      <div className="top"><h1>Quote associative</h1><YearSelect value={anno} onChange={setAnno} /></div>
      <div className="grid g4" style={{ marginBottom: '1rem' }}>
        <Kpi label="Soci in regola" value={`${paid} / ${members.length}`} sub="Soci non cessati" />
        <Kpi label="Incassato" value={eur(incassato)} cls="in" />
        <div className="card kpi" style={{ marginBottom: 0 }}><div className="l">Quota annuale standard (€)</div>
          <input type="number" min={0} step="0.5" value={quota} onChange={e => { setQuota(Number(e.target.value)); try { localStorage.setItem('quotaDefault', e.target.value) } catch { /* ignore */ } }} /></div>
      </div>
      <div className="filters"><select value={show} onChange={e => setShow(e.target.value as typeof show)}><option value="tutti">Tutti i soci</option><option value="mancante">Da pagare</option><option value="pagata">In regola</option></select></div>
      <div className="card tablewrap">
        {loading ? <div className="empty">Caricamento…</div> : list.length === 0 ? <div className="empty">Nessun socio da mostrare.</div> : (
          <table><thead><tr><th>N.</th><th>Socio</th><th>Stato quota {anno}</th><th></th></tr></thead>
            <tbody>{list.map(m => { const f = feeOf(m.id); return (
              <tr key={m.id}><td>{m.numero_tessera ?? '—'}</td><td><b>{m.cognome}</b> {m.nome}</td>
                <td>{f ? <><span className="badge ok">pagata</span> {eur(f.importo)} il {dateIT(f.data_pagamento)}</> : <span className="badge wait">da pagare</span>}</td>
                <td className="right">{f ? <button className="sm danger" onClick={() => undo(f)}>Annulla</button> : <button className="sm primary" onClick={() => setPay(m)}>Registra pagamento</button>}</td></tr>) })}</tbody></table>
        )}
      </div>
      {pay && <PayModal member={pay} anno={anno} importo={quota} onClose={() => setPay(null)} onSaved={() => { setPay(null); load() }} />}
    </>
  )
}

function PayModal({ member, anno, importo, onClose, onSaved }: { member: Member; anno: number; importo: number; onClose: () => void; onSaved: () => void }) {
  const [imp, setImp] = useState(String(importo)); const [data, setData] = useState(today())
  const [metodo, setMetodo] = useState('contanti'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const n = Number(imp.replace(',', '.'))
      let { data: cat } = await supabase.from('categories').select('id').eq('nome', 'Quote associative').maybeSingle()
      if (!cat) { const r = await supabase.from('categories').insert({ nome: 'Quote associative', tipo: 'entrata' }).select('id').single(); cat = r.data }
      let txId: string | null = null
      if (n > 0) {
        const { data: tx, error } = await supabase.from('transactions').insert({
          tipo: 'entrata', importo: n, descrizione: `Quota associativa ${anno} – ${member.cognome} ${member.nome}`,
          category_id: cat?.id ?? null, member_id: member.id, controparte: `${member.cognome} ${member.nome}`, metodo,
          conto: metodo === 'contanti' ? 'cassa' : 'banca', data_competenza: data, data_effettiva: data,
        }).select('id').single()
        if (error) throw error; txId = tx.id
      }
      const { error } = await supabase.from('fees').insert({ member_id: member.id, anno, importo: n, data_pagamento: data, metodo, transaction_id: txId })
      if (error) throw error
      onSaved()
    } catch (x) { setErr((x as Error).message); setBusy(false) }
  }

  return (
    <Modal title={`Quota ${anno} – ${member.cognome} ${member.nome}`} onClose={onClose}>
      <form onSubmit={save} className="fields">
        <Field label="Importo (€)"><input required value={imp} onChange={e => setImp(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Data pagamento"><input type="date" required value={data} onChange={e => setData(e.target.value)} /></Field>
        <Field label="Metodo"><select value={metodo} onChange={e => setMetodo(e.target.value)}>{['contanti', 'bonifico', 'carta', 'pos', 'altro'].map(m => <option key={m}>{m}</option>)}</select></Field>
        <div className="notice full">Verrà creata automaticamente un'<b>entrata</b> in prima nota (categoria «Quote associative»).</div>
        {err && <div className="notice warn full">{err}</div>}
        <div className="row full" style={{ justifyContent: 'flex-end' }}><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>Registra</button></div>
      </form>
    </Modal>
  )
}
