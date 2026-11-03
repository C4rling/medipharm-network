-- 016_link_clinic_to_branch.sql
-- Each clinic is served by one pharmacy branch. A prescription written at a clinic
-- is filled at that clinic's branch.

ALTER TABLE clinic
    ADD COLUMN IF NOT EXISTS branch_id INT REFERENCES pharmacy_branches (branch_id);

-- Pair each clinic with its branch.
UPDATE clinic
   SET branch_id = (SELECT branch_id FROM pharmacy_branches WHERE name = 'MediPharm Quezon City')
 WHERE name = 'MediPharm Clinic QC';

-- Check: every clinic should now show a branch.
SELECT c.clinic_id, c.name AS clinic, b.name AS branch
  FROM clinic c
  LEFT JOIN pharmacy_branches b ON b.branch_id = c.branch_id
 ORDER BY c.clinic_id;