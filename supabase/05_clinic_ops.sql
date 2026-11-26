-- =====================================================================
-- DentCare | PHASE 3 : Receptionist, Doctor, Lab, Helper, Attendance, Payroll
-- Pehle 04_helper_role.sql chala chuke hon. Ye poori file ek baar RUN karein.
-- (Dobara chalane se koi nuksan nahi.)
-- =====================================================================

create extension if not exists btree_gist;

-- ---------- Clinic settings (Admin Settings screen se badalti hain) ----------
alter table clinics
  add column if not exists timezone             text    not null default 'Asia/Karachi',
  add column if not exists country_code         text    not null default '92',
  add column if not exists open_time            time    not null default '09:00',
  add column if not exists close_time           time    not null default '17:00',
  add column if not exists working_days         int[]   not null default '{1,2,3,4,5,6}',   -- 1=Mon ... 7=Sun
  add column if not exists slot_minutes         int     not null default 30,
  add column if not exists noshow_grace_minutes int     not null default 15,
  add column if not exists reminder_minutes     int     not null default 60,
  add column if not exists followup_minutes     int     not null default 15,
  add column if not exists followup_fee         numeric(12,2) not null default 0,
  add column if not exists lat                  double precision,
  add column if not exists lng                  double precision,
  add column if not exists radius_m             int     not null default 100,
  add column if not exists std_work_minutes     int     not null default 480,
  add column if not exists overtime_multiplier  numeric(4,2) not null default 1;

alter table treatments add column if not exists needs_lab boolean not null default false;
alter table employees  add column if not exists overtime_enabled boolean not null default false;
alter table profiles   add column if not exists is_dev boolean not null default false;

-- employees.role: ab helper bhi allowed
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'employees'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table employees drop constraint %I', r.conname);
  end loop;
end $$;
alter table employees add constraint employees_role_check check (role <> 'executive');

-- ---------- Tables ----------
create table if not exists patients (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_no  int  not null,
  full_name   text not null,
  phone       text,
  gender      text,
  age         int,
  address     text,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (clinic_id, patient_no)
);

create table if not exists appointments (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics(id) on delete cascade,
  patient_id          uuid not null references patients(id) on delete cascade,
  doctor_id           uuid not null references employees(id),
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  kind                text not null default 'new' check (kind in ('new','followup','lab_delivery')),
  status              text not null default 'scheduled'
                      check (status in ('scheduled','arrived','in_progress','completed','cancelled','no_show')),
  diagnosis           text,
  prescription        text,
  doctor_notes        text,
  followup_required   boolean not null default false,
  followup_note       text,
  followup_booked_id  uuid references appointments(id) on delete set null,
  followup_dismissed  boolean not null default false,
  rescheduled_from    uuid references appointments(id) on delete set null,
  reminder_sent       boolean not null default false,
  arrived_at          timestamptz,
  completed_at        timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  check (end_at > start_at)
);
do $$ begin
  alter table appointments add constraint appt_no_overlap
    exclude using gist (doctor_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('scheduled','arrived','in_progress'));
exception when duplicate_object then null; end $$;
create index if not exists idx_appt_clinic_start on appointments(clinic_id, start_at);
create index if not exists idx_appt_patient on appointments(patient_id);
create index if not exists idx_appt_doctor on appointments(doctor_id, start_at);

create table if not exists appointment_treatments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  appointment_id  uuid not null references appointments(id) on delete cascade,
  treatment_id    uuid references treatments(id) on delete set null,
  name            text not null,
  fee             numeric(12,2) not null check (fee >= 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_at_appt on appointment_treatments(appointment_id);

create table if not exists patient_payments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  appointment_id  uuid not null references appointments(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  amount          numeric(12,2) not null check (amount > 0),
  method          text,
  note            text,
  received_by     uuid references auth.users(id) on delete set null,
  received_at     timestamptz not null default now()
);
create index if not exists idx_pp_clinic_date on patient_payments(clinic_id, received_at);
create index if not exists idx_pp_appt on patient_payments(appointment_id);

create table if not exists lab_orders (
  id                        uuid primary key default gen_random_uuid(),
  clinic_id                 uuid not null references clinics(id) on delete cascade,
  appointment_id            uuid not null references appointments(id) on delete cascade,
  appointment_treatment_id  uuid unique references appointment_treatments(id) on delete cascade,
  patient_id                uuid not null references patients(id) on delete cascade,
  doctor_id                 uuid not null references employees(id),
  title                     text not null,
  notes                     text,
  status                    text not null default 'pending' check (status in ('pending','ready')),
  ready_at                  timestamptz,
  ready_by                  uuid references auth.users(id) on delete set null,
  delivery_appointment_id   uuid references appointments(id) on delete set null,
  created_at                timestamptz not null default now()
);
create index if not exists idx_lab_clinic on lab_orders(clinic_id, status);

create table if not exists message_queue (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid references patients(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete set null,
  phone           text not null,
  kind            text not null,
  body            text not null,
  status          text not null default 'pending' check (status in ('pending','sent','dismissed')),
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists idx_msg_pending on message_queue(clinic_id, status);

create table if not exists attendance (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  work_date        date not null,
  check_in         timestamptz,
  check_out        timestamptz,
  in_lat           double precision, in_lng double precision, in_dist int,
  out_lat          double precision, out_lng double precision, out_dist int,
  worked_minutes   int,
  overtime_minutes int not null default 0,
  unique (user_id, work_date)
);
create index if not exists idx_att_clinic_date on attendance(clinic_id, work_date);

create table if not exists payroll_payments (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,
  month             date not null,
  base              numeric(12,2) not null,
  overtime          numeric(12,2) not null default 0,
  total             numeric(12,2) not null,
  days_present      int not null default 0,
  overtime_minutes  int not null default 0,
  paid_at           timestamptz not null default now(),
  paid_by           uuid references auth.users(id) on delete set null,
  unique (employee_id, month)
);

-- ---------- Helpers ----------
create or replace function my_clinic_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.clinic_id from profiles p
   where p.id = auth.uid()
     and not exists (select 1 from employees e
                      where e.user_id = p.id and e.clinic_id = p.clinic_id and not e.is_active);
$$;

create or replace function my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select e.id from employees e
    join profiles p on p.id = e.user_id and p.clinic_id = e.clinic_id
   where e.user_id = auth.uid() and e.is_active
   limit 1;
$$;

create or replace function in_clinic(p_clinic uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select p_clinic is not null and p_clinic = my_clinic_id() and clinic_is_open(p_clinic)
         and coalesce(my_role()::text, '') = any (p_roles);
$$;

create or replace function _dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create or replace function _fmt_ts(p_ts timestamptz, p_tz text) returns text
language sql immutable as $$
  select to_char(p_ts at time zone p_tz, 'DD Mon YYYY, HH12:MI AM');
$$;

-- ---------- Row Level Security ----------
alter table patients                enable row level security;
alter table appointments            enable row level security;
alter table appointment_treatments  enable row level security;
alter table patient_payments        enable row level security;
alter table lab_orders              enable row level security;
alter table message_queue           enable row level security;
alter table attendance              enable row level security;
alter table payroll_payments        enable row level security;

-- patients
drop policy if exists patients_read on patients;
create policy patients_read on patients for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','doctor','lab_technician']));
drop policy if exists patients_write on patients;
create policy patients_write on patients for all to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']))
  with check (in_clinic(clinic_id, array['admin','receptionist']));

-- appointments
drop policy if exists appt_read on appointments;
create policy appt_read on appointments for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','doctor']));
drop policy if exists appt_write on appointments;
create policy appt_write on appointments for all to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']))
  with check (in_clinic(clinic_id, array['admin','receptionist']));
drop policy if exists appt_doctor_update on appointments;
create policy appt_doctor_update on appointments for update to authenticated
  using (in_clinic(clinic_id, array['doctor']) and doctor_id = my_employee_id())
  with check (in_clinic(clinic_id, array['doctor']) and doctor_id = my_employee_id());

-- appointment treatments (charges)
drop policy if exists at_read on appointment_treatments;
create policy at_read on appointment_treatments for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','doctor']));
drop policy if exists at_write on appointment_treatments;
create policy at_write on appointment_treatments for all to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','doctor']))
  with check (in_clinic(clinic_id, array['admin','receptionist','doctor']));

-- payments: sirf parhna; likhna receive_payment() se
drop policy if exists pp_read on patient_payments;
create policy pp_read on patient_payments for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']));

-- lab orders: parhna; badalna RPC se
drop policy if exists lab_read on lab_orders;
create policy lab_read on lab_orders for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist','doctor','lab_technician']));

-- messages
drop policy if exists msg_read on message_queue;
create policy msg_read on message_queue for select to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']));
drop policy if exists msg_update on message_queue;
create policy msg_update on message_queue for update to authenticated
  using (in_clinic(clinic_id, array['admin','receptionist']))
  with check (in_clinic(clinic_id, array['admin','receptionist']));

-- attendance: apni khud ki, admin ko poori clinic ki
drop policy if exists att_read on attendance;
create policy att_read on attendance for select to authenticated
  using (user_id = auth.uid() or in_clinic(clinic_id, array['admin']));

-- payroll
drop policy if exists payroll_read on payroll_payments;
create policy payroll_read on payroll_payments for select to authenticated
  using (in_clinic(clinic_id, array['admin']));

-- ---------- Triggers ----------
create or replace function patients_set_no() returns trigger
language plpgsql as $$
begin
  if new.patient_no is null then
    select coalesce(max(patient_no), 0) + 1 into new.patient_no from patients where clinic_id = new.clinic_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_patients_no on patients;
create trigger trg_patients_no before insert on patients
  for each row execute function patients_set_no();

-- naye followup appointment par followup ki fee ka charge khud lag jata hai (0 bhi ho sakti hai)
create or replace function appointments_followup_fee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'followup' and new.rescheduled_from is null then
    insert into appointment_treatments(clinic_id, appointment_id, treatment_id, name, fee, created_by)
    select new.clinic_id, new.id, null, 'Follow-up', c.followup_fee, new.created_by
      from clinics c where c.id = new.clinic_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_appt_followup_fee on appointments;
create trigger trg_appt_followup_fee after insert on appointments
  for each row execute function appointments_followup_fee();

-- ---------- Internal helpers (sirf doosre functions use karte hain) ----------
create or replace function _queue_msg(p_clinic uuid, p_patient uuid, p_appt uuid, p_kind text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  select phone into v_phone from patients where id = p_patient;
  if coalesce(trim(v_phone), '') = '' then return; end if;
  insert into message_queue(clinic_id, patient_id, appointment_id, phone, kind, body)
  values (p_clinic, p_patient, p_appt, v_phone, p_kind, p_body);
end $$;

-- ek doctor ke us din ke khali slots (slot grid clinic ke open time se shuru)
create or replace function _slots_for_day(p_doctor uuid, p_day date, p_minutes int, p_after timestamptz)
returns setof timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  c clinics%rowtype;
  v_open timestamptz;
  v_close timestamptz;
  t timestamptz;
begin
  select cl.* into c from clinics cl join employees e on e.clinic_id = cl.id where e.id = p_doctor;
  if not found then return; end if;
  if not (extract(isodow from p_day)::int = any (c.working_days)) then return; end if;
  v_open  := (p_day + c.open_time)  at time zone c.timezone;
  v_close := (p_day + c.close_time) at time zone c.timezone;
  t := v_open;
  while t + make_interval(mins => p_minutes) <= v_close loop
    if t >= p_after and not exists (
         select 1 from appointments a
          where a.doctor_id = p_doctor
            and a.status in ('scheduled','arrived','in_progress')
            and tstzrange(a.start_at, a.end_at) && tstzrange(t, t + make_interval(mins => p_minutes))) then
      return next t;
    end if;
    t := t + make_interval(mins => c.slot_minutes);
  end loop;
end $$;

create or replace function _next_free_slot(p_doctor uuid, p_from timestamptz, p_minutes int)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  c clinics%rowtype;
  d date;
  i int;
  s timestamptz;
begin
  select cl.* into c from clinics cl join employees e on e.clinic_id = cl.id where e.id = p_doctor;
  if not found then return null; end if;
  d := (p_from at time zone c.timezone)::date;
  for i in 0..60 loop
    select min(x) into s from _slots_for_day(p_doctor, d + i, p_minutes, p_from) as x;
    if s is not null then return s; end if;
  end loop;
  return null;
end $$;

create or replace function _book(p_clinic uuid, p_patient uuid, p_doctor uuid, p_start timestamptz, p_kind text, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c clinics%rowtype;
  v_dur int;
  v_id uuid;
begin
  select * into c from clinics where id = p_clinic;
  if not found or not clinic_is_open(p_clinic) then raise exception 'Clinic active nahi hai'; end if;
  if not exists (select 1 from patients where id = p_patient and clinic_id = p_clinic) then
    raise exception 'Patient nahi mila';
  end if;
  if not exists (select 1 from employees where id = p_doctor and clinic_id = p_clinic and role = 'doctor' and is_active) then
    raise exception 'Doctor nahi mila';
  end if;
  if p_kind not in ('new','followup','lab_delivery') then raise exception 'Invalid kind'; end if;
  v_dur := case when p_kind = 'followup' then c.followup_minutes else c.slot_minutes end;
  if not exists (
       select 1 from _slots_for_day(p_doctor, (p_start at time zone c.timezone)::date, v_dur, now() - interval '5 minutes') s
        where s = p_start) then
    raise exception 'Ye time available slot nahi hai';
  end if;
  begin
    insert into appointments(clinic_id, patient_id, doctor_id, start_at, end_at, kind, status, created_by)
    values (p_clinic, p_patient, p_doctor, p_start, p_start + make_interval(mins => v_dur), p_kind, 'scheduled', p_by)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ye slot abhi kisi aur ne book kar liya';
  end;
  return v_id;
end $$;

-- ---------- Receptionist / Doctor RPCs ----------
create or replace function list_doctors() returns table(id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select e.id, e.full_name from employees e
   where e.clinic_id = my_clinic_id() and clinic_is_open(e.clinic_id)
     and e.role = 'doctor' and e.is_active
     and coalesce(my_role()::text, '') in ('admin','receptionist','doctor','lab_technician')
   order by e.full_name;
$$;

create or replace function available_slots(p_doctor uuid, p_day date, p_minutes int)
returns setof timestamptz language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from employees where id = p_doctor and clinic_id = my_clinic_id()) then return; end if;
  return query select * from _slots_for_day(p_doctor, p_day, p_minutes, now());
end $$;

create or replace function next_available(p_doctor uuid, p_minutes int)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from employees where id = p_doctor and clinic_id = my_clinic_id()) then return null; end if;
  return _next_free_slot(p_doctor, now(), p_minutes);
end $$;

create or replace function book_appointment(p_patient uuid, p_doctor uuid, p_start timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role()::text, '') not in ('admin','receptionist') then raise exception 'Not allowed'; end if;
  return _book(my_clinic_id(), p_patient, p_doctor, p_start, 'new', auth.uid());
end $$;

create or replace function book_followup(p_from uuid, p_start timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype; v_id uuid;
begin
  if coalesce(my_role()::text, '') not in ('admin','receptionist') then raise exception 'Not allowed'; end if;
  select * into a from appointments where id = p_from and clinic_id = my_clinic_id();
  if not found then raise exception 'Appointment nahi mili'; end if;
  if a.followup_booked_id is not null then raise exception 'Followup pehle se book hai'; end if;
  v_id := _book(a.clinic_id, a.patient_id, a.doctor_id, p_start, 'followup', auth.uid());
  update appointments set followup_booked_id = v_id where id = p_from;
  return v_id;
end $$;

create or replace function receive_payment(p_appt uuid, p_amount numeric, p_method text default 'Cash', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype; v_total numeric; v_paid numeric;
begin
  if coalesce(my_role()::text, '') not in ('admin','receptionist') then raise exception 'Not allowed'; end if;
  select * into a from appointments where id = p_appt and clinic_id = my_clinic_id();
  if not found then raise exception 'Appointment nahi mili'; end if;
  if not clinic_is_open(a.clinic_id) then raise exception 'Clinic active nahi hai'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount sahi likhein'; end if;
  select coalesce(sum(fee), 0) into v_total from appointment_treatments where appointment_id = p_appt;
  select coalesce(sum(amount), 0) into v_paid from patient_payments where appointment_id = p_appt;
  if p_amount > v_total - v_paid then raise exception 'Amount baqaya (%) se zyada hai', (v_total - v_paid); end if;
  insert into patient_payments(clinic_id, appointment_id, patient_id, amount, method, note, received_by)
  values (a.clinic_id, a.id, a.patient_id, p_amount, p_method, p_note, auth.uid());
end $$;

create or replace function finish_consult(
  p_appt uuid, p_diagnosis text, p_prescription text, p_notes text, p_followup boolean, p_followup_note text
) returns void language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype;
begin
  select * into a from appointments
   where id = p_appt and clinic_id = my_clinic_id()
     and (doctor_id = my_employee_id() or coalesce(my_role()::text, '') = 'admin');
  if not found then raise exception 'Appointment nahi mili'; end if;
  if not clinic_is_open(a.clinic_id) then raise exception 'Clinic active nahi hai'; end if;
  if a.status in ('cancelled','no_show') then raise exception 'Ye appointment cancel ho chuki hai'; end if;

  update appointments
     set diagnosis = p_diagnosis, prescription = p_prescription, doctor_notes = p_notes,
         followup_required = coalesce(p_followup, false),
         followup_note = case when coalesce(p_followup, false) then p_followup_note else null end,
         followup_dismissed = false,
         status = 'completed', completed_at = coalesce(a.completed_at, now())
   where id = p_appt;

  -- jin treatments me lab ka kaam hai unke order Lab Technician ko chale jate hain
  insert into lab_orders(clinic_id, appointment_id, appointment_treatment_id, patient_id, doctor_id, title)
  select a.clinic_id, a.id, x.id, a.patient_id, a.doctor_id, x.name
    from appointment_treatments x
    join treatments t on t.id = x.treatment_id
   where x.appointment_id = a.id and t.needs_lab
     and not exists (select 1 from lab_orders lo where lo.appointment_treatment_id = x.id);
end $$;

-- ---------- Lab ----------
create or replace function lab_mark_ready(p_order uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  lo lab_orders%rowtype;
  c clinics%rowtype;
  v_from timestamptz;
  v_start timestamptz;
  v_appt uuid;
  v_name text;
begin
  if coalesce(my_role()::text, '') not in ('admin','lab_technician') then raise exception 'Not allowed'; end if;
  select * into lo from lab_orders where id = p_order and clinic_id = my_clinic_id() and status = 'pending';
  if not found then raise exception 'Order nahi mila ya pehle se ready hai'; end if;
  select * into c from clinics where id = lo.clinic_id;
  if not clinic_is_open(c.id) then raise exception 'Clinic active nahi hai'; end if;

  v_from := ((now() at time zone c.timezone)::date + 1)::timestamp at time zone c.timezone;   -- kal subah se

  -- patient ki kal ya uske baad ki lab_delivery appointment pehle se ho to wahi use hogi
  select a.id, a.start_at into v_appt, v_start from appointments a
   where a.patient_id = lo.patient_id and a.doctor_id = lo.doctor_id and a.kind = 'lab_delivery'
     and a.status = 'scheduled' and a.start_at >= v_from
   order by a.start_at limit 1;

  if v_appt is null then
    v_start := _next_free_slot(lo.doctor_id, v_from, c.slot_minutes);
    if v_start is null then raise exception 'Doctor ka koi khali slot nahi mila'; end if;
    v_appt := _book(c.id, lo.patient_id, lo.doctor_id, v_start, 'lab_delivery', auth.uid());
  end if;

  update lab_orders set status = 'ready', ready_at = now(), ready_by = auth.uid(), delivery_appointment_id = v_appt
   where id = lo.id;

  select full_name into v_name from patients where id = lo.patient_id;
  perform _queue_msg(c.id, lo.patient_id, v_appt, 'lab_ready',
    format('Assalam o Alaikum %s, aap ka %s tayyar hai. Aap ki appointment %s par book kar di gayi hai, barah-e-meherbani waqt par aakar apna treatment mukammal karwayein. - %s',
           v_name, lo.title, _fmt_ts(v_start, c.timezone), c.name));
  return v_start;
end $$;

-- ---------- Auto cancel + reschedule + reminders (har minute) ----------
create or replace function process_appointments() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  c clinics%rowtype;
  v_dur int;
  v_start timestamptz;
  v_new uuid;
begin
  -- 1) patient waqt par nahi aaya: grace ke baad no_show, aur agle khali slot me nayi appointment
  for r in
    select a.* from appointments a
      join clinics cl on cl.id = a.clinic_id
     where a.status = 'scheduled' and clinic_is_open(a.clinic_id)
       and a.start_at + make_interval(mins => cl.noshow_grace_minutes) < now()
     for update of a skip locked
  loop
    select * into c from clinics where id = r.clinic_id;
    update appointments set status = 'no_show' where id = r.id;
    v_dur := ceil(extract(epoch from (r.end_at - r.start_at)) / 60)::int;
    v_start := _next_free_slot(r.doctor_id, now(), v_dur);
    if v_start is not null then
      insert into appointments(clinic_id, patient_id, doctor_id, start_at, end_at, kind, status, rescheduled_from)
      values (r.clinic_id, r.patient_id, r.doctor_id, v_start, v_start + make_interval(mins => v_dur), r.kind, 'scheduled', r.id)
      returning id into v_new;

      insert into appointment_treatments(clinic_id, appointment_id, treatment_id, name, fee, created_by)
      select clinic_id, v_new, treatment_id, name, fee, created_by from appointment_treatments where appointment_id = r.id;
      update patient_payments set appointment_id = v_new where appointment_id = r.id;

      perform _queue_msg(r.clinic_id, r.patient_id, v_new, 'rescheduled',
        format('Assalam o Alaikum, aap apni appointment par nahi aaye the. Aap ki appointment ab %s par kar di gayi hai. - %s',
               _fmt_ts(v_start, c.timezone), c.name));
    end if;
  end loop;

  -- 2) reminder: appointment se pehle (default 1 ghanta)
  for r in
    select a.id, a.clinic_id, a.patient_id, a.start_at, p.full_name as pname, cl.name as cname, cl.timezone as tz
      from appointments a
      join patients p on p.id = a.patient_id
      join clinics cl on cl.id = a.clinic_id
     where a.status = 'scheduled' and not a.reminder_sent and clinic_is_open(a.clinic_id)
       and a.start_at > now()
       and a.start_at <= now() + make_interval(mins => cl.reminder_minutes)
     for update of a skip locked
  loop
    perform _queue_msg(r.clinic_id, r.patient_id, r.id, 'reminder',
      format('Assalam o Alaikum %s, %s me aap ki appointment %s par hai. Barah-e-meherbani 10 minute pehle pohanch jaiyega. Shukriya.',
             r.pname, r.cname, _fmt_ts(r.start_at, r.tz)));
    update appointments set reminder_sent = true where id = r.id;
  end loop;
end $$;

-- ---------- Attendance ----------
create or replace function attendance_check_in(p_lat double precision, p_lng double precision, p_acc double precision default null)
returns text language plpgsql security definer set search_path = public as $$
declare c clinics%rowtype; v_clinic uuid; v_dist double precision; v_date date; v_row attendance%rowtype;
begin
  v_clinic := my_clinic_id();
  if v_clinic is null or coalesce(my_role()::text, '') = 'executive' then raise exception 'Not allowed'; end if;
  if not clinic_is_open(v_clinic) then raise exception 'Clinic active nahi hai'; end if;
  select * into c from clinics where id = v_clinic;
  if c.lat is null or c.lng is null then raise exception 'Admin ne abhi clinic ki location set nahi ki (Settings)'; end if;
  if p_lat is null or p_lng is null then raise exception 'Location nahi mili'; end if;
  if p_acc is not null and p_acc > 300 then raise exception 'GPS accuracy kam hai (% m). Khuli jagah ja kar dobara try karein', round(p_acc); end if;
  v_dist := _dist_m(c.lat, c.lng, p_lat, p_lng);
  if v_dist > c.radius_m then
    raise exception 'Aap clinic ke andar nahi hain (% m door). Attendance mark nahi hui', round(v_dist);
  end if;
  v_date := (now() at time zone c.timezone)::date;
  select * into v_row from attendance where user_id = auth.uid() and work_date = v_date;
  if found and v_row.check_in is not null then return 'already'; end if;
  insert into attendance(clinic_id, user_id, work_date, check_in, in_lat, in_lng, in_dist)
  values (v_clinic, auth.uid(), v_date, now(), p_lat, p_lng, round(v_dist))
  on conflict (user_id, work_date) do update
    set check_in = now(), in_lat = excluded.in_lat, in_lng = excluded.in_lng, in_dist = excluded.in_dist
    where attendance.check_in is null;
  return 'checked_in';
end $$;

create or replace function attendance_check_out(p_lat double precision, p_lng double precision, p_acc double precision default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  c clinics%rowtype; v_clinic uuid; v_dist double precision; v_date date;
  v_row attendance%rowtype; v_worked int; v_ot int := 0; v_ot_on boolean;
begin
  v_clinic := my_clinic_id();
  if v_clinic is null or coalesce(my_role()::text, '') = 'executive' then raise exception 'Not allowed'; end if;
  select * into c from clinics where id = v_clinic;
  if c.lat is null or c.lng is null then raise exception 'Admin ne abhi clinic ki location set nahi ki (Settings)'; end if;
  if p_lat is null or p_lng is null then raise exception 'Location nahi mili'; end if;
  if p_acc is not null and p_acc > 300 then raise exception 'GPS accuracy kam hai (% m). Khuli jagah ja kar dobara try karein', round(p_acc); end if;
  v_dist := _dist_m(c.lat, c.lng, p_lat, p_lng);
  if v_dist > c.radius_m then
    raise exception 'Aap clinic ke andar nahi hain (% m door). Check-out mark nahi hua', round(v_dist);
  end if;
  v_date := (now() at time zone c.timezone)::date;
  select * into v_row from attendance where user_id = auth.uid() and work_date = v_date;
  if not found or v_row.check_in is null then raise exception 'Aaj check-in nahi hui'; end if;
  if v_row.check_out is not null then return 'already'; end if;

  v_worked := greatest(0, floor(extract(epoch from (now() - v_row.check_in)) / 60)::int);
  select coalesce(bool_or(e.overtime_enabled), false) into v_ot_on
    from employees e where e.user_id = auth.uid() and e.clinic_id = v_clinic and e.is_active;
  if v_ot_on then v_ot := greatest(0, v_worked - c.std_work_minutes); end if;

  update attendance
     set check_out = now(), out_lat = p_lat, out_lng = p_lng, out_dist = round(v_dist),
         worked_minutes = v_worked, overtime_minutes = v_ot
   where id = v_row.id;
  return 'checked_out';
end $$;

-- ---------- Payroll ----------
create or replace function payroll_for_month(p_month date)
returns table(employee_id uuid, full_name text, role text, base_salary numeric, overtime_enabled boolean,
              days_present int, worked_minutes int, overtime_minutes int, overtime_amount numeric,
              total numeric, paid boolean, paid_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare c clinics%rowtype; m0 date; m1 date;
begin
  if coalesce(my_role()::text, '') <> 'admin' or my_clinic_id() is null then raise exception 'Not allowed'; end if;
  select * into c from clinics where id = my_clinic_id();
  m0 := date_trunc('month', p_month)::date;
  m1 := (m0 + interval '1 month')::date;
  return query
  with agg as (
    select e.id as eid, e.full_name as ename, e.role::text as erole,
           coalesce(e.salary, 0) as sal, e.overtime_enabled as ot_on,
           (count(a.id) filter (where a.check_in is not null))::int as days,
           coalesce(sum(a.worked_minutes), 0)::int as worked,
           coalesce(sum(a.overtime_minutes), 0)::int as ot_min
      from employees e
      left join attendance a on a.user_id = e.user_id and a.clinic_id = e.clinic_id
                            and a.work_date >= m0 and a.work_date < m1
     where e.clinic_id = c.id and e.is_active
     group by e.id
  )
  select g.eid, g.ename, g.erole, g.sal, g.ot_on, g.days, g.worked, g.ot_min,
         round(g.ot_min / 60.0 * (g.sal / 30.0 / (c.std_work_minutes / 60.0)) * c.overtime_multiplier, 0),
         g.sal + round(g.ot_min / 60.0 * (g.sal / 30.0 / (c.std_work_minutes / 60.0)) * c.overtime_multiplier, 0),
         (pp.id is not null), pp.paid_at
    from agg g
    left join payroll_payments pp on pp.employee_id = g.eid and pp.month = m0
   order by g.ename;
end $$;

create or replace function pay_salary(p_employee uuid, p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare r record; m0 date;
begin
  if coalesce(my_role()::text, '') <> 'admin' or my_clinic_id() is null then raise exception 'Not allowed'; end if;
  m0 := date_trunc('month', p_month)::date;
  select * into r from payroll_for_month(m0) x where x.employee_id = p_employee;
  if not found then raise exception 'Employee nahi mila'; end if;
  if r.paid then raise exception 'Is mahine ki salary pehle se paid hai'; end if;
  insert into payroll_payments(clinic_id, employee_id, month, base, overtime, total, days_present, overtime_minutes, paid_by)
  values (my_clinic_id(), p_employee, m0, r.base_salary, r.overtime_amount, r.total, r.days_present, r.overtime_minutes, auth.uid());
end $$;

-- ---------- Admin settings ----------
create or replace function update_clinic_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_days int[];
begin
  if coalesce(my_role()::text, '') <> 'admin' or my_clinic_id() is null then raise exception 'Not allowed'; end if;
  if p ? 'working_days' then
    select array_agg(x::int order by x::int) into v_days from jsonb_array_elements_text(p -> 'working_days') x;
    if v_days is null or array_length(v_days, 1) = 0 then raise exception 'Kam az kam ek working day chunein'; end if;
  end if;
  update clinics set
    open_time            = case when p ? 'open_time' then (p ->> 'open_time')::time else open_time end,
    close_time           = case when p ? 'close_time' then (p ->> 'close_time')::time else close_time end,
    working_days         = coalesce(v_days, working_days),
    slot_minutes         = case when p ? 'slot_minutes' then (p ->> 'slot_minutes')::int else slot_minutes end,
    noshow_grace_minutes = case when p ? 'noshow_grace_minutes' then (p ->> 'noshow_grace_minutes')::int else noshow_grace_minutes end,
    reminder_minutes     = case when p ? 'reminder_minutes' then (p ->> 'reminder_minutes')::int else reminder_minutes end,
    followup_minutes     = case when p ? 'followup_minutes' then (p ->> 'followup_minutes')::int else followup_minutes end,
    followup_fee         = case when p ? 'followup_fee' then (p ->> 'followup_fee')::numeric else followup_fee end,
    lat                  = case when p ? 'lat' then (p ->> 'lat')::double precision else lat end,
    lng                  = case when p ? 'lng' then (p ->> 'lng')::double precision else lng end,
    radius_m             = case when p ? 'radius_m' then (p ->> 'radius_m')::int else radius_m end,
    std_work_minutes     = case when p ? 'std_work_minutes' then (p ->> 'std_work_minutes')::int else std_work_minutes end,
    overtime_multiplier  = case when p ? 'overtime_multiplier' then (p ->> 'overtime_multiplier')::numeric else overtime_multiplier end,
    country_code         = case when p ? 'country_code' then regexp_replace(p ->> 'country_code', '\D', '', 'g') else country_code end,
    timezone             = case when p ? 'timezone' then p ->> 'timezone' else timezone end
  where id = my_clinic_id();
  if exists (select 1 from clinics where id = my_clinic_id() and (open_time >= close_time or slot_minutes < 5 or slot_minutes > 240
                or followup_minutes < 5 or noshow_grace_minutes < 0 or radius_m < 20 or std_work_minutes < 60)) then
    raise exception 'Settings ki values sahi nahi hain';
  end if;
end $$;

-- ---------- TEST MODE (sirf testing ke liye; live se pehle 99_remove_test_data.sql) ----------
create or replace function dev_list_clinics() returns table(id uuid, name text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_dev) then raise exception 'Not allowed'; end if;
  return query select c.id, c.name, c.status::text from clinics c where c.is_test order by c.created_at;
end $$;

create or replace function dev_switch_clinic(p_clinic uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_p profiles%rowtype;
begin
  select * into v_p from profiles where id = auth.uid() and is_dev;
  if not found then raise exception 'Not allowed'; end if;
  if not exists (select 1 from clinics where id = p_clinic and is_test) then
    raise exception 'Sirf TEST clinics select ho sakti hain (Executive me clinic ko "Mark as test" karein)';
  end if;
  update profiles set clinic_id = p_clinic where id = v_p.id;
  if v_p.role <> 'admin' and not exists (select 1 from employees where user_id = v_p.id and clinic_id = p_clinic) then
    insert into employees(clinic_id, full_name, email, role, salary, overtime_enabled, user_id)
    values (p_clinic, v_p.full_name, 'dev+' || v_p.role::text || '+' || p_clinic::text || '@dentcare.test',
            v_p.role, 30000, v_p.role in ('helper','lab_technician'), v_p.id);
  end if;
end $$;

-- ---------- Permissions ----------
do $$
declare r record;
begin
  -- internal functions sirf database ke andar chalein
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  -- RPC functions bina login ke nahi chalenge
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (array[
              'list_doctors','available_slots','next_available','book_appointment','book_followup','receive_payment',
              'finish_consult','lab_mark_ready','process_appointments','attendance_check_in','attendance_check_out',
              'payroll_for_month','pay_salary','update_clinic_settings','dev_list_clinics','dev_switch_clinic',
              'my_employee_id']) loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- ---------- Har minute auto-cancel / reminders chalane ke liye (pg_cron) ----------
-- Pehle Supabase: Database -> Extensions -> "pg_cron" enable karein. Phir ye file chalayein.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('dentcare-process', '* * * * *', 'select public.process_appointments()');
exception when others then
  raise notice 'pg_cron setup nahi hua (%). App khuli ho to wo har minute khud process chalati hai.', sqlerrm;
end $$;

notify pgrst, 'reload schema';
