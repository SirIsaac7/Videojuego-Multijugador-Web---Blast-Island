-- Ejecutar en Supabase SQL Editor. Auth users se administra en auth.users.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 20),
  avatar_skin text not null default 'cyan',
  created_at timestamptz not null default now()
);
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  mode text not null check (mode in ('ffa','teams','survival','ctf')),
  winner_id uuid references public.profiles(id) on delete set null,
  duration_seconds integer not null default 0 check(duration_seconds >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.match_players (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  team smallint,
  kills integer not null default 0 check(kills >= 0),
  placement smallint,
  won boolean not null default false
);
create table if not exists public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  games_played integer not null default 0,
  wins integer not null default 0,
  eliminations integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.player_stats enable row level security;
create policy "profiles are readable" on public.profiles for select using (true);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid()=id);
create policy "users update own profile" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);
create policy "matches readable" on public.matches for select using (true);
create policy "match participants readable" on public.match_players for select using (true);
create policy "own stats readable" on public.player_stats for select using (auth.uid()=user_id);
-- No se permite al cliente insertar resultados oficiales. El backend debe hacerlo
-- mediante una función RPC protegida o service role en servidor, nunca en navegador.
