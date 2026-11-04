import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLookups, useTransactions } from '../lib/data'
import { dateIT, eur, MESI, yearOf } from '../lib/format'
import { Kpi, YearSelect } from '../components/ui'

const COLORS = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#f97316']

export default function Dashboard() {
  const [anno, setAnno] = useState(new Date().getFullYear())
  const { rows, loading, error } = useTransactions()
  const { categories } = useLookups()
  const catName = (id: string | null) => categories.find(c => c.id === id)?.nome ?? 'Senza categoria'

  const d = useMemo(() => {
    const done = rows.filter(r => r.data_effettiva)
    const sign = (r: { tipo: string; importo: number }) => (r.tipo === 'entrata' ? r.importo : -r.importo)
    const saldoTotale = done.reduce((s, r) => s + sign(r), 0)
    const saldoInizio = done.filter(r => yearOf(r.data_effettiva) < anno).reduce((s, r) => s + sign(r), 0)
    const year = done.filter(r => yearOf(r.data_effettiva) === anno)
    const entrate = year.filter(r => r.tipo === 'entrata').reduce((s, r) => s + r.importo, 0)
    const uscite = year.filter(r => r.tipo === 'uscita').reduce((s, r) => s + r.importo, 0)
    const pending = rows.filter(r => !r.data_effettiva)
    const daIncassare = pending.filter(r => r.tipo === 'entrata').reduce((s, r) => s + r.importo, 0)
    const daPagare = pending.filter(r => r.tipo === 'uscita').reduce((s, r) => s + r.importo, 0)
    const mensile = MESI.map((m, i) => ({
      mese: m,
      Entrate: year.filter(r => r.tipo === 'entrata' && Number(r.data_effettiva!.slice(5, 7)) === i + 1).reduce((s, r) => s + r.importo, 0),
      Uscite: year.filter(r => r.tipo === 'uscita' && Number(r.data_effettiva!.slice(5, 7)) === i + 1).reduce((s, r) => s + r.importo, 0),
    }))
    const group = (tipo: string) => {
      const m = new Map<string, number>()
      year.filter(r => r.tipo === tipo).forEach(r => m.set(catName(r.category_id), (m.get(catName(r.category_id)) ?? 0) + r.importo))
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    }
    const cassa = done.filter(r => r.conto === 'cassa').reduce((s, r) => s + sign(r), 0)
    return { saldoTotale, saldoInizio, entrate, uscite, daIncassare, daPagare, mensile, perCatUscite: group('uscita'), perCatEntrate: group('entrata'), pending, cassa, banca: saldoTotale - cassa }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, anno, categories])

  return (
    <>
      <div className="top"><h1>Dashboard</h1><div className="row"><YearSelect value={anno} onChange={setAnno} /><Link className="btn primary" to="/movimenti?nuovo=1">+ Nuovo movimento</Link></div></div>
      {error && <div className="notice warn">Errore nel caricamento: {error}</div>}
      {loading ? <div className="empty">Caricamento…</div> : (
        <>
          <div className="grid g4" style={{ marginBottom: '1rem' }}>
            <Kpi label="Saldo attuale" value={eur(d.saldoTotale)} sub={`Cassa ${eur(d.cassa)} · Banca ${eur(d.banca)}`} cls={d.saldoTotale >= 0 ? 'in' : 'out'} />
            <Kpi label={`Entrate ${anno}`} value={eur(d.entrate)} cls="in" sub="Incassate effettivamente" />
            <Kpi label={`Uscite ${anno}`} value={eur(d.uscite)} cls="out" sub="Pagate effettivamente" />
            <Kpi label={`Risultato ${anno}`} value={eur(d.entrate - d.uscite)} sub={`Saldo a inizio anno ${eur(d.saldoInizio)}`} cls={d.entrate - d.uscite >= 0 ? 'in' : 'out'} />
          </div>
          <div className="grid g4" style={{ marginBottom: '1rem' }}>
            <Kpi label="Da incassare" value={eur(d.daIncassare)} sub="Impegnate, non ancora entrate" />
            <Kpi label="Da pagare" value={eur(d.daPagare)} sub="Impegnate, non ancora uscite" />
          </div>

          <div className="card">
            <h2>Entrate e uscite per mese ({anno})</h2>
            <div style={{ height: 280 }}>
              <ResponsiveContainer><BarChart data={d.mensile}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="mese" stroke="var(--muted)" /><YAxis stroke="var(--muted)" />
                <Tooltip formatter={(v: number) => eur(v)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} /><Legend />
                <Bar dataKey="Entrate" fill="#15803d" radius={[4, 4, 0, 0]} /><Bar dataKey="Uscite" fill="#c2410c" radius={[4, 4, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </div>
          </div>

          <div className="grid g2">
            {[['Uscite per categoria', d.perCatUscite], ['Entrate per categoria', d.perCatEntrate]].map(([title, data]) => (
              <div className="card" key={title as string}>
                <h2>{title as string} ({anno})</h2>
                {(data as { name: string; value: number }[]).length === 0 ? <div className="empty">Nessun dato</div> : (
                  <div style={{ height: 260 }}><ResponsiveContainer><PieChart>
                    <Pie data={data as { name: string; value: number }[]} dataKey="value" nameKey="name" outerRadius={90} label={false}>
                      {(data as { name: string }[]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => eur(v)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)' }} /><Legend />
                  </PieChart></ResponsiveContainer></div>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Movimenti ancora da regolare</h2>
            {d.pending.length === 0 ? <div className="empty">Tutto regolato 🎉</div> : (
              <div className="tablewrap"><table><thead><tr><th>Impegnato il</th><th>Descrizione</th><th>Categoria</th><th className="right">Importo</th></tr></thead>
                <tbody>{d.pending.slice(0, 10).map(r => (
                  <tr key={r.id}><td className="nowrap">{dateIT(r.data_competenza)}</td><td>{r.descrizione}</td><td>{catName(r.category_id)}</td>
                    <td className={'right nowrap ' + (r.tipo === 'entrata' ? 'in' : 'out')}>{r.tipo === 'entrata' ? '+' : '−'}{eur(r.importo)}</td></tr>
                ))}</tbody></table></div>
            )}
          </div>
        </>
      )}
    </>
  )
}
