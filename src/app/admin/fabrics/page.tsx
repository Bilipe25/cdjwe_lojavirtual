import { createClient } from '@/lib/supabase/server'
import { ClientPage } from './ClientPage'
import type { Fabric, FabricColor } from '@/lib/types'

export const metadata = {
  title: 'Gerenciar Tecidos | CDJWE Vendas Externas',
}

export default async function AdminFabricsPage() {
  const supabase = await createClient()
  if (!supabase || typeof supabase.from !== 'function') {
    console.error('Supabase client failed to initialize or missing .from()', supabase)
    return <div className="p-8 text-red-500">Erro de conexao com o banco de dados. Verifique as configuracoes.</div>
  }

  const [fabricsRes, colorsRes, usageRes] = await Promise.all([
    supabase.from('fabrics').select('*').order('sort_order'),
    supabase.from('fabric_colors').select('*').order('sort_order'),
    supabase.rpc('admin_get_fabric_color_usage_counts'),
  ])

  if (fabricsRes.error) console.error('Error loading fabrics:', fabricsRes.error)
  if (colorsRes.error) console.error('Error loading colors:', colorsRes.error)
  if (usageRes.error) console.error('Error loading usage counts:', usageRes.error)

  const rawFabrics = fabricsRes.data || []
  const rawColors = (colorsRes.data || []) as FabricColor[]

  let usageRows =
    (usageRes.data as Array<{
      fabric_id: string | null
      fabric_color_id: string | null
      variant_count: number | null
    }> | null) || []

  if (usageRes.error) {
    const { data: variantsFallback } = await supabase
      .from('product_variants')
      .select('fabric_id, fabric_color_id')

    usageRows = (variantsFallback || []).map((row) => ({
      fabric_id: row.fabric_id,
      fabric_color_id: row.fabric_color_id,
      variant_count: 1,
    }))
  }

  const fabricCounts = usageRows.reduce((acc, row) => {
    if (!row.fabric_id) return acc
    acc[row.fabric_id] = (acc[row.fabric_id] || 0) + Number(row.variant_count || 0)
    return acc
  }, {} as Record<string, number>)

  const colorCounts = usageRows.reduce((acc, row) => {
    if (!row.fabric_color_id) return acc
    acc[row.fabric_color_id] = Number(row.variant_count || 0)
    return acc
  }, {} as Record<string, number>)

  const initialFabrics = (rawFabrics as Fabric[]).map((f) => ({
    ...f,
    variant_count: fabricCounts[f.id] || 0,
    colors: rawColors
      .filter((c) => c.fabric_id === f.id)
      .map((c) => ({
        ...c,
        variant_count: colorCounts[c.id] || 0,
      })),
  }))

  return (
    <div className="max-w-[1200px] mx-auto w-full pb-20">
      <ClientPage initialFabrics={initialFabrics} />
    </div>
  )
}
