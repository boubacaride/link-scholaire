-- ═══════════════════════════════════════════════════════════════════
-- 037 · Messages: hard-delete at end of term for student↔teacher /
--                 student↔admin conversations
-- ───────────────────────────────────────────────────────────────────
-- Spec (user request, June 2026):
--   * Direct messages between students and teachers, and between
--     students and school admins, must be retained until the end of
--     the current school term and then HARD-DELETED.
--   * Other conversations (parent↔teacher, teacher↔teacher, etc.)
--     keep the original "retained forever" behaviour.
--
-- Implementation:
--   1. New column messages.expires_at (NULL = retained forever).
--   2. BEFORE INSERT trigger stamps the column for retained pairs
--      using _current_term_end_for_school(school_id) — the end_date
--      of the term covering today (or the next-upcoming / last
--      finished one if no term covers today).
--   3. Backfill: existing rows for retained pairs get the same stamp
--      so the purge job applies uniformly.
--   4. purge_expired_messages() — SECURITY DEFINER function that
--      deletes anything past expiry. Wired to pg_cron (daily at
--      02:15 UTC) when the extension exists; otherwise admins can
--      run it manually from the messaging page.
-- ═══════════════════════════════════════════════════════════════════


-- ─── Column + index ──────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.messages.expires_at IS
  'Hard-delete deadline for this message. NULL = retain forever.
   Stamped by trg_messages_set_expiry for student<->teacher and
   student<->school_admin pairs, based on the school current term
   end_date. purge_expired_messages() removes any row past expiry.';

-- Partial index so the daily purge can scan only expirable rows.
CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON public.messages(expires_at) WHERE expires_at IS NOT NULL;


-- ─── Helper: end of "current" term for a school ──────────────────
-- Returns the term end_date (as the LAST microsecond of that day in
-- the session TZ) that we should use as the deletion deadline.
--   * If today falls inside a term → that term's end_date.
--   * Otherwise, the SOONEST upcoming term.
--   * Otherwise, the MOST RECENT past term (so messages from a school
--     whose admin hasn't configured the next term still get purged at
--     the previous term boundary).
--   * No terms configured → NULL (column stays NULL → never purged).
CREATE OR REPLACE FUNCTION public._current_term_end_for_school(p_school UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT t.end_date,
           CASE
             WHEN CURRENT_DATE BETWEEN t.start_date AND t.end_date THEN 0
             WHEN t.start_date > CURRENT_DATE                       THEN 1
             ELSE                                                        2
           END                          AS bucket,
           ABS(CURRENT_DATE - t.start_date) AS dist
      FROM public.terms          t
      JOIN public.academic_years ay ON ay.id = t.academic_year_id
     WHERE ay.school_id = p_school
  )
  SELECT (end_date + INTERVAL '1 day' - INTERVAL '1 microsecond')::TIMESTAMPTZ
    FROM ranked
   ORDER BY bucket, dist
   LIMIT 1;
$$;


-- ─── Helper: is this conversation pair subject to retention? ─────
CREATE OR REPLACE FUNCTION public._messages_pair_is_retained(p_sender UUID, p_recipient UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH roles AS (
    SELECT id, role::text AS r
      FROM public.profiles
     WHERE id IN (p_sender, p_recipient)
  )
  SELECT EXISTS (
    SELECT 1
      FROM roles s, roles r
     WHERE s.id = p_sender
       AND r.id = p_recipient
       AND (
         (s.r = 'student'                AND r.r IN ('teacher','school_admin'))
         OR
         (r.r = 'student'                AND s.r IN ('teacher','school_admin'))
       )
  );
$$;


-- ─── Trigger: stamp expires_at on insert ─────────────────────────
CREATE OR REPLACE FUNCTION public.messages_set_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Respect an explicit override (e.g. admin extends retention).
  IF NEW.expires_at IS NULL
     AND public._messages_pair_is_retained(NEW.sender_id, NEW.recipient_id)
  THEN
    NEW.expires_at := public._current_term_end_for_school(NEW.school_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_set_expiry ON public.messages;
CREATE TRIGGER trg_messages_set_expiry
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_set_expiry();


-- ─── Backfill existing rows ──────────────────────────────────────
UPDATE public.messages m
   SET expires_at = public._current_term_end_for_school(m.school_id)
 WHERE m.expires_at IS NULL
   AND public._messages_pair_is_retained(m.sender_id, m.recipient_id);


-- ─── Manual / cron purge ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH del AS (
    DELETE FROM public.messages
     WHERE expires_at IS NOT NULL
       AND expires_at < NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM del;
  RETURN v_count;
END;
$$;

-- Anyone authenticated can call it; the only side effect is on rows
-- that are already past their advertised deletion deadline.
GRANT EXECUTE ON FUNCTION public.purge_expired_messages() TO authenticated;


-- ─── Schedule via pg_cron if available ───────────────────────────
-- Most Supabase projects ship pg_cron; older ones don't, so wrap the
-- schedule call in a guard. Idempotent: unschedules an existing job
-- of the same name before scheduling.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'messages_daily_purge') THEN
      PERFORM cron.unschedule('messages_daily_purge');
    END IF;
    PERFORM cron.schedule(
      'messages_daily_purge',
      '15 2 * * *',
      'SELECT public.purge_expired_messages();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the migration if cron is disabled or the project lacks
  -- the privilege to schedule jobs; the admin can still purge manually.
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END$$;
