-- ═══════════════════════════════════════════════════════════════════
-- 032 · Time-off type + approval-triggered class notifications
-- ───────────────────────────────────────────────────────────────────
-- Two columns on time_off_requests:
--
--   • type           — Vacation | Sick | Personal. REQUIRED on new
--     submissions; existing rows are backfilled to 'personal'. The
--     type is private to the administrator — student notifications
--     never mention it (privacy spec).
--   • notifications_sent_at — set by the API route after the student
--     notification fan-out succeeds. Used to make re-processing the
--     same approval a no-op so repeated clicks don't duplicate
--     notification rows.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Type ────────────────────────────────────────────────────────
ALTER TABLE public.time_off_requests
  ADD COLUMN IF NOT EXISTS type TEXT;

-- Backfill once before tightening to NOT NULL. Defaults to 'personal'
-- so historic rows don't fail the new CHECK constraint.
UPDATE public.time_off_requests SET type = 'personal' WHERE type IS NULL;

ALTER TABLE public.time_off_requests
  ALTER COLUMN type SET DEFAULT 'personal',
  ALTER COLUMN type SET NOT NULL;

-- Drop the constraint if it already exists from a prior run, then add.
ALTER TABLE public.time_off_requests
  DROP CONSTRAINT IF EXISTS time_off_type_check;
ALTER TABLE public.time_off_requests
  ADD CONSTRAINT time_off_type_check
  CHECK (type IN ('vacation', 'sick', 'personal'));

COMMENT ON COLUMN public.time_off_requests.type IS
  'vacation | sick | personal. Visible to the admin reviewing the
   request. PRIVATE — student / parent notifications never include
   the type.';


-- ─── Idempotency timestamp ───────────────────────────────────────
ALTER TABLE public.time_off_requests
  ADD COLUMN IF NOT EXISTS notifications_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.time_off_requests.notifications_sent_at IS
  'Set by the /api/timeoff/notify-students route after the approval
   fan-out succeeds. When non-null, re-running the route is a no-op
   so accidental re-approvals do not duplicate notification rows.';

-- Index admins use to find approved-but-not-yet-notified requests
-- (handy for any future "resync notifications" admin button).
CREATE INDEX IF NOT EXISTS idx_time_off_pending_notify
  ON public.time_off_requests(school_id)
  WHERE status = 'approved' AND notifications_sent_at IS NULL;
