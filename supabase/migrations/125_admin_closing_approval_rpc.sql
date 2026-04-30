-- ============================================================
-- Migration 125: Admin closing approval / reopen RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_approve_representative_day_closing(
  p_closing_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_closing RECORD;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  SELECT *
    INTO v_closing
    FROM public.representative_day_closings
   WHERE id = p_closing_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento nao encontrado.';
  END IF;

  IF v_closing.status NOT IN ('submitted', 'reopened') THEN
    RAISE EXCEPTION 'Apenas fechamentos enviados ou reabertos podem ser aprovados. Status atual: %.', v_closing.status;
  END IF;

  UPDATE public.representative_day_closings
     SET status = 'approved',
         approved_by = v_auth_user,
         approved_at = NOW(),
         updated_at = NOW()
   WHERE id = p_closing_id;

  RETURN p_closing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reopen_representative_day_closing(
  p_closing_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_closing RECORD;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  SELECT *
    INTO v_closing
    FROM public.representative_day_closings
   WHERE id = p_closing_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento nao encontrado.';
  END IF;

  IF v_closing.status NOT IN ('submitted', 'approved') THEN
    RAISE EXCEPTION 'Apenas fechamentos enviados ou aprovados podem ser reabertos. Status atual: %.', v_closing.status;
  END IF;

  UPDATE public.representative_day_closings
     SET status = 'reopened',
         approved_by = NULL,
         approved_at = NULL,
         updated_at = NOW()
   WHERE id = p_closing_id;

  RETURN p_closing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_representative_day_closing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_representative_day_closing(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reopen_representative_day_closing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reopen_representative_day_closing(UUID) TO authenticated, service_role;
