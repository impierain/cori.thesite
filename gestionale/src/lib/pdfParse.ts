// Lettura automatica del modulo di adesione (PDF).
// 1) Se il PDF è compilabile, legge i campi del modulo (AcroForm).
// 2) Altrimenti cerca le etichette nel testo (Cognome, Nome, Codice fiscale, ...).
// 3) Il codice fiscale valido permette di ricavare anche la data di nascita.
// I campi non trovati restano vuoti: si completano a mano nella scheda.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ParsedMember {
  nome?: string; cognome?: string; sesso?: string; cittadinanza?: string
  codice_fiscale?: string; data_nascita?: string; luogo_nascita?: string
  indirizzo?: string; cap?: string; comune?: string; provincia?: string
  email?: string; telefono?: string; data_iscrizione?: string
  identita_alias?: boolean; consenso_immagini?: boolean
}

export const FIELD_LABELS: Record<keyof ParsedMember, string> = {
  cognome: 'Cognome', nome: 'Nome', sesso: 'Sesso', cittadinanza: 'Cittadinanza', codice_fiscale: 'Codice fiscale',
  data_nascita: 'Data di nascita', luogo_nascita: 'Luogo di nascita', indirizzo: 'Indirizzo', cap: 'CAP',
  comune: 'Comune', provincia: 'Provincia', email: 'Email', telefono: 'Cellulare', data_iscrizione: 'Data iscrizione',
  identita_alias: 'Identità alias', consenso_immagini: 'Consenso immagini',
}

// Email dell'associazione stampata nell'intestazione del modulo: da non scambiare per quella del socio.
const IGNORED_EMAILS = ['cori.theproject@gmail.com']

// ---- Nomi dei campi nei PDF compilabili (adatta qui se i nomi del modulo sono particolari) ----
const FORM_FIELD_MAP: [keyof ParsedMember, RegExp][] = [
  ['cognome', /cognome/i],
  ['nome', /\bnome\b/i],
  ['sesso', /sesso|genere/i],
  ['cittadinanza', /cittadinanza|nazionalit/i],
  ['codice_fiscale', /codice.?fiscale|^cf$/i],
  ['data_nascita', /data.?(di)?.?nascita|nato.?il/i],
  ['luogo_nascita', /luogo.?(di)?.?nascita|nato.?a\b/i],
  ['indirizzo', /indirizzo|residenza/i],
  ['cap', /\bcap\b/i],
  ['comune', /comune|citt[aà]\b/i],
  ['provincia', /provincia|\bprov\b/i],
  ['email', /e-?mail|posta/i],
  ['telefono', /telefono|cellulare|\bcell\b|\btel\b/i],
]

const CF_RE = /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/i
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const DATE_RE = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})/

export function toISODate(s: string): string | undefined {
  const m = s.match(DATE_RE)
  if (m) {
    let y = Number(m[3]); if (y < 100) y += y > 30 ? 1900 : 2000
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return isNaN(Date.parse(iso)) ? undefined : iso
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
}

function birthFromCF(cf: string): string | undefined {
  const months = 'ABCDEHLMPRST'
  const yy = Number(cf.slice(6, 8)); const mi = months.indexOf(cf[8].toUpperCase())
  let dd = Number(cf.slice(9, 11)); if (dd > 40) dd -= 40
  if (mi < 0 || dd < 1 || dd > 31) return undefined
  const cur = new Date().getFullYear() % 100
  const year = yy > cur ? 1900 + yy : 2000 + yy
  return `${year}-${String(mi + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

// Etichette del modulo "Modulo di iscrizione APS Cori.TheProject", nell'ordine in cui compaiono.
// Il valore di ogni campo è il testo tra la sua etichetta e quella successiva.
const LAYOUT: [string, RegExp][] = [
  ['cognome', /cognome\s*\*?/i],
  ['nome', /\bnome\s*\*?/i],
  ['sesso', /\bsesso\s*\*?/i],
  ['data_nascita', /data\s+di\s+nascita\s*\*?/i],
  ['cittadinanza', /cittadinanza\s*\*?/i],
  ['codice_fiscale', /codice\s+fiscale\s*\*?/i],
  ['luogo_nascita', /luogo\s+di\s+nascita\s*\*?/i],
  ['_alias', /identit[àa]?['’]?\s*alias/i],
  ['indirizzo', /indirizzo\s*\*?/i],
  ['cap', /\bcap\b\s*\*?/i],
  ['comune', /\bcomune\b\s*\*?/i],
  ['email', /\be-?mail\b\s*\*?/i],
  ['telefono', /\b(?:cell(?:ulare)?|tel(?:efono)?)\b\.?\s*\*?/i],
]

const clean = (v: string) => v.replace(/[_*]+|\.{3,}/g, ' ').replace(/\(\s*\)/g, ' ').replace(/^[\s:;,\-–]+/, '').replace(/\s+/g, ' ').trim()

function sliceByLabels(text: string): Record<string, string> {
  const end = text.search(/\bCHIEDE\b/i)
  let region = end > 0 ? text.slice(0, end) : text
  const start = region.search(/sottoscritt/i)
  if (start > 0) region = region.slice(start)
  const hits: { key: string; from: number; to: number }[] = []
  for (const [key, re] of LAYOUT) {
    const m = re.exec(region)
    if (m) hits.push({ key, from: m.index, to: m.index + m[0].length })
  }
  hits.sort((a, b) => a.from - b.from)
  const out: Record<string, string> = {}
  hits.forEach((h, i) => { out[h.key] = clean(region.slice(h.to, hits[i + 1]?.from ?? region.length)) })
  return out
}

export async function parseModulo(file: File): Promise<{ data: ParsedMember; found: (keyof ParsedMember)[]; hasText: boolean }> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  const data: ParsedMember = {}
  let text = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)

    // 1) campi compilabili del PDF (se presenti)
    for (const a of await page.getAnnotations()) {
      const name = String(a.fieldName ?? '')
      if (!name) continue
      if (a.checkBox || a.radioButton) {
        const on = a.fieldValue && String(a.fieldValue) !== 'Off' || a.buttonValue && a.fieldValue === a.buttonValue
        if (!on) continue
        if (/alias/i.test(name)) data.identita_alias = true
        else if (/non.?acconsente|no.?consenso/i.test(name)) data.consenso_immagini = false
        else if (/acconsente|consenso/i.test(name)) data.consenso_immagini = true
        continue
      }
      const val = String(a.fieldValue ?? '').trim()
      if (!val) continue
      const hit = FORM_FIELD_MAP.find(([, re]) => re.test(name))
      if (hit && !data[hit[0]]) (data as Record<string, unknown>)[hit[0]] = val
    }

    // 2) testo della pagina, ricostruito riga per riga
    const content = await page.getTextContent()
    let lastY: number | null = null
    for (const it of content.items as { str: string; transform: number[] }[]) {
      const y = Math.round(it.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 3) text += '\n'
      else if (text && !text.endsWith('\n')) text += ' '
      text += it.str
      lastY = y
    }
    text += '\n'
  }

  const t = text.replace(/[ \t]+/g, ' ')
  const hasText = t.replace(/\s/g, '').length > 30
  const set = (k: keyof ParsedMember, v: string | undefined) => { if (v && !data[k]) (data as Record<string, unknown>)[k] = v }

  // 3) etichette del modulo
  const f = sliceByLabels(t)
  set('cognome', f.cognome); set('nome', f.nome); set('sesso', f.sesso); set('cittadinanza', f.cittadinanza)
  set('codice_fiscale', f.codice_fiscale); set('data_nascita', f.data_nascita)
  set('luogo_nascita', f.luogo_nascita); set('indirizzo', f.indirizzo); set('cap', f.cap); set('comune', f.comune)
  set('email', f.email); set('telefono', f.telefono)

  // 4) ripieghi sul testo intero
  set('codice_fiscale', t.match(CF_RE)?.[0])
  if (!data.email) data.email = (t.match(EMAIL_RE) ?? []).map(e => e.toLowerCase()).find(e => !IGNORED_EMAILS.includes(e))

  // normalizzazioni
  if (data.codice_fiscale) {
    const cf = data.codice_fiscale.toUpperCase().replace(/\s/g, '')
    data.codice_fiscale = CF_RE.test(cf) ? cf : (data.codice_fiscale = cf)
  }
  if (data.email) { data.email = data.email.replace(/\s/g, '').toLowerCase(); if (IGNORED_EMAILS.includes(data.email)) delete data.email }
  if (data.cap) data.cap = data.cap.replace(/\D/g, '').slice(0, 5) || undefined
  if (data.telefono) data.telefono = data.telefono.replace(/[^\d+\s]/g, '').trim() || undefined
  if (data.sesso) data.sesso = data.sesso.slice(0, 20)
  if (data.data_nascita && !/^\d{4}-/.test(data.data_nascita)) data.data_nascita = toISODate(data.data_nascita)
  if (!data.data_nascita && data.codice_fiscale && CF_RE.test(data.codice_fiscale)) data.data_nascita = birthFromCF(data.codice_fiscale)
  if (data.data_iscrizione) data.data_iscrizione = toISODate(data.data_iscrizione)
  // "( AG )" accanto all'indirizzo = provincia di residenza
  if (data.indirizzo) {
    const pv = data.indirizzo.match(/\(\s*([A-Za-z]{2})\s*\)/)
    if (pv) { if (!data.provincia) data.provincia = pv[1].toUpperCase(); data.indirizzo = data.indirizzo.replace(pv[0], '').replace(/\s+/g, ' ').trim() }
  }
  for (const k of Object.keys(data) as (keyof ParsedMember)[]) if (data[k] === undefined || data[k] === '') delete data[k]

  const found = Object.keys(data) as (keyof ParsedMember)[]
  return { data, found, hasText }
}
