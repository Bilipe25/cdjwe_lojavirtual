'use server'

import { createClient } from '@/lib/supabase/server'
import type { Fabric, FabricColor } from '@/lib/types'

type FabricWithColors = Fabric & { colors: FabricColor[] }

export async function getFabricsForClient(): Promise<FabricWithColors[]> {
  try {
    const supabase = await createClient()

    // Query active fabrics with active colors
    const { data: fabrics, error } = await supabase
      .from('fabrics')
      .select(`
        *,
        colors:fabric_colors(*)
      `)
      .eq('is_active', true)
      .eq('colors.is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error

    // Sorting colors within each fabric just in case (though Supabase might not respect it in sub-query)
    const sortedFabrics = (fabrics || []).map(fabric => ({
      ...fabric,
      colors: (fabric.colors || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    }))

    return sortedFabrics as FabricWithColors[]
  } catch (error) {
    console.error('Error fetching fabrics for client:', error)
    return []
  }
}
