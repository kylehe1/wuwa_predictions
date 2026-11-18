-- Run once in Supabase → SQL Editor.

create table settings (
  id int primary key default 1,
  players jsonb not null default '["K", "P"]'
);
insert into settings default values;

create table batches (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table characters (
  id text primary key,
  batch_id text not null references batches(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  name text not null default '',
  nickname text not null default '',
  notes text not null default '',
  guesses jsonb not null,
  created_at timestamptz not null default now()
);

-- No policies: the tables are only reachable through the site's
-- server functions (which use the secret key), never directly.
alter table settings enable row level security;
alter table batches enable row level security;
alter table characters enable row level security;

-- Only the server (secret key = service_role) may use the tables.
grant select, insert, update, delete on settings, batches, characters to service_role;

-- Public bucket for character images (read-only to the public;
-- uploads go through the server functions).
insert into storage.buckets (id, name, public) values ('images', 'images', true);
