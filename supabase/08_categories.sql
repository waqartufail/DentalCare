-- =====================================================================
-- DentCare | PHASE 5 : Treatment Categories (Main Category -> Treatments)
-- 07_phase4.sql ke baad ek baar RUN karein. (Dobara chalane se koi nuksan nahi.)
-- Har clinic ki apni categories, apni treatments aur apni fee hoti hai.
-- =====================================================================

create table if not exists treatment_categories (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tcat_clinic on treatment_categories(clinic_id, sort_order);
-- ek clinic me ek naam ki do categories na hon
do $$ begin
  create unique index uq_tcat_name on treatment_categories (clinic_id, lower(name));
exception when others then raise notice 'Category naam unique index nahi bana (%)', sqlerrm; end $$;

-- purani treatments category ke baghair chalti rahengi ("Uncategorized")
alter table treatments add column if not exists category_id uuid references treatment_categories(id) on delete set null;
create index if not exists idx_treat_cat on treatments(category_id);

-- appointment ki line me category ka naam bhi mehfooz (reports ke liye; baad me treatment badle/hate to bhi)
alter table appointment_treatments add column if not exists category_name text;

create or replace function appt_treatments_set_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.treatment_id is not null and new.category_name is null then
    select c.name into new.category_name
      from treatments t left join treatment_categories c on c.id = t.category_id
     where t.id = new.treatment_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_at_category on appointment_treatments;
create trigger trg_at_category before insert on appointment_treatments
  for each row execute function appt_treatments_set_category();

-- ---------- Row Level Security ----------
alter table treatment_categories enable row level security;

drop policy if exists tcat_read on treatment_categories;
create policy tcat_read on treatment_categories for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','doctor','lab_technician']));
drop policy if exists tcat_admin on treatment_categories;
create policy tcat_admin on treatment_categories for all to authenticated
  using (in_clinic(clinic_id, array['admin'])) with check (in_clinic(clinic_id, array['admin']));
drop policy if exists tcat_exec on treatment_categories;
create policy tcat_exec on treatment_categories for all to authenticated
  using (is_executive()) with check (is_executive());

-- treatment ki category usi clinic ki honi chahiye (doosri clinic ki category na lag sake)
create or replace function treatments_check_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and not exists (
       select 1 from treatment_categories c where c.id = new.category_id and c.clinic_id = new.clinic_id) then
    raise exception 'Category is clinic ki nahi hai';
  end if;
  return new;
end $$;
drop trigger if exists trg_treat_cat_check on treatments;
create trigger trg_treat_cat_check before insert or update of category_id on treatments
  for each row execute function treatments_check_category();

notify pgrst, 'reload schema';
