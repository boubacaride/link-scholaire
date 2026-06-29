-- ═══════════════════════════════════════════════════════════════════
-- 046 · Payslips with electronic signatures
-- ───────────────────────────────────────────────────────────────────
-- One signable payslip per (employee, pay period). The admin signs and
-- issues it; the employee reviews and signs to acknowledge the pay. When
-- the employee has signed, status = 'acknowledged' (the green tick).
--
-- Signatures are stored as PNG data URLs (drawn on a canvas).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payslips (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_period          TEXT NOT NULL,                 -- "YYYY-MM"
  net_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  admin_signature     TEXT,                          -- PNG data URL
  admin_signed_at     TIMESTAMPTZ,
  admin_signed_by     UUID REFERENCES public.profiles(id),
  employee_signature  TEXT,                          -- PNG data URL
  employee_signed_at  TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'issued'
                        CHECK (status IN ('issued', 'acknowledged')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, pay_period)
);
CREATE INDEX IF NOT EXISTS idx_payslips_school ON public.payslips(school_id, pay_period);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON public.payslips(employee_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- Read: admins of the school, and the employee on the payslip.
DROP POLICY IF EXISTS "Read own or school payslips" ON public.payslips;
CREATE POLICY "Read own or school payslips" ON public.payslips
  FOR SELECT USING (
    employee_id = public.auth_profile_id()
    OR (public.is_admin() AND school_id = public.auth_school_id())
  );

-- Write: admins of the school (issue / re-sign / delete).
DROP POLICY IF EXISTS "Admins write payslips" ON public.payslips;
CREATE POLICY "Admins write payslips" ON public.payslips
  FOR ALL USING (public.is_admin() AND school_id = public.auth_school_id())
  WITH CHECK (public.is_admin() AND school_id = public.auth_school_id());

-- Employee acknowledgement goes through a SECURITY DEFINER RPC so the
-- employee can sign their own payslip without a broad UPDATE grant (and
-- cannot touch the admin's signature or anyone else's row).
CREATE OR REPLACE FUNCTION public.acknowledge_payslip(
  p_payslip_id UUID,
  p_signature  TEXT
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
   WHERE id = p_payslip_id
     AND employee_id = public.auth_profile_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payslip not found or not yours';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.acknowledge_payslip(UUID, TEXT) TO authenticated;
