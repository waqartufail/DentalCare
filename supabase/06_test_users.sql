-- =====================================================================
-- TEST USERS (sirf testing ke liye) | 04 aur 05 ke baad RUN karein
--
-- Ye 5 fixed users banata hai (password sab ka same: Test@12345):
--   admin.test@dentcare.test         (Admin)
--   doctor.test@dentcare.test        (Doctor)
--   receptionist.test@dentcare.test  (Receptionist)
--   lab.test@dentcare.test           (Lab Technician)
--   helper.test@dentcare.test        (Helper)
-- Aur ek "DentCare Test Clinic" (test data) + kuch sample treatments.
--
-- App me login screen par "Test login" buttons aate hain (.env me VITE_TEST_LOGIN=true),
-- aur login ke baad upar ek bar se kisi bhi TEST clinic me switch kar sakte hain.
--
-- Agar auth.users insert par error aaye: Authentication -> Users -> Add user se
-- upar wali 5 emails (Auto Confirm ON, password Test@12345) khud bana lein,
-- phir ye file dobara chalayein (wo baqi kaam kar degi).
-- =====================================================================
do $$
declare
  v_clinic uuid;
  v_uid uuid;
  v_pw text := 'Test@12345';
  r record;
begin
  select id into v_clinic from clinics where name = 'DentCare Test Clinic' and is_test limit 1;
  if v_clinic is null then
    insert into clinics(name, owner_name, email, phone, city, status, is_lifetime, is_test, approved_at)
    values ('DentCare Test Clinic', 'Test Owner', 'owner@dentcare.test', '03000000000', 'Lahore', 'active', true, true, now())
    returning id into v_clinic;
  end if;

  for r in select * from (values
      ('admin.test@dentcare.test',        'Test Admin',        'admin'),
      ('doctor.test@dentcare.test',       'Dr. Test',          'doctor'),
      ('receptionist.test@dentcare.test', 'Test Receptionist', 'receptionist'),
      ('lab.test@dentcare.test',          'Test Lab Tech',     'lab_technician'),
      ('helper.test@dentcare.test',       'Test Helper',       'helper')
    ) as t(email, full_name, role)
  loop
    select id into v_uid from auth.users where email = r.email;
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token)
      values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', r.email,
        crypt(v_pw, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_uid, v_uid::text,
              jsonb_build_object('sub', v_uid::text, 'email', r.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;

    insert into profiles(id, full_name, role, clinic_id, is_dev)
    values (v_uid, r.full_name, r.role::user_role, v_clinic, true)
    on conflict (id) do update
      set full_name = excluded.full_name, role = excluded.role, clinic_id = excluded.clinic_id, is_dev = true;

    if r.role <> 'admin' and not exists (select 1 from employees where user_id = v_uid and clinic_id = v_clinic) then
      insert into employees(clinic_id, full_name, email, role, salary, overtime_enabled, user_id, joining_date)
      values (v_clinic, r.full_name, 'dev+' || r.role || '+' || v_clinic::text || '@dentcare.test',
              r.role::user_role,
              case r.role when 'doctor' then 150000 when 'helper' then 25000 else 40000 end,
              r.role in ('helper', 'lab_technician'), v_uid, current_date);
    end if;
  end loop;

  if not exists (select 1 from treatments where clinic_id = v_clinic) then
    insert into treatments(clinic_id, name, fee, needs_lab) values
      (v_clinic, 'Consultation',              1000, false),
      (v_clinic, 'Scaling & Polishing',       3000, false),
      (v_clinic, 'Filling',                   5000, false),
      (v_clinic, 'Root Canal',               15000, false),
      (v_clinic, 'Extraction',                2500, false),
      (v_clinic, 'Braces',                   80000, true),
      (v_clinic, 'Artificial Teeth (Denture)', 40000, true),
      (v_clinic, 'Crown / Cap',              20000, true);
  end if;
end $$;
