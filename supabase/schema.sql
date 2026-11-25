-- Redraft Sim: per-user cloud storage for saved leagues, leaguemate notes, keepers and settings.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
--
-- Every row belongs to one signed-in user. Row-level security means a user can only ever read,
-- write or delete their own rows, even though the browser talks to the database directly.
-- ESPN login cookies are never stored here (the site keeps them on the user's device only).

create table if not exists public.user_store (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_store_key_len check (char_length(key) <= 64),
  constraint user_store_value_len check (char_length(value) <= 2000000)
);

alter table public.user_store enable row level security;

-- Newer Supabase projects don't grant table access to API roles automatically. Signed-in users get
-- access (RLS below still limits them to their own rows); signed-out visitors ("anon") get none.
grant select, insert, update, delete on public.user_store to authenticated;
revoke all on public.user_store from anon;

drop policy if exists "read own rows" on public.user_store;
create policy "read own rows" on public.user_store
  for select using (auth.uid() = user_id);

drop policy if exists "insert own rows" on public.user_store;
create policy "insert own rows" on public.user_store
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own rows" on public.user_store;
create policy "update own rows" on public.user_store
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own rows" on public.user_store;
create policy "delete own rows" on public.user_store
  for delete using (auth.uid() = user_id);

-- Keep updated_at current on every change (the app uses it to know what's newer)
create or replace function public.touch_user_store() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_store_touch on public.user_store;
create trigger user_store_touch before update on public.user_store
  for each row execute function public.touch_user_store();

-- ---------------------------------------------------------------------------------------------
-- Waitlist: emails from the home page sign-up. Anyone can add their email; nobody can read the
-- list through the API (read it in the Supabase dashboard: Table Editor -> waitlist).
create table if not exists public.waitlist (
  id         bigint generated always as identity primary key,
  email      text        not null unique,
  source     text,
  created_at timestamptz not null default now(),
  constraint waitlist_email_format check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_source_len check (source is null or char_length(source) <= 40)
);
alter table public.waitlist enable row level security;
drop policy if exists "anyone can join" on public.waitlist;
create policy "anyone can join" on public.waitlist for insert to anon, authenticated with check (true);
grant insert on public.waitlist to anon, authenticated;
