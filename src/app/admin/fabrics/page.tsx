import { createClient } from '@/lib/supabase/server'
import { ClientPage } from './ClientPage'
import type { FabricColor } from '@/lib/types'

export const metadata = {
  title: 'Gerenciar Tecidos | CDJWE Vendas Externas',
}

export default async function AdminFabricsPage() {
  const supabase = await createClient()
  if (!supabase || typeof supabase.from !== 'function') {
    console.error('Supabase client failed to initialize or missing .from()', supabase)
    return <div className="p-8 text-red-500">Erro de conexão com o banco de dados. Verifique as configurações.</div>
  }
  
  // Fetch fabrics
  const { data: fabricsData, error: fabricsError } = await supabase
    .from('fabrics')
    .select('*')
    .order('sort_order')

  // Fetch colors
  const { data: colorsData, error: colorsError } = await supabase
    .from('fabric_colors')
    .select('*')
    .order('sort_order')

  // Fetch variants to calculate counts
  const { data: variantsData, error: variantsError } = await supabase
    .from('product_variants')
    .select('fabric_id, fabric_color_id')

  if (fabricsError) console.error('Error loading fabrics:', fabricsError)
  if (colorsError) console.error('Error loading colors:', colorsError)
  if (variantsError) console.error('Error loading variants:', variantsError)

  const rawFabrics = fabricsData || []
  const rawColors = (colorsData || []) as FabricColor[]
  const variants = variantsData || []

  // Compute counts
  const fabricCounts = variants.reduce((acc, v) => {
    if (v.fabric_id) acc[v.fabric_id] = (acc[v.fabric_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const colorCounts = variants.reduce((acc, v) => {
    if (v.fabric_color_id) acc[v.fabric_color_id] = (acc[v.fabric_color_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Group colors by fabric and inject counts
  const initialFabrics = rawFabrics.map((f: any) => ({
    ...f,
    variant_count: fabricCounts[f.id] || 0,
    colors: rawColors
      .filter(c => c.fabric_id === f.id)
      .map(c => ({
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
