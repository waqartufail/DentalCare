-- =====================================================================
-- DentCare | PHASE 4 : Admin = Doctor, Doctor ko sirf apne patients, Clinic logo
-- 05_clinic_ops.sql ke baad ek baar RUN karein. (Dobara chalane se koi nuksan nahi.)
-- =====================================================================

alter table clinics add column if not exists logo_url text;

-- Ek clinic me sirf ek Admin hota hai (jo register karta hai). Staff me ab 'admin' role nahi ban sakta.
-- (NOT VALID: purani koi rows hon to wo chhedi nahi jati, sirf nayi rows par rule lagta hai)
alter table employees drop constraint if exists employees_role_check;
alter table employees add constraint employees_role_check check (role not in ('executive','admin')) not valid;

-- ---------- Admin ke liye guards ----------
create or replace function my_clinic_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.clinic_id from profiles p
   where p.id = auth.uid()
     and (p.role = 'admin'
          or not exists (select 1 from employees e
                          where e.user_id = p.id and e.clinic_id = p.clinic_id and not e.is_active));
$$;

create or replace function employees_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id is not null then
    delete from profiles where id = old.user_id and role not in ('executive','admin');
  end if;
  return old;
end $$;

create or replace function employees_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (new.role is distinct from old.role or new.full_name is distinct from old.full_name) then
    update profiles set role = new.role, full_name = new.full_name
     where id = new.user_id and role not in ('executive','admin');
  end if;
  return new;
end $$;

-- ---------- Admin khud ko Doctor mark kare ----------
create or replace function set_admin_as_doctor(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := my_clinic_id();
  v_prof profiles%rowtype;
  v_emp employees%rowtype;
  v_email text;
begin
  if coalesce(my_role()::text, '') <> 'admin' or v_clinic is null then raise exception 'Not allowed'; end if;
  select * into v_prof from profiles where id = auth.uid();
  select * into v_emp from employees where user_id = auth.uid() and clinic_id = v_clinic and role = 'doctor' limit 1;
  if p_on then
    if found then
      update employees set is_active = true where id = v_emp.id;
    else
      v_email := coalesce(auth.jwt() ->> 'email', 'owner+' || v_clinic::text || '@dentcare.local');
      insert into employees(clinic_id, full_name, email, role, user_id)
      values (v_clinic, v_prof.full_name, v_email, 'doctor', auth.uid());
    end if;
  elsif found then
    if exists (select 1 from appointments where doctor_id = v_emp.id) then
      update employees set is_active = false where id = v_emp.id;     -- history bachi rahe
    else
      delete from employees where id = v_emp.id;
    end if;
  end if;
end $$;

-- ---------- Doctor ko sirf apne assigned patients ----------
create or replace function doctor_has_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from appointments a where a.patient_id = p_patient and a.doctor_id = my_employee_id());
$$;
create or replace function doctor_can_see_appt(p_appt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from appointments a
                  where a.id = p_appt and a.clinic_id = my_clinic_id()
                    and exists (select 1 from appointments b where b.patient_id = a.patient_id and b.doctor_id = my_employee_id()));
$$;
create or replace function doctor_owns_appt(p_appt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from appointments a where a.id = p_appt and a.doctor_id = my_employee_id());
$$;

-- patients
drop policy if exists patients_read on patients;
create policy patients_read on patients for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','lab_technician']));
drop policy if exists patients_doctor_read on patients;
create policy patients_doctor_read on patients for select to authenticated
  using (in_clinic(clinic_id, array['doctor']) and doctor_has_patient(id));

-- appointments (doctor: apne patients ki poori history)
drop policy if exists appt_read on appointments;
create policy appt_read on appointments for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']));
drop policy if exists appt_doctor_read on appointments;
create policy appt_doctor_read on appointments for select to authenticated
  using (in_clinic(clinic_id, array['doctor']) and doctor_has_patient(patient_id));

-- treatments on appointment
drop policy if exists at_read on appointment_treatments;
create policy at_read on appointment_treatments for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']));
drop policy if exists at_doctor_read on appointment_treatments;
create policy at_doctor_read on appointment_treatments for select to authenticated
  using (in_clinic(clinic_id, array['doctor']) and doctor_can_see_appt(appointment_id));
drop policy if exists at_write on appointment_treatments;
create policy at_write on appointment_treatments for all to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']))
  with check (in_clinic(clinic_id, array['admin','receptionist']));
drop policy if exists at_doctor_write on appointment_treatments;
create policy at_doctor_write on appointment_treatments for all to authenticated
  using (in_clinic(clinic_id, array['doctor']) and doctor_owns_appt(appointment_id))
  with check (in_clinic(clinic_id, array['doctor']) and doctor_owns_appt(appointment_id));

-- lab orders
drop policy if exists lab_read on lab_orders;
create policy lab_read on lab_orders for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','lab_technician']));
drop policy if exists lab_doctor_read on lab_orders;
create policy lab_doctor_read on lab_orders for select to authenticated
  using (in_clinic(clinic_id, array['doctor']) and doctor_id = my_employee_id());

-- ---------- Clinic logo ----------
create or replace function set_clinic_logo(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role()::text, '') <> 'admin' or my_clinic_id() is null then raise exception 'Not allowed'; end if;
  if p_url is not null and (length(p_url) > 1000 or p_url !~ '^https://') then raise exception 'Invalid logo url'; end if;
  update clinics set logo_url = p_url where id = my_clinic_id();
end $$;

do $$ begin
  insert into storage.buckets (id, name, public) values ('clinic-logos', 'clinic-logos', true)
  on conflict (id) do update set public = true;

  drop policy if exists logos_select on storage.objects;
  create policy logos_select on storage.objects for select to authenticated
    using (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = my_clinic_id()::text);
  drop policy if exists logos_insert on storage.objects;
  create policy logos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = my_clinic_id()::text and my_role()::text = 'admin');
  drop policy if exists logos_update on storage.objects;
  create policy logos_update on storage.objects for update to authenticated
    using (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = my_clinic_id()::text and my_role()::text = 'admin')
    with check (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = my_clinic_id()::text and my_role()::text = 'admin');
  drop policy if exists logos_delete on storage.objects;
  create policy logos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = my_clinic_id()::text and my_role()::text = 'admin');
exception when others then
  raise notice 'Storage bucket setup nahi hua (%). Dashboard -> Storage me "clinic-logos" naam ka PUBLIC bucket khud bana lein.', sqlerrm;
end $$;

-- ---------- Permissions ----------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (array['set_admin_as_doctor','set_clinic_logo']) loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
