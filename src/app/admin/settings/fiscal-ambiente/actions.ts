'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyFiscalEnvironment } from '@/lib/types'
import { evaluateCompanyFiscalReadiness } from '@/lib/fiscal/company-readiness'

export async function loadFiscalEnvironmentAction(): Promise<{ data: CompanyFiscalEnvironment | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('company_fiscal_environment')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { data: null, error: `Erro ao carregar ambiente de emissão: ${error.message}` }
  }

  return { data: data as CompanyFiscalEnvironment | null, error: null }
}

interface SaveFiscalEnvironmentInput {
  id?: string
  ambiente: string
  serie_padrao_nfe: string
  proximo_numero_nfe: number
  tipo_emissao: string
  emissao_ativa: boolean
  max_itens_por_nota: number
  ultima_nota_nfe: number
  serie_nfce: string
  nota_inicial_nfce: number
  ultima_nota_nfce: number
  csc_id_nfce: string | null
  csc_numero_nfce: string | null
  codigo_referencia_nota: string
  desconto_impostos_prazo: boolean
  bloquear_retorno_parcial_remessa: boolean
  icms_base_pis_cofins: boolean
  frete_base_icms: boolean
  modalidade_frete_padrao: string
  parametros_jsonb: Record<string, unknown>
}

export async function saveFiscalEnvironmentAction(input: SaveFiscalEnvironmentInput): Promise<{ error: string | null }> {
  if (!input.ambiente || !['homologacao', 'producao'].includes(input.ambiente)) {
    return { error: 'Ambiente deve ser "homologação" ou "produção".' }
  }

  if (!/^\d{1,3}$/.test(input.serie_padrao_nfe)) {
    return { error: 'Série da NF-e deve ter entre 1 e 3 dígitos numéricos.' }
  }

  if (input.proximo_numero_nfe < 1) {
    return { error: 'Nota inicial da NF-e deve ser no mínimo 1.' }
  }

  if (input.max_itens_por_nota < 1 || input.max_itens_por_nota > 990) {
    return { error: 'Número máximo de itens deve ficar entre 1 e 990.' }
  }

  if (!/^\d{1,3}$/.test(input.serie_nfce)) {
    return { error: 'Série da NFC-e deve ter entre 1 e 3 dígitos numéricos.' }
  }

  if (input.nota_inicial_nfce < 1) {
    return { error: 'Nota inicial da NFC-e deve ser no mínimo 1.' }
  }

  const hasCSCId = Boolean(input.csc_id_nfce?.trim())
  const hasCSCNum = Boolean(input.csc_numero_nfce?.trim())
  if (hasCSCId !== hasCSCNum) {
    return { error: 'CSC Identificador e CSC Número devem ser preenchidos juntos.' }
  }

  const validRefCodes = ['codigo_barras', 'codigo_fabricante', 'codigo_erp', 'codigo_interno']
  if (!validRefCodes.includes(input.codigo_referencia_nota)) {
    return { error: 'Código de referência na nota inválido.' }
  }

  const validFreightModes = ['emitente', 'destinatario', 'terceiros', 'proprio_remetente', 'proprio_destinatario', 'sem_frete']
  if (!validFreightModes.includes(input.modalidade_frete_padrao)) {
    return { error: 'Modalidade de frete inválida.' }
  }

  if (input.emissao_ativa || input.ambiente === 'producao') {
    const readiness = await evaluateCompanyFiscalReadiness()
    const blockers = readiness.items
      .filter((item) => item.blocking && item.status !== 'ok')
      .map((item) => item.label)

    if (blockers.length > 0) {
      const head = blockers.slice(0, 3).join(', ')
      const suffix = blockers.length > 3 ? ' e outros pontos críticos.' : '.'
      return {
        error: `A emissão não pode ser habilitada enquanto houver bloqueios na prontidão fiscal: ${head}${suffix}`,
      }
    }
  }

  const supabase = await createClient()
  const existingEnvironment = input.id
    ? { data: { id: input.id }, error: null }
    : await supabase
      .from('company_fiscal_environment')
      .select('id')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  if (existingEnvironment.error) {
    return { error: `Erro ao localizar ambiente de emissão atual: ${existingEnvironment.error.message}` }
  }

  const data = {
    ambiente: input.ambiente,
    serie_padrao_nfe: input.serie_padrao_nfe,
    proximo_numero_nfe: input.proximo_numero_nfe,
    tipo_emissao: input.tipo_emissao || 'normal',
    emissao_ativa: input.emissao_ativa,
    max_itens_por_nota: input.max_itens_por_nota,
    ultima_nota_nfe: input.ultima_nota_nfe,
    serie_nfce: input.serie_nfce,
    nota_inicial_nfce: input.nota_inicial_nfce,
    ultima_nota_nfce: input.ultima_nota_nfce,
    csc_id_nfce: input.csc_id_nfce?.trim() || null,
    csc_numero_nfce: input.csc_numero_nfce?.trim() || null,
    codigo_referencia_nota: input.codigo_referencia_nota,
    desconto_impostos_prazo: input.desconto_impostos_prazo,
    bloquear_retorno_parcial_remessa: input.bloquear_retorno_parcial_remessa,
    icms_base_pis_cofins: input.icms_base_pis_cofins,
    frete_base_icms: input.frete_base_icms,
    modalidade_frete_padrao: input.modalidade_frete_padrao,
    parametros_jsonb: input.parametros_jsonb,
  }

  const targetEnvironmentId = existingEnvironment.data?.id || null

  if (targetEnvironmentId) {
    const { error } = await supabase.from('company_fiscal_environment').update(data).eq('id', targetEnvironmentId)
    if (error) {
      return { error: `Erro ao salvar ambiente de emissão: ${error.message}` }
    }
  } else {
    const { error } = await supabase.from('company_fiscal_environment').insert(data)
    if (error) {
      return { error: `Erro ao criar ambiente de emissão: ${error.message}` }
    }
  }

  return { error: null }
}
