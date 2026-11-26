-- =====================================================================
-- PHASE 3 / Step 1 : "helper" role add karna
-- Ye file ALAG se (akeli) RUN karein. Phir 05_clinic_ops.sql chalayein.
-- =====================================================================
alter type user_role add value if not exists 'helper';
