-- ═══════════════════════════════════════════════════════════════════
-- 048 · Public payslip share + sign link (token-based, no login)
-- ───────────────────────────────────────────────────────────────────
-- Sharing a payslip over WhatsApp / email must let the employee actually
-- SEE the payslip and SIGN it back — even if they are not logged in. We
-- give each payslip an unguessable share_token and expose two
-- SECURITY DEFINER RPCs (granted to anon) so a tokenised public page can:
--   • get_payslip_share(token)            → read the payslip to display it
--   • acknowledge_payslip_by_token(token) → submit the employee signature
-- The token IS the credential (like a DocuSign link); it only ever exposes
-- the single payslip it belongs to.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT uuid_generate_v4();

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_share_token
  ON public.payslips(share_token);

-- Read one payslip (with the employee + school details needed to render it)
-- by its share token. No auth required — the token gates access.
CREATE OR REPLACE FUNCTION public.get_payslip_share(p_token UUID)
RETURNS TABLE (
  id                  UUID,
  pay_period          TEXT,
  net_amount          NUMERIC,
  status              TEXT,
  admin_signature     TEXT,
  employee_signature  TEXT,
  employee_signed_at  TIMESTAMPTZ,
  employee_name       TEXT,
  role                TEXT,
  school_name         TEXT,
  school_address      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.id,
    ps.pay_period,
    ps.net_amount,
    ps.status,
    ps.admin_signature,
    ps.employee_signature,
    ps.employee_signed_at,
    TRIM(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')),
    COALESCE(NULLIF(pr.job_title, ''), INITCAP(pr.role)),
    s.name,
    NULLIF(CONCAT_WS(', ', s.address, s.city, s.state, s.country), '')
  FROM public.payslips ps
  JOIN public.profiles pr ON pr.id = ps.employee_id
  JOIN public.schools   s  ON s.id  = ps.school_id
  WHERE ps.share_token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.get_payslip_share(UUID) TO anon, authenticated;

-- Submit the employee signature via the share token (no login). Only an
-- issued payslip can be acknowledged, and only once.
CREATE OR REPLACE FUNCTION public.acknowledge_payslip_by_token(
  p_token     UUID,
  p_signature TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payslips
     SET employee_signature = p_signature,
         employee_signed_at = NOW(),
         status = 'acknowledged',
         updated_at = NOW()
   WHERE share_token = p_token
     AND status = 'issued';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payslip not found or already acknowledged';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.acknowledge_payslip_by_token(UUID, TEXT) TO anon, authenticated;
