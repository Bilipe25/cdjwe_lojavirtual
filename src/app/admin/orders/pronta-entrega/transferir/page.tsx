import { getReadyDeliveryTransferOptions, transferRepresentativeStockFormAction } from '../actions'
import { getRelation } from '../_components'
import { AlertCircle, CheckCircle2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard } from '../_components'

function buildVariantOptions(variants: Awaited<ReturnType<typeof getReadyDeliveryTransferOptions>>['variants']) {
  return variants.flatMap((variant) => {
    const product = getRelation(variant.product)
    const fabric = getRelation(variant.fabric)
    const color = getRelation(variant.fabric_color)
    const sizeOptions = Array.isArray(product?.size_options)
      ? product.size_options.filter((size) => size.is_active !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      : []

    const baseLabel = [
      product?.name || 'Produto sem nome',
      fabric?.name,
      color?.name,
      variant.sku ? `SKU ${variant.sku}` : null,
      `Estoque: ${variant.stock_quantity || 0}`,
    ].filter(Boolean).join(' · ')

    if (product?.has_size_variants && sizeOptions.length > 0) {
      return sizeOptions.map((size) => ({
        value: `${variant.id}::${size.id}`,
        label: `${baseLabel} · ${size.name}`,
      }))
    }

    return [{
      value: `${variant.id}::legacy`,
      label: baseLabel,
    }]
  })
}

export default async function ReadyDeliveryTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const params = await searchParams
  const data = await getReadyDeliveryTransferOptions()
  const variantOptions = buildVariantOptions(data.variants)

  return (
    <div className="space-y-5">
      {params.success ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Transferência registrada com sucesso.
        </div>
      ) : null}

      {params.error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {params.error === 'invalid' ? 'Preencha representante, produto e quantidade.' : decodeURIComponent(params.error)}
        </div>
      ) : null}

      <SectionCard
        title="Nova transferência"
        description="Registre um item por vez para manter rastreabilidade clara."
      >
        <form action={transferRepresentativeStockFormAction}>
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.4fr_160px]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Representante</span>
              <select
                name="representativeId"
                required
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
              >
                <option value="">Selecione</option>
                {data.representatives.map((representative) => (
                  <option key={representative.id} value={representative.id}>
                    {representative.full_name || representative.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Produto / variação / tamanho</span>
              <select
                name="variantChoice"
                required
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
              >
                <option value="">Selecione</option>
                {variantOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Quantidade</span>
              <Input name="quantity" type="number" min={1} step={1} required placeholder="0" className="h-10" />
            </label>
          </div>

          <div className="border-t border-border/50 p-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Observação</span>
              <Textarea name="notes" placeholder="Ex.: carga para roteiro de sexta-feira" className="min-h-20" />
            </label>

            <div className="mt-4 flex justify-end">
              <Button type="submit" className="h-10 rounded-lg">
                <Send className="mr-2 h-4 w-4" />
                Registrar transferência
              </Button>
            </div>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
