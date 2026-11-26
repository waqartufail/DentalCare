-- =====================================================================
-- TESTING KHATAM hone ke baad: sirf TEST data delete karta hai.
--   * 06_test_users.sql wale 5 test users
--   * jo clinics "Test" mark hain (is_test = true) aur unka sab data
--     (patients, appointments, payments, lab, attendance, payroll, treatments, employees, expenses)
--   * un test clinics ke login users
-- Plans (fee structure) aur Executive user safe rehte hain.
-- =====================================================================

-- 1) test users ke login accounts (profiles khud cascade se hat jate hain)
delete from auth.users
 where id in (select id from profiles where is_dev)
    or email like '%@dentcare.test';

-- 2) test clinics ke baqi users (admin + staff)
delete from auth.users
 where id in (select id from profiles
               where clinic_id in (select id from clinics where is_test = true)
                 and role <> 'executive');

-- 3) test clinics aur unka sab data (cascade)
delete from clinics where is_test = true;

-- Note: jin logon ne sirf sign up kiya aur clinic register nahi ki, unhe
-- Supabase -> Authentication -> Users se manually delete karein.

-- SAB KUCH reset karna ho (executive aur plans ko chhor kar):
-- delete from auth.users where id in (select id from profiles where role <> 'executive');
-- delete from clinics;
