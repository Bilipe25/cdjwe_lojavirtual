ALTER TABLE public.fiscal_cest_ncm_links
    ADD COLUMN IF NOT EXISTS match_type TEXT,
    ADD COLUMN IF NOT EXISTS prefix_length INTEGER;

UPDATE public.fiscal_cest_ncm_links
   SET match_type = CASE
        WHEN char_length(ncm_code) = 8 THEN 'exact'
        ELSE 'prefix'
   END
 WHERE match_type IS NULL
    OR NULLIF(TRIM(match_type), '') IS NULL;

UPDATE public.fiscal_cest_ncm_links
   SET prefix_length = char_length(ncm_code)
 WHERE prefix_length IS NULL;

ALTER TABLE public.fiscal_cest_ncm_links
    ALTER COLUMN match_type SET NOT NULL,
    ALTER COLUMN prefix_length SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fiscal_cest_ncm_links_ncm_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_ncm_links
            DROP CONSTRAINT fiscal_cest_ncm_links_ncm_check;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fiscal_cest_ncm_links_ncm_range_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_ncm_links
            ADD CONSTRAINT fiscal_cest_ncm_links_ncm_range_check
            CHECK (ncm_code ~ '^\d{2,8}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fiscal_cest_ncm_links_match_type_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_ncm_links
            ADD CONSTRAINT fiscal_cest_ncm_links_match_type_check
            CHECK (match_type IN ('exact', 'prefix'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fiscal_cest_ncm_links_prefix_length_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_ncm_links
            ADD CONSTRAINT fiscal_cest_ncm_links_prefix_length_check
            CHECK (
                prefix_length BETWEEN 2 AND 8
                AND prefix_length = char_length(ncm_code)
                AND (
                    (match_type = 'exact' AND prefix_length = 8)
                    OR (match_type = 'prefix' AND prefix_length BETWEEN 2 AND 7)
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fiscal_cest_ncm_links_match_type_ncm
    ON public.fiscal_cest_ncm_links(match_type, ncm_code, prefix_length DESC);
