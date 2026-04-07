-- Migration 074: fix ambiguous table_type reference in fiscal version activation RPC

CREATE OR REPLACE FUNCTION public.admin_activate_fiscal_reference_version(
    p_version_id UUID
)
RETURNS TABLE (
    version_id UUID,
    table_type TEXT,
    is_active BOOLEAN,
    deactivated_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_target public.fiscal_reference_versions%ROWTYPE;
    v_deactivated_count INTEGER := 0;
BEGIN
    SELECT *
      INTO v_target
      FROM public.fiscal_reference_versions frv
     WHERE frv.id = p_version_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal reference version % not found', p_version_id;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('fiscal_reference_versions:' || v_target.table_type));

    UPDATE public.fiscal_reference_versions AS frv
       SET is_active = false,
           valid_to = COALESCE(frv.valid_to, CURRENT_DATE),
           updated_at = NOW()
     WHERE frv.table_type = v_target.table_type
       AND frv.is_active = true
       AND frv.id <> p_version_id;

    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

    UPDATE public.fiscal_reference_versions AS frv
       SET is_active = true,
           valid_from = COALESCE(frv.valid_from, CURRENT_DATE),
           valid_to = NULL,
           activated_at = NOW(),
           activated_by = v_actor,
           updated_at = NOW()
     WHERE frv.id = p_version_id;

    RETURN QUERY
    SELECT
        v_target.id,
        v_target.table_type,
        true,
        v_deactivated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_fiscal_reference_version(UUID)
TO authenticated, service_role;
