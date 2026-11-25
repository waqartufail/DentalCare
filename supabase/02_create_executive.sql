-- =====================================================================
-- Pehla Executive user banana
-- Step 1: Supabase Dashboard -> Authentication -> Users -> "Add user"
--         (Create new user) -> email + password dein, "Auto Confirm User" ON rakhein.
-- Step 2: Neeche apni email likh kar RUN karein.
-- =====================================================================
insert into profiles(id, full_name, role)
select id, 'Executive', 'executive'
from auth.users
where email = 'YOUR_EMAIL_HERE'
on conflict (id) do update set role = 'executive';
