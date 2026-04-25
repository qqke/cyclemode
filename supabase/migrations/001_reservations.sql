create extension if not exists pgcrypto;

create table if not exists public.reservation_counters (
  event_date date primary key,
  next_number integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  queue_number integer not null,
  device_hash text not null,
  age_confirmed boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'completed')),
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (event_date, queue_number),
  unique (event_date, device_hash)
);

alter table public.reservation_counters enable row level security;
alter table public.reservations enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservations_touch_updated_at on public.reservations;
create trigger reservations_touch_updated_at
before update on public.reservations
for each row execute function public.touch_updated_at();

create or replace function public.create_or_get_reservation(
  p_event_date date,
  p_device_hash text,
  p_age_confirmed boolean
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.reservations;
  new_number integer;
  created public.reservations;
begin
  select *
    into existing
    from public.reservations
   where event_date = p_event_date
     and device_hash = p_device_hash;

  if found then
    return existing;
  end if;

  if p_age_confirmed is not true then
    raise exception 'AGE_CONFIRMATION_REQUIRED';
  end if;

  insert into public.reservation_counters as counters (event_date, next_number)
  values (p_event_date, 2)
  on conflict (event_date)
  do update
     set next_number = counters.next_number + 1,
         updated_at = now()
  returning next_number - 1 into new_number;

  insert into public.reservations (
    event_date,
    queue_number,
    device_hash,
    age_confirmed
  )
  values (
    p_event_date,
    new_number,
    p_device_hash,
    true
  )
  returning * into created;

  return created;
end;
$$;

create or replace function public.get_own_reservation(
  p_event_date date,
  p_device_hash text
)
returns public.reservations
language sql
security definer
set search_path = public
stable
as $$
  select *
    from public.reservations
   where event_date = p_event_date
     and device_hash = p_device_hash
   limit 1;
$$;

create index if not exists reservations_event_date_queue_idx
  on public.reservations (event_date, queue_number);
