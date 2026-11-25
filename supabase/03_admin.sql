-- =====================================================================
-- DentCare | PHASE 2 : Admin module
-- 01_schema.sql pehle chal chuki ho. Ye file Supabase SQL Editor me paste karke RUN karein.
-- (Dobara chalane se koi nuksan nahi, safe hai.)
-- =====================================================================

-- Purana public form (bina login) ab nahi chahiye: Admin ab account bana kar register karta hai
drop function if exists submit_clinic_request(text,text,text,text,text);

-- ---------- Tables ----------
create table if not exists treatments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  name        text not null,
  fee         numeric(12,2) not null check (fee >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists employees (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  phone         text,
  role          user_role not null check (role in ('admin','doctor','receptionist','lab_technician')),
  joining_date  date,
  salary        numeric(12,2) check (salary is null or salary >= 0),
  is_active     boolean not null default true,
  user_id       uuid references auth.users(id) on delete set null,  -- jab employee sign up kare tab link hota hai
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_employees_email on employees (lower(email));

create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  title         text not null,
  category      text not null default 'Other',
  amount        numeric(12,2) not null check (amount > 0),
  expense_date  date not null default current_date,
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_treatments_clinic on treatments(clinic_id);
create index if not exists idx_employees_clinic  on employees(clinic_id);
create index if not exists idx_expenses_clinic_date on expenses(clinic_id, expense_date);

-- ---------- Helpers ----------
create or replace function my_clinic_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.clinic_id from profiles p
   where p.id = auth.uid()
     and not exists (select 1 from employees e where e.user_id = p.id and not e.is_active);
$$;

create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function clinic_is_open(p_clinic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinics c
     where c.id = p_clinic
       and ( (c.status = 'trial'  and c.trial_ends_at > now())
          or (c.status = 'active' and (c.is_lifetime or c.subscription_ends_at > now())) )
  );
$$;

-- ---------- Row Level Security ----------
alter table treatments enable row level security;
alter table employees  enable row level security;
alter table expenses   enable row level security;

-- clinic apni row dekh sakti hai (expired/pending screen dikhane ke liye)
drop policy if exists clinics_member_read on clinics;
create policy clinics_member_read on clinics for select to authenticated
  using (id = my_clinic_id());

-- treatments: clinic ka har user parh sakta hai, sirf admin likh sakta hai
drop policy if exists treatments_read on treatments;
create policy treatments_read on treatments for select to authenticated
  using (clinic_id = my_clinic_id() and clinic_is_open(clinic_id));
drop policy if exists treatments_admin on treatments;
create policy treatments_admin on treatments for all to authenticated
  using (clinic_id = my_clinic_id() and clinic_is_open(clinic_id) and my_role() = 'admin')
  with check (clinic_id = my_clinic_id() and clinic_is_open(clinic_id) and my_role() = 'admin');
drop policy if exists treatments_exec on treatments;
create policy treatments_exec on treatments for all to authenticated
  using (is_executive()) with check (is_executive());

-- employees: sirf admin
drop policy if exists employees_admin on employees;
create policy employees_admin on employees for all to authenticated
  using (clinic_id = my_clinic_id() and clinic_is_open(clinic_id) and my_role() = 'admin')
  with check (clinic_id = my_clinic_id() and clinic_is_open(clinic_id) and my_role() = 'admin');
drop policy if exists employees_exec on employees;
create policy employees_exec on employees for all to authenticated
  using (is_executive()) with check (is_executive());

-- expenses: sirf admin
drop policy if exists expenses_admin on expenses;
create policy expenses_admin on expenses for all to authenticated
  using (clinic_id = my_clinic_id() and clinic_is_open(clinic_id) and my_role() = 'admin')
  with check (clinic_id = my_clinic_id() and clinic_is_open(clinic_id) and my_role() = 'admin');
drop policy if exists expenses_exec on expenses;
create policy expenses_exec on expenses for all to authenticated
  using (is_executive()) with check (is_executive());

-- ---------- Employee triggers ----------
create or replace function employees_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id is not null then
    delete from profiles where id = old.user_id and role <> 'executive';
  end if;
  return old;
end $$;
drop trigger if exists trg_employees_delete on employees;
create trigger trg_employees_delete after delete on employees
  for each row execute function employees_after_delete();

create or replace function employees_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (new.role is distinct from old.role or new.full_name is distinct from old.full_name) then
    update profiles set role = new.role, full_name = new.full_name
     where id = new.user_id and role <> 'executive';
  end if;
  return new;
end $$;
drop trigger if exists trg_employees_update on employees;
create trigger trg_employees_update after update on employees
  for each row execute function employees_after_update();

-- ---------- Admin registers as a clinic ----------
create or replace function register_clinic(
  p_name text, p_owner text, p_phone text, p_city text, p_address text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_prof profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_owner),'') = '' then
    raise exception 'Clinic name and owner name are required';
  end if;
  select * into v_prof from profiles where id = auth.uid();
  if found and (v_prof.role = 'executive' or v_prof.clinic_id is not null) then
    raise exception 'This account is already registered';
  end if;

  insert into clinics(name, owner_name, email, phone, city, address, status)
  values (trim(p_name), trim(p_owner), auth.jwt() ->> 'email', trim(p_phone), trim(p_city), trim(p_address), 'pending')
  returning id into v_id;

  insert into profiles(id, full_name, role, clinic_id)
  values (auth.uid(), trim(p_owner), 'admin', v_id)
  on conflict (id) do update
    set full_name = excluded.full_name, role = 'admin', clinic_id = excluded.clinic_id;

  return v_id;
end $$;
grant execute on function register_clinic(text,text,text,text,text) to authenticated;

-- ---------- Employee first login: invite (email) se link ----------
create or replace function claim_invite() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_emp employees%rowtype;
  v_confirmed timestamptz;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from profiles where id = auth.uid()) then return true; end if;

  select email_confirmed_at into v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then return false; end if;   -- unverified email se kisi aur ka invite claim na ho

  select * into v_emp from employees
   where lower(email) = lower(auth.jwt() ->> 'email') and user_id is null
   limit 1;
  if not found then return false; end if;

  insert into profiles(id, full_name, role, clinic_id)
  values (auth.uid(), v_emp.full_name, v_emp.role, v_emp.clinic_id);
  update employees set user_id = auth.uid() where id = v_emp.id;
  return true;
end $$;
grant execute on function claim_invite() to authenticated;

-- ---------- Admin clinic profile edit ----------
create or replace function update_my_clinic(p_name text, p_phone text, p_city text, p_address text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' or my_clinic_id() is null then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Clinic name is required'; end if;
  update clinics set name = trim(p_name), phone = trim(p_phone), city = trim(p_city), address = trim(p_address)
   where id = my_clinic_id();
end $$;
grant execute on function update_my_clinic(text,text,text,text) to authenticated;
