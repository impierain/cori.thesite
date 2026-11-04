import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { openFile, supabase, uploadFile, safeName } from '../lib/supabase'
import { FIELD_LABELS, parseModulo, type ParsedMember } from '../lib/pdfParse'
import { dateIT, eur, today } from '../lib/format'
import type { Fee, Member } from '../lib/types'
import { Field } from '../components/ui'

type Form = Partial<Member>
const TEXT_FIELDS: (keyof ParsedMember)[] = ['cognome', 'nome', 'codice_fiscale', 'luogo_nascita', 'indirizzo', 'cap', 'comune', 'provincia', 'email', 'telefono']

export default function SocioScheda() {
  const { id } = useParams(); const isNew = id === 'nuovo'
  const nav = useNavigate()
  const [v, setV] = useState<Form>({ stato: 'attivo', data_iscrizione: today() })
  const [fees, setFees] = useState<Fee[]>([])
  const [pdf, setPdf] = useState<File | null>(null)
  const [found, setFound] = useState<string[] | null>(null)
  const [parseMsg, setParseMsg] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Member>(k: K, val: Member[K] | null) => setV(p => ({ ...p, [k]: val }))

  useEffect(() => {
    if (isNew) {
      supabase.from('members').select('numero_tessera').order('numero_tessera', { ascending: false, nullsFirst: false }).limit(1)
        .then(({ data }) => setV(p => ({ ...p, numero_tessera: ((data?.[0]?.numero_tessera as number) ?? 0) + 1 })))
      return
    }
    supabase.from('members').select('*').eq('id', id!).single().then(({ data }) => data && setV(data as Member))
    supabase.from('fees').select('*').eq('member_id', id!).order('anno', { ascending: false }).then(({ data }) => setFees(((data as Fee[]) ?? []).map(f => ({ ...f, importo: Number(f.importo) }))))
  }, [id, isNew])

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setParseMsg('Seleziona un file PDF.'); return }
    setPdf(file); setParseMsg('Leggo il modulo…'); setFound(null)
    try {
      const { data, found, hasText } = await parseModulo(file)
      setV(p => ({ ...p, ...Object.fromEntries(Object.entries(data).filter(([, x]) => x)) }))
      setFound(found)
      setParseMsg(!hasText && found.length === 0
        ? 'Il PDF sembra una scansione (immagine): non riesco a leggere il testo. Compila i dati a mano; il file verrà comunque allegato.'
        : found.length === 0 ? 'Non ho riconosciuto nessun campo: compila a mano. Il file verrà comunque allegato.'
        : `Ho riconosciuto ${found.length} campi. Controlla i dati e completa quelli evidenziati.`)
    } catch (e) { setParseMsg('Lettura non riuscita (' + (e as Error).message + '). Compila a mano; il file verrà comunque allegato.') }
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const payload = {
        numero_tessera: v.numero_tessera || null, nome: v.nome, cognome: v.cognome, codice_fiscale: v.codice_fiscale || null,
        data_nascita: v.data_nascita || null, luogo_nascita: v.luogo_nascita || null, indirizzo: v.indirizzo || null, cap: v.cap || null,
        comune: v.comune || null, provincia: v.provincia || null, email: v.email || null, telefono: v.telefono || null,
        data_iscrizione: v.data_iscrizione, stato: v.stato, data_cessazione: v.stato === 'cessato' ? (v.data_cessazione || today()) : null, note: v.note || null,
      }
      let mid = isNew ? undefined : id
      if (mid) { const { error } = await supabase.from('members').update(payload).eq('id', mid); if (error) throw error }
      else { const { data, error } = await supabase.from('members').insert(payload).select('id').single(); if (error) throw error; mid = data.id }
      if (pdf) {
        const path = `soci/${mid}/modulo-${safeName(pdf.name)}`
        await uploadFile(path, pdf)
        const { error } = await supabase.from('members').update({ modulo_path: path }).eq('id', mid!); if (error) throw error
      }
      nav('/soci')
    } catch (x) { setErr((x as Error).message); setBusy(false) }
  }

  async function remove() {
    if (!confirm('Eliminare il socio? Verranno eliminate anche le sue quote registrate (i movimenti di cassa restano).')) return
    if (v.modulo_path) await supabase.storage.from('documenti').remove([v.modulo_path])
    const { error } = await supabase.from('members').delete().eq('id', id!)
    error ? setErr(error.message) : nav('/soci')
  }

  const hl = (k: keyof ParsedMember) => (found && !(v as Record<string, unknown>)[k] ? 'hl' : '')

  return (
    <>
      <div className="top"><h1>{isNew ? 'Nuovo socio' : `${v.cognome ?? ''} ${v.nome ?? ''}`}</h1><Link to="/soci" className="btn">← Libro soci</Link></div>

      <div className="card">
        <h2>Modulo di adesione (PDF)</h2>
        <div className={'drop' + (over ? ' over' : '')}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
          {pdf ? `📄 ${pdf.name}` : v.modulo_path ? '📄 Modulo già caricato — trascina qui un nuovo PDF per sostituirlo' : 'Trascina qui il PDF del modulo di adesione, oppure clicca per sceglierlo'}
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {parseMsg && <div className={'notice ' + (found?.length ? 'ok' : 'warn')} style={{ marginTop: '.75rem', marginBottom: 0 }}>{parseMsg}</div>}
        {v.modulo_path && !pdf && <p><a href="#" onClick={e => { e.preventDefault(); openFile(v.modulo_path!) }}>Apri il modulo salvato</a></p>}
      </div>

      <form onSubmit={save} className="card">
        <h2>Dati del socio</h2>
        <div className="fields">
          <Field label="N. tessera"><input type="number" value={v.numero_tessera ?? ''} onChange={e => set('numero_tessera', e.target.value ? Number(e.target.value) : null)} /></Field>
          {TEXT_FIELDS.slice(0, 3).map(k => <Field key={k} label={FIELD_LABELS[k] + (k === 'cognome' || k === 'nome' ? ' *' : '')}><input className={hl(k)} required={k === 'cognome' || k === 'nome'} value={(v[k as keyof Member] as string) ?? ''} onChange={e => set(k as keyof Member, e.target.value as never)} /></Field>)}
          <Field label="Data di nascita"><input type="date" className={hl('data_nascita')} value={v.data_nascita ?? ''} onChange={e => set('data_nascita', e.target.value)} /></Field>
          {TEXT_FIELDS.slice(3).map(k => <Field key={k} label={FIELD_LABELS[k]}><input className={hl(k)} value={(v[k as keyof Member] as string) ?? ''} onChange={e => set(k as keyof Member, e.target.value as never)} /></Field>)}
          <Field label="Data iscrizione"><input type="date" required value={v.data_iscrizione ?? ''} onChange={e => set('data_iscrizione', e.target.value)} /></Field>
          <Field label="Stato"><select value={v.stato} onChange={e => set('stato', e.target.value as Member['stato'])}><option value="attivo">Attivo</option><option value="sospeso">Sospeso</option><option value="cessato">Cessato</option></select></Field>
          {v.stato === 'cessato' && <Field label="Data cessazione"><input type="date" value={v.data_cessazione ?? ''} onChange={e => set('data_cessazione', e.target.value)} /></Field>}
          <Field label="Note" full><textarea value={v.note ?? ''} onChange={e => set('note', e.target.value)} /></Field>
        </div>
        {err && <div className="notice warn" style={{ marginTop: '1rem' }}>{err}</div>}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
          <div>{!isNew && <button type="button" className="danger" onClick={remove}>Elimina socio</button>}</div>
          <div className="row"><Link to="/soci" className="btn">Annulla</Link><button className="primary" disabled={busy}>{busy ? 'Salvo…' : 'Salva socio'}</button></div>
        </div>
      </form>

      {!isNew && (
        <div className="card">
          <h2>Quote versate</h2>
          {fees.length === 0 ? <div className="muted">Nessuna quota registrata. Puoi registrarla dalla pagina <Link to="/quote">Quote</Link>.</div> : (
            <table><thead><tr><th>Anno</th><th>Importo</th><th>Pagata il</th><th>Metodo</th></tr></thead>
              <tbody>{fees.map(f => <tr key={f.id}><td>{f.anno}</td><td>{eur(f.importo)}</td><td>{dateIT(f.data_pagamento)}</td><td>{f.metodo}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
    </>
  )
}
