export type Tipo = 'entrata' | 'uscita'
export type Role = 'direttivo' | 'socio'

export interface Category { id: string; nome: string; tipo: Tipo | 'entrambi' }
export interface Project { id: string; nome: string; descrizione: string | null; attivo: boolean }

export interface Transaction {
  id: string
  tipo: Tipo
  importo: number
  descrizione: string
  category_id: string | null
  project_id: string | null
  member_id: string | null
  controparte: string | null
  metodo: string | null
  conto: string | null
  data_competenza: string
  data_effettiva: string | null
  numero_documento: string | null
  note: string | null
  created_at: string
}

export interface Attachment { id: string; transaction_id: string; path: string; nome_file: string }

export interface Member {
  id: string
  user_id: string | null
  numero_tessera: number | null
  nome: string
  cognome: string
  codice_fiscale: string | null
  data_nascita: string | null
  luogo_nascita: string | null
  indirizzo: string | null
  cap: string | null
  comune: string | null
  provincia: string | null
  email: string | null
  telefono: string | null
  data_iscrizione: string
  stato: 'attivo' | 'sospeso' | 'cessato'
  data_cessazione: string | null
  note: string | null
  modulo_path: string | null
}

export interface Fee {
  id: string
  member_id: string
  anno: number
  importo: number
  data_pagamento: string
  metodo: string | null
  transaction_id: string | null
}

export interface Minute {
  id: string
  tipo: 'assemblea' | 'direttivo' | 'altro'
  data: string
  titolo: string
  luogo: string | null
  presenti: string | null
  odg: string | null
  testo: string | null
  file_path: string | null
  visibile_soci: boolean
}
