-- Make emitter federal taxes explicit corporate fallbacks.
-- Existing rows with intentional zero rates are preserved.

ALTER TABLE public.emitter_federal_tax_config
  ALTER COLUMN aliquota_pis SET DEFAULT 0.65,
  ALTER COLUMN aliquota_cofins SET DEFAULT 3.00;

UPDATE public.emitter_federal_tax_config
SET aliquota_pis = 0.65
WHERE aliquota_pis IS NULL;

UPDATE public.emitter_federal_tax_config
SET aliquota_cofins = 3.00
WHERE aliquota_cofins IS NULL;

COMMENT ON COLUMN public.emitter_federal_tax_config.aliquota_pis IS
  'Fallback corporativo de PIS usado apenas quando o perfil tributario do item nao define aliquota.';

COMMENT ON COLUMN public.emitter_federal_tax_config.aliquota_cofins IS
  'Fallback corporativo de COFINS usado apenas quando o perfil tributario do item nao define aliquota.';

COMMENT ON COLUMN public.emitter_federal_tax_config.exibir_total_tributos IS
  'Controla emissao de vTotTrib no XML e exibicao dos tributos aproximados na DANFE quando houver percentual IBPT.';
