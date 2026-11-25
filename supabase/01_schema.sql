-- =====================================================================
-- DentCare  |  PHASE 1 : Executive module
-- Supabase SQL Editor me poori file ek hi baar paste karke RUN karein.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type user_role as enum ('executive','admin','doctor','receptionist','lab_technician');
exception when duplicate_object then null; end $$;

do $$ begin
  create type clinic_status as enum ('pending','trial','active','suspended','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type billing_type as enum ('monthly','yearly','lifetime');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  billing     billing_type not null,
  price       numeric(12,2) not null check (price >= 0),
  currency    text not null default 'PKR',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists clinics (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  owner_name            text,
  email                 text,
  phone                 text,
  city                  text,
  address               text,
  status                clinic_status not null default 'pending',
  plan_id               uuid references plans(id),
  trial_ends_at         timestamptz,
  subscription_ends_at  timestamptz,
  is_lifetime           boolean not null default false,
  approved_at           timestamptz,
  notes                 text,
  is_test               boolean not null default false,   -- test data ki pehchan
  created_at            timestamptz not null default now()
);

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        user_role not null default 'admin',
  clinic_id   uuid references clinics(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  plan_id       uuid references plans(id),
  amount        numeric(12,2) not null,
  billing       billing_type,
  period_start  timestamptz,
  period_end    timestamptz,
  method        text,
  note          text,
  is_test       boolean not null default false,
  paid_at       timestamptz not null default now()
);

create index if not exists idx_clinics_status on clinics(status);
create index if not exists idx_payments_clinic on payments(clinic_id);

-- ---------- Helper ----------
create or replace function is_executive() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'executive');
$$;

-- ---------- Row Level Security ----------
alter table plans    enable row level security;
alter table clinics  enable row level security;
alter table profiles enable row level security;
alter table payments enable row level security;

drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated using (true);
drop policy if exists plans_exec on plans;
create policy plans_exec on plans for all to authenticated
  using (is_executive()) with check (is_executive());

drop policy if exists clinics_exec on clinics;
create policy clinics_exec on clinics for all to authenticated
  using (is_executive()) with check (is_executive());
-- (Agle phase me: clinic ke apne users apni clinic dekh sakenge)

drop policy if exists payments_exec on payments;
create policy payments_exec on payments for all to authenticated
  using (is_executive()) with check (is_executive());

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for select to authenticated
  using (id = auth.uid() or is_executive());
drop policy if exists profiles_exec_write on profiles;
create policy profiles_exec_write on profiles for all to authenticated
  using (is_executive()) with check (is_executive());

-- ---------- Public: clinic registration request (bina login) ----------
create or replace function submit_clinic_request(
  p_name text, p_owner text, p_email text, p_phone text, p_city text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_owner),'') = '' then
    raise exception 'Clinic name and owner name are required';
  end if;
  insert into clinics(name, owner_name, email, phone, city, status)
  values (trim(p_name), trim(p_owner), trim(p_email), trim(p_phone), trim(p_city), 'pending');
end $$;
grant execute on function submit_clinic_request(text,text,text,text,text) to anon, authenticated;

-- ---------- Executive actions ----------
create or replace function approve_clinic(p_id uuid, p_trial_days int default 30)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_executive() then raise exception 'Not allowed'; end if;
  update clinics
     set status = 'trial',
         trial_ends_at = now() + make_interval(days => p_trial_days),
         approved_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'Clinic is not pending'; end if;
end $$;

create or replace function reject_clinic(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_executive() then raise exception 'Not allowed'; end if;
  update clinics set status = 'rejected', notes = coalesce(p_note, notes)
   where id = p_id and status = 'pending';
  if not found then raise exception 'Clinic is not pending'; end if;
end $$;

create or replace function extend_trial(p_id uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_executive() then raise exception 'Not allowed'; end if;
  update clinics
     set status = 'trial',
         trial_ends_at = greatest(now(), coalesce(trial_ends_at, now())) + make_interval(days => p_days)
   where id = p_id and status in ('trial','suspended') and not is_lifetime
     and (subscription_ends_at is null or subscription_ends_at < now());
  if not found then raise exception 'Trial cannot be extended for this clinic'; end if;
end $$;

create or replace function record_payment(
  p_clinic uuid, p_plan uuid, p_amount numeric, p_method text default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan plans%rowtype;
  v_clinic clinics%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not is_executive() then raise exception 'Not allowed'; end if;
  select * into v_plan from plans where id = p_plan;
  if not found then raise exception 'Plan not found'; end if;
  select * into v_clinic from clinics where id = p_clinic;
  if not found then raise exception 'Clinic not found'; end if;
  if v_clinic.status in ('pending','rejected') then
    raise exception 'Approve the clinic first';
  end if;

  v_start := greatest(now(), coalesce(v_clinic.subscription_ends_at, now()));
  if v_plan.billing = 'monthly' then v_end := v_start + interval '1 month';
  elsif v_plan.billing = 'yearly' then v_end := v_start + interval '1 year';
  else v_end := null; end if;

  insert into payments(clinic_id, plan_id, amount, billing, period_start, period_end, method, note, is_test)
  values (p_clinic, p_plan, p_amount, v_plan.billing, v_start, v_end, p_method, p_note, v_clinic.is_test);

  update clinics
     set status = 'active',
         plan_id = p_plan,
         is_lifetime = (v_plan.billing = 'lifetime'),
         subscription_ends_at = v_end
   where id = p_clinic;
end $$;

create or replace function suspend_clinic(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_executive() then raise exception 'Not allowed'; end if;
  update clinics set status = 'suspended' where id = p_id and status in ('trial','active');
  if not found then raise exception 'Clinic cannot be suspended'; end if;
end $$;

create or replace function reactivate_clinic(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c clinics%rowtype;
begin
  if not is_executive() then raise exception 'Not allowed'; end if;
  select * into c from clinics where id = p_id and status = 'suspended';
  if not found then raise exception 'Clinic is not suspended'; end if;
  update clinics set status =
    case when c.is_lifetime or c.subscription_ends_at > now() then 'active'::clinic_status
         else 'trial'::clinic_status end
   where id = p_id;
end $$;

-- ---------- Seed: default fee plans (Executive baad me edit kar sakta hai) ----------
insert into plans(name, billing, price)
select * from (values
  ('Monthly Plan',  'monthly'::billing_type,   5000),
  ('Yearly Plan',   'yearly'::billing_type,   50000),
  ('Lifetime Plan', 'lifetime'::billing_type, 150000)
) v(name, billing, price)
where not exists (select 1 from plans);
