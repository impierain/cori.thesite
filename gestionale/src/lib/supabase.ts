import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'missing')

export const BUCKET = 'documenti'

export const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_')

export async function uploadFile(path: string, file: File) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) throw error
}

export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error || !data) { alert('Impossibile aprire il file: ' + (error?.message ?? '')); return }
  window.open(data.signedUrl, '_blank')
}
