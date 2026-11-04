import { useMemo, useState } from 'react'
import { useLookups, useTransactions } from '../lib/data'
import { downloadCSV, eur, yearOf } from '../lib/format'
import { YearSelect } from '../components/ui'

export default function Rendiconto() {
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [criterio, setCriterio] = useState<'cassa' | 'competenza'>('cassa')
  const { rows, loading } = useTransactions()
  const { categories, projects } = useLookups()

  const year = useMemo(() => rows.filter(r => criterio === 'cassa' ? r.data_effettiva && yearOf(r.data_effettiva) === anno : yearOf(r.data_competenza) === anno), [rows, anno, criterio])
  const sum = (arr: typeof rows) => arr.reduce((s, r) => s + r.importo, 0)
  const byCat = (tipo: string) => categories.map(c => ({ nome: c.nome, tot: sum(year.filter(r => r.tipo === tipo && r.category_id === c.id)) })).concat([{ nome: 'Senza categoria', tot: sum(year.filter(r => r.tipo === tipo && !r.category_id)) }]).filter(x => x.tot > 0)
  const entrate = byCat('entrata'), uscite = byCat('uscita')
  const totE = sum(year.filter(r => r.tipo === 'entrata')), totU = sum(year.filter(r => r.tipo === 'uscita'))
  const perProg = projects.map(p => ({ nome: p.nome, e: sum(year.filter(r => r.project_id === p.id && r.tipo === 'entrata')), u: sum(year.filter(r => r.project_id === p.id && r.tipo === 'uscita')) })).filter(p => p.e || p.u)

  const exportCSV = () => downloadCSV(`rendiconto-${anno}.csv`, [
    ['Sezione', 'Voce', 'Importo'], ...entrate.map(x => ['Entrate', x.nome, x.tot.toFixed(2)]), ['Entrate', 'TOTALE', totE.toFixed(2)],
    ...uscite.map(x => ['Uscite', x.nome, x.tot.toFixed(2)]), ['Uscite', 'TOTALE', totU.toFixed(2)], ['Risultato', 'Avanzo/Disavanzo', (totE - totU).toFixed(2)],
    ...perProg.map(p => ['Progetto ' + p.nome, 'Entrate / Uscite', `${p.e.toFixed(2)} / ${p.u.toFixed(2)}`]),
  ])

  const Table = ({ title, data, total, cls }: { title: string; data: { nome: string; tot: number }[]; total: number; cls: string }) => (
    <div className="card"><h2>{title}</h2>
      <table><tbody>{data.map(x => <tr key={x.nome}><td>{x.nome}</td><td className="right">{eur(x.tot)}</td></tr>)}</tbody>
        <tfoot><tr><td>Totale</td><td className={'right ' + cls}>{eur(total)}</td></tr></tfoot></table>
      {data.length === 0 && <div className="muted">Nessun dato</div>}
    </div>
  )

  return (
    <>
      <div className="top"><div><h1>Rendiconto {anno}</h1><div className="muted">Criterio di {criterio === 'cassa' ? 'cassa (data effettiva)' : 'competenza (data di impegno)'}</div></div>
        <div className="row no-print"><YearSelect value={anno} onChange={setAnno} />
          <select value={criterio} onChange={e => setCriterio(e.target.value as typeof criterio)}><option value="cassa">Per cassa</option><option value="competenza">Per competenza</option></select>
          <button onClick={exportCSV}>CSV</button><button className="primary" onClick={() => window.print()}>Stampa / PDF</button></div></div>
      {loading ? <div className="empty">Caricamento…</div> : (
        <>
          <div className="grid g2"><Table title="Entrate" data={entrate} total={totE} cls="in" /><Table title="Uscite" data={uscite} total={totU} cls="out" /></div>
          <div className="card"><h2>Avanzo / disavanzo di gestione</h2><div className={'kpi'}><div className={'v ' + (totE - totU >= 0 ? 'in' : 'out')}>{eur(totE - totU)}</div></div></div>
          {perProg.length > 0 && <div className="card"><h2>Per progetto</h2>
            <table><thead><tr><th>Progetto</th><th className="right">Entrate</th><th className="right">Uscite</th><th className="right">Saldo</th></tr></thead>
              <tbody>{perProg.map(p => <tr key={p.nome}><td>{p.nome}</td><td className="right in">{eur(p.e)}</td><td className="right out">{eur(p.u)}</td><td className="right">{eur(p.e - p.u)}</td></tr>)}</tbody></table></div>}
        </>
      )}
    </>
  )
}
