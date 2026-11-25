-- =====================================================================
-- TESTING KHATAM hone ke baad: sirf TEST data delete karta hai.
-- Executive screen me jo clinics "Test" mark hain (is_test = true):
--   unki payments, treatments, employees, expenses aur unke login users sab delete.
-- Plans (fee structure) aur Executive user safe rehte hain.
-- =====================================================================

-- 1) Test clinics ke users (admin + staff) ke login accounts
delete from auth.users
 where id in (select id from profiles
               where clinic_id in (select id from clinics where is_test = true)
                 and role <> 'executive');

-- 2) Test clinics (payments, treatments, employees, expenses cascade se delete)
delete from clinics where is_test = true;

-- Note: jin logon ne sirf sign up kiya aur clinic register nahi ki, unhe
-- Supabase -> Authentication -> Users se manually delete karein.

-- SAB KUCH reset karna ho (executive aur plans ko chhor kar):
-- delete from auth.users where id in (select id from profiles where role <> 'executive');
-- delete from clinics;
