import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateIT, eur } from '../lib/format'
import type { Fee, Member } from '../lib/types'

export default function AreaSocio() {
  const [m, setM] = useState<Member | null>(null); const [fees, setFees] = useState<Fee[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('members').select('*').maybeSingle().then(async ({ data }) => {
      setM(data as Member | null)
      if (data) { const f = await supabase.from('fees').select('*').eq('member_id', data.id).order('anno', { ascending: false }); setFees(((f.data as Fee[]) ?? []).map(x => ({ ...x, importo: Number(x.importo) }))) }
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="empty">Caricamento…</div>
  if (!m) return <div className="card"><h1>La mia area</h1><p>Il tuo account non è ancora collegato a una scheda socio. Chiedi al direttivo di verificare che la tua email coincida con quella indicata nel modulo di adesione.</p></div>

  const year = new Date().getFullYear(); const inRegola = fees.some(f => f.anno === year)
  return (
    <>
      <div className="top"><h1>Ciao {m.nome} 👋</h1></div>
      <div className="grid g2">
        <div className="card"><h2>La mia tessera</h2>
          <p><b>N. {m.numero_tessera ?? '—'}</b> · iscritto dal {dateIT(m.data_iscrizione)}</p>
          <p><span className={'badge ' + (m.stato === 'attivo' ? 'ok' : 'wait')}>{m.stato}</span> {inRegola ? <span className="badge ok">quota {year} versata</span> : <span className="badge wait">quota {year} da versare</span>}</p>
          <p className="muted">{m.email}<br />{m.telefono}<br />{[m.indirizzo, m.cap, m.comune, m.provincia && `(${m.provincia})`].filter(Boolean).join(' ')}</p>
        </div>
        <div className="card"><h2>Le mie quote</h2>
          {fees.length === 0 ? <p className="muted">Nessuna quota registrata.</p> : <table><thead><tr><th>Anno</th><th>Importo</th><th>Data</th></tr></thead><tbody>{fees.map(f => <tr key={f.id}><td>{f.anno}</td><td>{eur(f.importo)}</td><td>{dateIT(f.data_pagamento)}</td></tr>)}</tbody></table>}
        </div>
      </div>
    </>
  )
}
