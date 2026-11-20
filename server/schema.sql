-- Applied on every server start; every statement is idempotent.

create table if not exists habits (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists checks (
  habit_id uuid not null references habits on delete cascade,
  day date not null,
  primary key (habit_id, day)
);

-- Added after launch; existing rows are full checks.
alter table checks add column if not exists level text not null default 'done' check (level in ('done', 'half'));

-- Shape is validated by the API: {"kind":"daily"} | {"kind":"days","days":[0-6…]} | {"kind":"weekly","times":1-7}
alter table habits add column if not exists schedule jsonb not null default '{"kind":"daily"}';
-- Time of day was tried and removed.
alter table habits drop column if exists time_of_day;

-- Everyone who has signed in. Only the owner (OWNER_EMAIL) approves people; nobody sees or saves
-- anything before that.
create table if not exists users (
  email text primary key,
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  created_at timestamptz not null default now()
);

-- Habits became per-person after launch. The server gives ownerless habits to the owner on start,
-- then makes this column required.
alter table habits add column if not exists owner text references users;
create index if not exists habits_owner on habits (owner, position);
