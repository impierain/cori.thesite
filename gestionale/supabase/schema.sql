-- =====================================================================
-- Cori – Gestionale: schema database (Supabase / PostgreSQL)
-- Incolla tutto nel "SQL Editor" di Supabase ed esegui (Run).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Profili e ruoli -------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'socio' check (role in ('direttivo','socio')),
  created_at timestamptz not null default now()
);

create or replace function public.is_direttivo() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'direttivo');
$$;

-- ---------- Libro soci ------------------------------------------------
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  numero_tessera integer,
  nome text not null,
  cognome text not null,
  sesso text,
  cittadinanza text,
  identita_alias boolean not null default false,   -- dal modulo: "Identità alias"
  consenso_immagini boolean,                       -- dal modulo: acconsente / non acconsente (null = non indicato)
  codice_fiscale text,
  data_nascita date,
  luogo_nascita text,
  indirizzo text,
  cap text,
  comune text,
  provincia text,
  email text,
  telefono text,
  data_iscrizione date not null default current_date,
  stato text not null default 'attivo' check (stato in ('attivo','sospeso','cessato')),
  data_cessazione date,
  note text,
  modulo_path text,
  created_at timestamptz not null default now()
);

-- Alla creazione di un utente: crea il profilo e lo collega al socio con la stessa email
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  update public.members set user_id = new.id
   where user_id is null and lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Categorie e progetti --------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo text not null default 'entrambi' check (tipo in ('entrata','uscita','entrambi'))
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descrizione text,
  attivo boolean not null default true
);

-- ---------- Prima nota (cassa) ----------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrata','uscita')),
  importo numeric(12,2) not null check (importo > 0),
  descrizione text not null,
  category_id uuid references public.categories(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  controparte text,                      -- da chi arriva / a chi va
  metodo text default 'contanti' check (metodo in ('contanti','bonifico','carta','pos','assegno','altro')),
  conto text default 'cassa' check (conto in ('cassa','banca')),
  data_competenza date not null,         -- quando viene impegnata / maturata
  data_effettiva date,                   -- quando il movimento avviene davvero (null = non ancora)
  numero_documento text,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists transactions_competenza_idx on public.transactions (data_competenza);
create index if not exists transactions_effettiva_idx on public.transactions (data_effettiva);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  path text not null,
  nome_file text not null,
  created_at timestamptz not null default now()
);

-- ---------- Quote associative -----------------------------------------
create table if not exists public.fees (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  anno integer not null,
  importo numeric(12,2) not null check (importo >= 0),
  data_pagamento date not null,
  metodo text default 'contanti',
  transaction_id uuid references public.transactions(id) on delete set null,
  unique (member_id, anno)
);

-- ---------- Libro verbali ---------------------------------------------
create table if not exists public.minutes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'direttivo' check (tipo in ('assemblea','direttivo','altro')),
  data date not null,
  titolo text not null,
  luogo text,
  presenti text,
  odg text,                              -- ordine del giorno
  testo text,                            -- corpo del verbale
  file_path text,                        -- PDF firmato/scansione (opzionale)
  visibile_soci boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Sicurezza (Row Level Security) ----------------------------
alter table public.profiles     enable row level security;
alter table public.members      enable row level security;
alter table public.categories   enable row level security;
alter table public.projects     enable row level security;
alter table public.transactions enable row level security;
alter table public.attachments  enable row level security;
alter table public.fees         enable row level security;
alter table public.minutes      enable row level security;

-- Il direttivo può tutto
do $$
declare t text;
begin
  foreach t in array array['profiles','members','categories','projects','transactions','attachments','fees','minutes']
  loop
    execute format('drop policy if exists "direttivo_all" on public.%I', t);
    execute format('create policy "direttivo_all" on public.%I for all using (public.is_direttivo()) with check (public.is_direttivo())', t);
  end loop;
end $$;

-- Ogni utente legge il proprio profilo
drop policy if exists "profilo_proprio" on public.profiles;
create policy "profilo_proprio" on public.profiles for select using (id = auth.uid());

-- Il socio legge la propria scheda, le proprie quote e i verbali resi visibili
drop policy if exists "socio_legge_se_stesso" on public.members;
create policy "socio_legge_se_stesso" on public.members for select using (user_id = auth.uid());

drop policy if exists "socio_legge_quote" on public.fees;
create policy "socio_legge_quote" on public.fees for select
  using (exists (select 1 from public.members m where m.id = fees.member_id and m.user_id = auth.uid()));

drop policy if exists "socio_legge_verbali" on public.minutes;
create policy "socio_legge_verbali" on public.minutes for select using (visibile_soci);

-- ---------- Archivio file (PDF moduli, ricevute, verbali) -------------
insert into storage.buckets (id, name, public) values ('documenti', 'documenti', false)
on conflict (id) do nothing;

drop policy if exists "documenti_direttivo" on storage.objects;
create policy "documenti_direttivo" on storage.objects for all
  using (bucket_id = 'documenti' and public.is_direttivo())
  with check (bucket_id = 'documenti' and public.is_direttivo());

-- ---------- Dati iniziali ---------------------------------------------
insert into public.categories (nome, tipo) values
  ('Quote associative', 'entrata'),
  ('Donazioni e erogazioni liberali', 'entrata'),
  ('5 per mille', 'entrata'),
  ('Contributi pubblici e bandi', 'entrata'),
  ('Raccolta fondi ed eventi', 'entrata'),
  ('Attività commerciale / sponsor', 'entrata'),
  ('Affitto e utenze', 'uscita'),
  ('Materiali e attrezzature', 'uscita'),
  ('Eventi e attività', 'uscita'),
  ('Comunicazione e grafica', 'uscita'),
  ('Rimborsi spese volontari', 'uscita'),
  ('Compensi e collaborazioni', 'uscita'),
  ('Assicurazioni', 'uscita'),
  ('Spese bancarie e postali', 'uscita'),
  ('Imposte e tasse', 'uscita'),
  ('Altro', 'entrambi')
on conflict (nome) do nothing;

-- =====================================================================
-- DOPO aver creato il tuo utente (Authentication > Users > Add user),
-- rendilo membro del direttivo con:
--   update public.profiles set role = 'direttivo' where email = 'la-tua-email@esempio.it';
-- =====================================================================
