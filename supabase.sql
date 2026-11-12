-- Truth & Dare multiplayer schema (Supabase)
-- Run this entire file in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (char_length(room_code)=6),
  host_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 18),
  is_host boolean not null default false,
  created_at timestamptz not null default now(),
  unique(room_id, player_name)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_name text not null,
  content text not null check (char_length(content) between 1 and 400),
  created_at timestamptz not null default now()
);

create table if not exists public.game_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  round_number integer not null default 1,
  challenge jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.messages enable row level security;
alter table public.game_state enable row level security;

-- Prototype policies: permit anonymous browser clients to use the game.
-- For a public production launch, replace these with authenticated membership-
-- checked policies / server-side RPCs to prevent impersonation and room tampering.
drop policy if exists "rooms public read" on public.rooms;
create policy "rooms public read" on public.rooms for select to anon, authenticated using (true);
drop policy if exists "rooms public create" on public.rooms;
create policy "rooms public create" on public.rooms for insert to anon, authenticated with check (true);

drop policy if exists "players public read" on public.players;
create policy "players public read" on public.players for select to anon, authenticated using (true);
drop policy if exists "players public join" on public.players;
create policy "players public join" on public.players for insert to anon, authenticated with check (true);
drop policy if exists "players public leave" on public.players;
create policy "players public leave" on public.players for delete to anon, authenticated using (true);

drop policy if exists "messages public read" on public.messages;
create policy "messages public read" on public.messages for select to anon, authenticated using (true);
drop policy if exists "messages public send" on public.messages;
create policy "messages public send" on public.messages for insert to anon, authenticated with check (true);

drop policy if exists "game state public read" on public.game_state;
create policy "game state public read" on public.game_state for select to anon, authenticated using (true);
drop policy if exists "game state public create" on public.game_state;
create policy "game state public create" on public.game_state for insert to anon, authenticated with check (true);
drop policy if exists "game state public update" on public.game_state;
create policy "game state public update" on public.game_state for update to anon, authenticated using (true) with check (true);

-- Enable Postgres change events for live player/chat/game updates.
do $$
begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.game_state;
exception when duplicate_object then null;
end $$;
