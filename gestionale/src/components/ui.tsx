import type { ReactNode } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="head"><h2 style={{ margin: 0 }}>{title}</h2><button className="sm" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return <div className={full ? 'full' : ''}><label className="f">{label}</label>{children}</div>
}

export function Kpi({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return <div className="card kpi" style={{ marginBottom: 0 }}><div className="l">{label}</div><div className={'v ' + (cls ?? '')}>{value}</div>{sub && <div className="s">{sub}</div>}</div>
}

export const YearSelect = ({ value, onChange, from = 2020 }: { value: number; onChange: (n: number) => void; from?: number }) => {
  const now = new Date().getFullYear()
  const years: number[] = []
  for (let y = now + 1; y >= from; y--) years.push(y)
  return <select value={value} onChange={e => onChange(Number(e.target.value))}>{years.map(y => <option key={y}>{y}</option>)}</select>
}

export const useYear = () => new Date().getFullYear()
