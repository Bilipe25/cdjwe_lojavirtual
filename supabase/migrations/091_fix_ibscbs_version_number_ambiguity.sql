CREATE OR REPLACE FUNCTION public.admin_upsert_fiscal_ibscbs_base_version(
    p_ibscbs_base_id UUID DEFAULT NULL,
    p_ibscbs_version_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_base_is_active BOOLEAN DEFAULT true,
    p_version_label TEXT DEFAULT NULL,
    p_valid_from DATE DEFAULT NULL,
    p_valid_to DATE DEFAULT NULL,
    p_cst_catalog_version_id UUID DEFAULT NULL,
    p_classification_catalog_version_id UUID DEFAULT NULL,
    p_national_rule JSONB DEFAULT '{}'::JSONB,
    p_state_rules JSONB DEFAULT '[]'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    ibscbs_base_id UUID,
    ibscbs_version_id UUID,
    created_base BOOLEAN,
    created_version BOOLEAN,
    version_number INTEGER,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_created_base BOOLEAN := false;
    v_created_version BOOLEAN := false;
    v_base_id UUID;
    v_version_id UUID;
    v_version_number INTEGER;
    v_rule_item JSONB;
    v_target_uf TEXT;
    v_rule_cst_code TEXT;
    v_rule_classification_code TEXT;
    v_cst_catalog_version_id UUID;
    v_classification_catalog_version_id UUID;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_code is required';
    END IF;

    IF p_national_rule IS NULL OR jsonb_typeof(p_national_rule) <> 'object' THEN
        RAISE EXCEPTION 'p_national_rule must be a JSON object';
    END IF;

    IF p_state_rules IS NULL OR jsonb_typeof(p_state_rules) <> 'array' THEN
        RAISE EXCEPTION 'p_state_rules must be a JSON array';
    END IF;

    IF p_metadata_jsonb IS NULL OR jsonb_typeof(p_metadata_jsonb) <> 'object' THEN
        RAISE EXCEPTION 'p_metadata_jsonb must be a JSON object';
    END IF;

    IF p_future_tax_payload IS NULL OR jsonb_typeof(p_future_tax_payload) <> 'object' THEN
        RAISE EXCEPTION 'p_future_tax_payload must be a JSON object';
    END IF;

    IF p_valid_to IS NOT NULL AND p_valid_from IS NOT NULL AND p_valid_to < p_valid_from THEN
        RAISE EXCEPTION 'valid_to must be greater than or equal to valid_from';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
                SELECT UPPER(TRIM(COALESCE(value ->> 'target_uf', ''))) AS target_uf
                  FROM jsonb_array_elements(p_state_rules)
          ) duplicated
         WHERE duplicated.target_uf <> ''
         GROUP BY duplicated.target_uf
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'State rules cannot repeat the same UF';
    END IF;

    IF p_ibscbs_base_id IS NULL THEN
        INSERT INTO public.fiscal_ibscbs_bases AS base (
            name,
            code,
            description,
            is_active,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            TRIM(p_name),
            UPPER(TRIM(p_code)),
            NULLIF(TRIM(COALESCE(p_description, '')), ''),
            COALESCE(p_base_is_active, true),
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        RETURNING base.id INTO v_base_id;

        v_created_base := true;
    ELSE
        UPDATE public.fiscal_ibscbs_bases base
           SET name = TRIM(p_name),
               code = UPPER(TRIM(p_code)),
               description = NULLIF(TRIM(COALESCE(p_description, '')), ''),
               is_active = COALESCE(p_base_is_active, true),
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               updated_by = v_actor
         WHERE base.id = p_ibscbs_base_id
         RETURNING base.id INTO v_base_id;

        IF v_base_id IS NULL THEN
            RAISE EXCEPTION 'IBS/CBS base % not found', p_ibscbs_base_id;
        END IF;
    END IF;

    v_cst_catalog_version_id := p_cst_catalog_version_id;
    IF v_cst_catalog_version_id IS NULL THEN
        SELECT version_row.id
          INTO v_cst_catalog_version_id
          FROM public.fiscal_ibscbs_cst_catalog_versions version_row
         WHERE version_row.is_active = true
         ORDER BY version_row.valid_from DESC NULLS LAST, version_row.created_at DESC
         LIMIT 1;
    END IF;

    v_classification_catalog_version_id := p_classification_catalog_version_id;
    IF v_classification_catalog_version_id IS NULL THEN
        SELECT version_row.id
          INTO v_classification_catalog_version_id
          FROM public.fiscal_ibscbs_classification_versions version_row
         WHERE version_row.is_active = true
         ORDER BY version_row.valid_from DESC NULLS LAST, version_row.created_at DESC
         LIMIT 1;
    END IF;

    IF v_cst_catalog_version_id IS NULL THEN
        RAISE EXCEPTION 'No active IBS/CBS CST catalog version found';
    END IF;

    IF v_classification_catalog_version_id IS NULL THEN
        RAISE EXCEPTION 'No active IBS/CBS classification catalog version found';
    END IF;

    IF p_ibscbs_version_id IS NULL THEN
        SELECT version_row.id
          INTO v_version_id
          FROM public.fiscal_ibscbs_base_versions version_row
         WHERE version_row.ibscbs_base_id = v_base_id
           AND version_row.status = 'draft'
         ORDER BY version_row.version_number DESC
         LIMIT 1;
    ELSE
        v_version_id := p_ibscbs_version_id;
    END IF;

    IF v_version_id IS NULL THEN
        SELECT COALESCE(MAX(version_row.version_number), 0) + 1
          INTO v_version_number
          FROM public.fiscal_ibscbs_base_versions version_row
         WHERE version_row.ibscbs_base_id = v_base_id;

        INSERT INTO public.fiscal_ibscbs_base_versions AS version_row (
            ibscbs_base_id,
            version_number,
            version_label,
            status,
            valid_from,
            valid_to,
            cst_catalog_version_id,
            classification_catalog_version_id,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_base_id,
            v_version_number,
            COALESCE(NULLIF(TRIM(COALESCE(p_version_label, '')), ''), FORMAT('%s-V%s', UPPER(TRIM(p_code)), v_version_number)),
            'draft',
            p_valid_from,
            p_valid_to,
            v_cst_catalog_version_id,
            v_classification_catalog_version_id,
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        RETURNING version_row.id, version_row.version_number INTO v_version_id, v_version_number;

        v_created_version := true;
    ELSE
        UPDATE public.fiscal_ibscbs_base_versions version_row
           SET version_label = COALESCE(NULLIF(TRIM(COALESCE(p_version_label, '')), ''), version_row.version_label),
               valid_from = p_valid_from,
               valid_to = p_valid_to,
               cst_catalog_version_id = v_cst_catalog_version_id,
               classification_catalog_version_id = v_classification_catalog_version_id,
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               updated_by = v_actor
         WHERE version_row.id = v_version_id
           AND version_row.ibscbs_base_id = v_base_id
           AND version_row.status = 'draft'
         RETURNING version_row.version_number INTO v_version_number;

        IF v_version_number IS NULL THEN
            RAISE EXCEPTION 'Only draft IBS/CBS versions can be edited';
        END IF;
    END IF;

    v_rule_cst_code := NULLIF(TRIM(COALESCE(p_national_rule ->> 'cst_code', '')), '');
    v_rule_classification_code := NULLIF(TRIM(COALESCE(p_national_rule ->> 'classification_code', '')), '');

    IF v_rule_cst_code IS NULL THEN
        RAISE EXCEPTION 'National rule requires cst_code';
    END IF;

    IF v_rule_classification_code IS NULL THEN
        RAISE EXCEPTION 'National rule requires classification_code';
    END IF;

    IF LEFT(v_rule_classification_code, 3) <> v_rule_cst_code THEN
        RAISE EXCEPTION 'National classification code prefix must match cst_code';
    END IF;

    PERFORM 1
      FROM public.fiscal_ibscbs_cst_catalog_items item
     WHERE item.catalog_version_id = v_cst_catalog_version_id
       AND item.code = v_rule_cst_code
       AND item.is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CST % was not found in the selected IBS/CBS catalog version', v_rule_cst_code;
    END IF;

    PERFORM 1
      FROM public.fiscal_ibscbs_classification_items item
     WHERE item.catalog_version_id = v_classification_catalog_version_id
       AND item.code = v_rule_classification_code
       AND item.cst_code = v_rule_cst_code
       AND item.is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Classification % was not found in the selected IBS/CBS catalog version', v_rule_classification_code;
    END IF;

    FOR v_rule_item IN
        SELECT value FROM jsonb_array_elements(p_state_rules)
    LOOP
        v_target_uf := UPPER(TRIM(COALESCE(v_rule_item ->> 'target_uf', '')));
        v_rule_cst_code := NULLIF(TRIM(COALESCE(v_rule_item ->> 'cst_code', '')), '');
        v_rule_classification_code := NULLIF(TRIM(COALESCE(v_rule_item ->> 'classification_code', '')), '');

        IF v_target_uf = '' OR v_target_uf !~ '^[A-Z]{2}$' THEN
            RAISE EXCEPTION 'State rules require a valid target_uf';
        END IF;

        IF v_rule_cst_code IS NULL THEN
            RAISE EXCEPTION 'State rule % requires cst_code', v_target_uf;
        END IF;

        IF v_rule_classification_code IS NULL THEN
            RAISE EXCEPTION 'State rule % requires classification_code', v_target_uf;
        END IF;

        IF LEFT(v_rule_classification_code, 3) <> v_rule_cst_code THEN
            RAISE EXCEPTION 'State rule % classification prefix must match cst_code', v_target_uf;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_cst_catalog_items item
         WHERE item.catalog_version_id = v_cst_catalog_version_id
           AND item.code = v_rule_cst_code
           AND item.is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'CST % was not found in the selected IBS/CBS catalog version', v_rule_cst_code;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_classification_items item
         WHERE item.catalog_version_id = v_classification_catalog_version_id
           AND item.code = v_rule_classification_code
           AND item.cst_code = v_rule_cst_code
           AND item.is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Classification % was not found in the selected IBS/CBS catalog version', v_rule_classification_code;
        END IF;
    END LOOP;

    DELETE FROM public.fiscal_ibscbs_rules rule
     WHERE rule.ibscbs_version_id = v_version_id;

    INSERT INTO public.fiscal_ibscbs_rules (
        ibscbs_version_id,
        target_uf,
        cst_code,
        classification_code,
        is_active,
        metadata_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    VALUES (
        v_version_id,
        NULL,
        NULLIF(TRIM(COALESCE(p_national_rule ->> 'cst_code', '')), ''),
        NULLIF(TRIM(COALESCE(p_national_rule ->> 'classification_code', '')), ''),
        COALESCE((p_national_rule ->> 'is_active')::BOOLEAN, true),
        COALESCE(p_national_rule -> 'metadata_jsonb', '{}'::JSONB),
        COALESCE(p_national_rule -> 'future_tax_payload', '{}'::JSONB),
        v_actor,
        v_actor
    );

    FOR v_rule_item IN
        SELECT value FROM jsonb_array_elements(p_state_rules)
    LOOP
        INSERT INTO public.fiscal_ibscbs_rules (
            ibscbs_version_id,
            target_uf,
            cst_code,
            classification_code,
            is_active,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_version_id,
            UPPER(TRIM(COALESCE(v_rule_item ->> 'target_uf', ''))),
            NULLIF(TRIM(COALESCE(v_rule_item ->> 'cst_code', '')), ''),
            NULLIF(TRIM(COALESCE(v_rule_item ->> 'classification_code', '')), ''),
            COALESCE((v_rule_item ->> 'is_active')::BOOLEAN, true),
            COALESCE(v_rule_item -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(v_rule_item -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        );
    END LOOP;

    RETURN QUERY
    SELECT
        v_base_id,
        v_version_id,
        v_created_base,
        v_created_version,
        v_version_number,
        'draft'::TEXT;
END;
$$;
