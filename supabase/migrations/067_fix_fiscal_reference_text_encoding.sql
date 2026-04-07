-- ============================================================
-- Migration 067: Fix fiscal reference text encoding
-- ============================================================

UPDATE public.fiscal_reference_type_settings
   SET label = 'NCM',
       description = U&'Nomenclatura Comum do Mercosul',
       updated_at = NOW()
 WHERE table_type = 'ncm';

UPDATE public.fiscal_reference_type_settings
   SET label = 'TIPI / IPI',
       description = U&'Tabela de incid\00EAncia do IPI por NCM',
       updated_at = NOW()
 WHERE table_type = 'tipi';

UPDATE public.fiscal_reference_type_settings
   SET label = 'CEST',
       description = U&'C\00F3digo Especificador da Substitui\00E7\00E3o Tribut\00E1ria',
       updated_at = NOW()
 WHERE table_type = 'cest';

UPDATE public.fiscal_reference_type_settings
   SET label = 'CFOP',
       description = U&'C\00F3digo Fiscal de Opera\00E7\00F5es e Presta\00E7\00F5es',
       updated_at = NOW()
 WHERE table_type = 'cfop';
