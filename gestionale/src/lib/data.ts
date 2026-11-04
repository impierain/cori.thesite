import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Category, Project, Transaction } from './types'

export function useLookups() {
  const [categories, setCategories] = useState<Category[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const reload = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('categories').select('*').order('nome'),
      supabase.from('projects').select('*').order('nome'),
    ])
    setCategories((c.data as Category[]) ?? []); setProjects((p.data as Project[]) ?? [])
  }, [])
  useEffect(() => { reload() }, [reload])
  return { categories, projects, reload }
}

export function useTransactions() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('transactions').select('*').order('data_competenza', { ascending: false }).order('created_at', { ascending: false })
    if (error) setError(error.message)
    setRows(((data as Transaction[]) ?? []).map(r => ({ ...r, importo: Number(r.importo) })))
    setLoading(false)
  }, [])
  useEffect(() => { reload() }, [reload])
  return { rows, loading, error, reload }
}
