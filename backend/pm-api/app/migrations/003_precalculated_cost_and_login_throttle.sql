-- 003: expected hours and cost are stored on each assignment; sign-in failures are counted.
--
--   * An assignment now keeps the person's hourly rate as it was when the work was planned (hourly_rate),
--     and the hours and cost the whole range will take (expected_hours, expected_cost). The database computes
--     them with a trigger whenever the dates or the rate change, so no code path can forget, and a later raise
--     no longer reprices work that was already planned (raises are applied to assignments that have not started).
--   * Hours and cost "so far" still depend on today's date, so they stay calculated, but now use the stored rate.
--   * users counts failed sign-ins and can be locked for a while.

ALTER TABLE milestone_assignments ADD COLUMN IF NOT EXISTS hourly_rate     numeric(10,2);
ALTER TABLE milestone_assignments ADD COLUMN IF NOT EXISTS expected_hours  numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE milestone_assignments ADD COLUMN IF NOT EXISTS expected_cost   numeric(14,2) NOT NULL DEFAULT 0;

-- Existing assignments take their person's current rate as the planned rate.
UPDATE milestone_assignments a SET hourly_rate = u.salary FROM users u WHERE u.id = a.user_id AND a.hourly_rate IS NULL;
ALTER TABLE milestone_assignments ALTER COLUMN hourly_rate SET NOT NULL;
ALTER TABLE milestone_assignments ADD CONSTRAINT milestone_assignments_hourly_rate_check CHECK (hourly_rate >= 0);

-- 8 is core.dates.DAILY_HOURS (a test keeps them in step).
CREATE OR REPLACE FUNCTION assignment_precalculate() RETURNS trigger AS $$
BEGIN
    IF NEW.hourly_rate IS NULL THEN
        SELECT salary INTO NEW.hourly_rate FROM users WHERE id = NEW.user_id;
    END IF;
    NEW.expected_hours := working_days(NEW.start_date, NEW.end_date) * 8;
    NEW.expected_cost  := NEW.expected_hours * NEW.hourly_rate;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_assignments_precalculate ON milestone_assignments;
CREATE TRIGGER milestone_assignments_precalculate
    BEFORE INSERT OR UPDATE OF start_date, end_date, hourly_rate ON milestone_assignments
    FOR EACH ROW EXECUTE FUNCTION assignment_precalculate();

-- Fire the trigger once for the rows that already exist.
UPDATE milestone_assignments SET hourly_rate = hourly_rate;

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until  timestamptz;
