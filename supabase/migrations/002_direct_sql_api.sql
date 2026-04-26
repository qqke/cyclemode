create extension if not exists pgcrypto with schema extensions;

drop function if exists public.create_or_get_reservation(date, text, boolean);
drop function if exists public.get_own_reservation(date, text);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('admin_password_hash', extensions.crypt('change-me', extensions.gen_salt('bf')))
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

create or replace function public.create_or_get_reservation(
  p_event_date date,
  p_device_hash text,
  p_age_confirmed boolean
)
returns table (
  id uuid,
  event_date date,
  queue_number integer,
  status text,
  reserved_at timestamptz
)
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
   where reservations.event_date = p_event_date
     and reservations.device_hash = p_device_hash;

  if found then
    return query
      select
        existing.id,
        existing.event_date,
        existing.queue_number,
        existing.status,
        existing.reserved_at;
    return;
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

  return query
    select
      created.id,
      created.event_date,
      created.queue_number,
      created.status,
      created.reserved_at;
end;
$$;

create or replace function public.get_own_reservation(
  p_event_date date,
  p_device_hash text
)
returns table (
  id uuid,
  event_date date,
  queue_number integer,
  status text,
  reserved_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.event_date,
    r.queue_number,
    r.status,
    r.reserved_at
    from public.reservations r
   where r.event_date = p_event_date
     and r.device_hash = p_device_hash
   limit 1;
$$;

create or replace function public.verify_admin_password(p_admin_password text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
        from public.app_settings
       where key = 'admin_password_hash'
         and value = extensions.crypt(coalesce(p_admin_password, ''), value)
    ),
    false
  );
$$;

create or replace function public.admin_list_reservations(
  p_event_date date,
  p_admin_password text
)
returns table (
  id uuid,
  event_date date,
  queue_number integer,
  device_hash_short text,
  status text,
  reserved_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.verify_admin_password(p_admin_password) then
    raise exception 'ADMIN_PASSWORD_INVALID';
  end if;

  return query
    select
      r.id,
      r.event_date,
      r.queue_number,
      left(r.device_hash, 10) as device_hash_short,
      r.status,
      r.reserved_at
    from public.reservations r
    where r.event_date = p_event_date
    order by r.queue_number asc;
end;
$$;

create or replace function public.admin_update_reservation_status(
  p_admin_password text,
  p_reservation_id uuid,
  p_status text
)
returns table (
  id uuid,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_password(p_admin_password) then
    raise exception 'ADMIN_PASSWORD_INVALID';
  end if;

  if p_status <> 'completed' then
    raise exception 'INVALID_STATUS';
  end if;

  return query
    update public.reservations r
       set status = 'completed',
           completed_at = now()
     where r.id = p_reservation_id
     returning r.id, r.status, r.completed_at;
end;
$$;

revoke all on public.app_settings from anon, authenticated;
revoke all on public.reservation_counters from anon, authenticated;
revoke all on public.reservations from anon, authenticated;

grant execute on function public.create_or_get_reservation(date, text, boolean) to anon, authenticated;
grant execute on function public.get_own_reservation(date, text) to anon, authenticated;
grant execute on function public.admin_list_reservations(date, text) to anon, authenticated;
grant execute on function public.admin_update_reservation_status(text, uuid, text) to anon, authenticated;
