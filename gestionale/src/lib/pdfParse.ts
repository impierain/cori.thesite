// Lettura automatica del modulo di adesione (PDF).
// 1) Se il PDF è compilabile, legge i campi del modulo (AcroForm).
// 2) Altrimenti cerca le etichette nel testo (Cognome, Nome, Codice fiscale, ...).
// 3) Il codice fiscale valido permette di ricavare anche la data di nascita.
// I campi non trovati restano vuoti: si completano a mano nella scheda.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ParsedMember {
  nome?: string; cognome?: string; codice_fiscale?: string; data_nascita?: string; luogo_nascita?: string
  indirizzo?: string; cap?: string; comune?: string; provincia?: string
  email?: string; telefono?: string; data_iscrizione?: string
}

export const FIELD_LABELS: Record<keyof ParsedMember, string> = {
  cognome: 'Cognome', nome: 'Nome', codice_fiscale: 'Codice fiscale', data_nascita: 'Data di nascita',
  luogo_nascita: 'Luogo di nascita', indirizzo: 'Indirizzo', cap: 'CAP', comune: 'Comune',
  provincia: 'Provincia', email: 'Email', telefono: 'Telefono', data_iscrizione: 'Data iscrizione',
}

// ---- Nomi dei campi nei PDF compilabili (adatta qui se il modulo usa nomi particolari) ----
const FORM_FIELD_MAP: [keyof ParsedMember, RegExp][] = [
  ['cognome', /cognome/i],
  ['nome', /^nome$|^nome[_\s-]?(socio)?$|\bnome\b/i],
  ['codice_fiscale', /codice.?fiscale|^cf$|c\.?f\.?$/i],
  ['data_nascita', /data.?(di)?.?nascita|nato.?il|nascita.?data/i],
  ['luogo_nascita', /luogo.?(di)?.?nascita|nato.?a/i],
  ['indirizzo', /indirizzo|via|residenza/i],
  ['cap', /\bcap\b/i],
  ['comune', /comune|citt[aà]/i],
  ['provincia', /provincia|\bprov\b/i],
  ['email', /e-?mail|posta/i],
  ['telefono', /telefono|cellulare|\btel\b|cell/i],
  ['data_iscrizione', /data.?(di)?.?(iscrizione|adesione|domanda)/i],
]

const CF_RE = /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/i
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
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

const LABELS = ['cognome', 'nome', 'nato a', 'nata a', 'nato/a a', 'luogo di nascita', 'il', 'data di nascita',
  'codice fiscale', 'c.f.', 'residente', 'indirizzo', 'via', 'cap', 'comune', 'città', 'prov', 'provincia',
  'email', 'e-mail', 'telefono', 'cellulare', 'tel', 'cell']

/** Valore che segue `label` fino alla prossima etichetta nota o a fine riga. */
function after(text: string, labels: string[]): string | undefined {
  const stop = LABELS.map(l => l.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|')
  for (const l of labels) {
    const esc = l.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')
    const re = new RegExp(`(?:^|[\\s,;(])${esc}\\s*[:\\-–]?\\s*(?:_{2,}|\\.{2,})?\\s*([^\\n]*?)\\s*(?=(?:[\\s,;(](?:${stop})\\b\\s*[:\\-–.)])|\\n|$)`, 'i')
    const m = text.match(re)
    const v = m?.[1]?.replace(/[_.]{2,}/g, '').trim()
    if (v && v.length > 0 && v.length < 80) return v
  }
  return undefined
}

export async function parseModulo(file: File): Promise<{ data: ParsedMember; found: (keyof ParsedMember)[]; hasText: boolean }> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  const data: ParsedMember = {}
  let text = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)

    // 1) campi compilabili
    const annots = await page.getAnnotations()
    for (const a of annots) {
      const name = String(a.fieldName ?? ''); const val = String(a.fieldValue ?? '').trim()
      if (!name || !val || val === 'Off') continue
      const hit = FORM_FIELD_MAP.find(([, re]) => re.test(name))
      if (hit && !data[hit[0]]) data[hit[0]] = val
    }

    // 2) testo, ricostruito riga per riga
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

  const set = <K extends keyof ParsedMember>(k: K, v: ParsedMember[K] | undefined) => { if (v && !data[k]) data[k] = v }

  set('codice_fiscale', t.match(CF_RE)?.[0].toUpperCase())
  set('email', t.match(EMAIL_RE)?.[0].toLowerCase())
  set('cognome', after(t, ['cognome']))
  set('nome', after(t, ['nome']))
  set('luogo_nascita', after(t, ['nato/a a', 'nato a', 'nata a', 'luogo di nascita']))
  const dn = after(t, ['data di nascita', 'nato/a il', 'nato il', 'nata il', 'il'])
  if (dn) set('data_nascita', toISODate(dn))
  set('indirizzo', after(t, ['indirizzo', 'residente in', 'residente a', 'via']))
  set('cap', t.match(/\b(?:cap\s*[:.]?\s*)?(\d{5})\b/i)?.[1])
  set('comune', after(t, ['comune', 'città']))
  set('provincia', after(t, ['provincia', 'prov'])?.replace(/[()]/g, '').slice(0, 2).toUpperCase())
  set('telefono', t.match(/(?:tel(?:efono)?|cell(?:ulare)?)\.?\s*[:\-]?\s*(\+?\d[\d\s./-]{6,14}\d)/i)?.[1]?.trim())

  // normalizzazioni
  if (data.luogo_nascita) data.luogo_nascita = data.luogo_nascita.replace(/\s+il\s+\d.*$/i, '').replace(/\s*\(\w{2}\)\s*$/, '').trim()
  if (data.indirizzo) data.indirizzo = data.indirizzo.replace(/\s+(cap|c\.a\.p\.|comune|città)\b.*$/i, '').trim()
  if (data.codice_fiscale) data.codice_fiscale = data.codice_fiscale.toUpperCase().replace(/\s/g, '')
  if (data.data_nascita && !/^\d{4}-/.test(data.data_nascita)) data.data_nascita = toISODate(data.data_nascita)
  if (!data.data_nascita && data.codice_fiscale && CF_RE.test(data.codice_fiscale)) data.data_nascita = birthFromCF(data.codice_fiscale)
  if (data.data_iscrizione) data.data_iscrizione = toISODate(data.data_iscrizione)

  const found = (Object.keys(data) as (keyof ParsedMember)[]).filter(k => data[k])
  return { data, found, hasText }
}
