'use client'

import { useState } from 'react'
import { Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

import type { Fabric, FabricColor } from '@/lib/types'
import { FabricList } from './components/FabricList'
import { FabricForm } from './components/FabricForm'
import { ColorForm } from './components/ColorForm'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { deleteSelectedColors } from './actions'

type FabricWithColors = Fabric & { colors: FabricColor[] }

interface ClientPageProps {
  initialFabrics: FabricWithColors[]
}

export function ClientPage({ initialFabrics }: ClientPageProps) {
  const [fabrics, setFabrics] = useState<FabricWithColors[]>(initialFabrics)
  const router = useRouter()

  // Extra Features State
  const [searchQuery, setSearchQuery] = useState('')
  const [hideInactive, setHideInactive] = useState(false)
  const [selectedColors, setSelectedColors] = useState<string[]>([])

  // Dialogs State
  const [fabricDialogOpen, setFabricDialogOpen] = useState(false)
  const [editingFabric, setEditingFabric] = useState<Fabric | null>(null)
  
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [editingColor, setEditingColor] = useState<FabricColor | null>(null)
  const [activeFabricId, setActiveFabricId] = useState<string>('')

  // ----- Fabrication Dialog Actions -----
  const openFabricDialog = (fabric?: Fabric) => {
    setEditingFabric(fabric || null)
    setFabricDialogOpen(true)
  }

  const closeFabricDialog = () => {
    setFabricDialogOpen(false)
    router.refresh()
  }

  // ----- Color Dialog Actions -----
  const openColorDialog = (fabricId: string, color?: FabricColor) => {
    setActiveFabricId(fabricId)
    setEditingColor(color || null)
    setColorDialogOpen(true)
  }

  const closeColorDialog = () => {
    setColorDialogOpen(false)
    router.refresh()
  }

  // ----- Bulk Actions -----
  const handleBulkToggleActive = async (isActive: boolean) => {
    if (selectedColors.length === 0) return

    const supabase = createClient()
    const { error } = await supabase.from('fabric_colors')
      .update({ is_active: isActive })
      .in('id', selectedColors)

    if (error) { 
      toast.error('Falha ao atualizar cores.')
      return 
    }
    
    toast.success(`${selectedColors.length} cores ${isActive ? 'ativadas' : 'desativadas'}!`)
    setSelectedColors([])
    
    // Optimistic UI update for bulk action
    setFabrics(prev => prev.map(f => ({
      ...f,
      colors: f.colors.map(c => 
        selectedColors.includes(c.id) ? { ...c, is_active: isActive } : c
      )
    })))
    
    // Hard refresh in background to match DB
    router.refresh()
  }

  const handleBulkDelete = async () => {
    if (selectedColors.length === 0) return
    if (!window.confirm('Excluir cores selecionadas?\nCores associadas a produtos serão ignoradas pela trava de banco de dados.')) return

    const result = await deleteSelectedColors(selectedColors)
    if (result.error) {
      toast.error(result.error)
      return
    }
    
    toast.success(`${selectedColors.length} cores excluídas com sucesso!`)
    setSelectedColors([])
    
    // Optimistic UI update
    setFabrics(prev => prev.map(f => ({
      ...f,
      colors: f.colors.filter(c => !selectedColors.includes(c.id))
    })))
    
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-gradient-navy">Tecidos & Cores</h1>
          <p className="text-muted-foreground mt-1">Gerencie a grade de tecidos e cores</p>
        </div>
        <Button className="gradient-navy border-0 text-white gap-2" onClick={() => openFabricDialog()}>
          <Plus className="h-4 w-4" />Novo Tecido
        </Button>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white/60 p-3 md:p-4 rounded-xl border shadow-sm">
        <div className="flex flex-col sm:flex-row flex-1 w-full gap-3 sm:gap-4 items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código hex, nome..."
              className="pl-9 h-10 md:h-11 bg-white"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto py-1 sm:py-0">
            <Switch id="hide-inactive" checked={hideInactive} onCheckedChange={setHideInactive} />
            <Label htmlFor="hide-inactive" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">Ocultar Inativos</Label>
          </div>
        </div>

        {selectedColors.length > 0 && (
          <div className="flex items-center gap-2 bg-bronze/10 px-3 py-2 rounded-lg border border-bronze/20 w-full md:w-auto overflow-x-auto">
            <span className="text-sm font-medium text-bronze whitespace-nowrap">{selectedColors.length} selecionadas</span>
            <div className="h-4 w-px bg-bronze/20 mx-1" />
            <Button size="sm" variant="ghost" className="h-8 text-green-700 hover:text-green-800 hover:bg-green-100 px-2" onClick={() => handleBulkToggleActive(true)}>Ativar</Button>
            <Button size="sm" variant="ghost" className="h-8 text-red-700 hover:text-red-800 hover:bg-red-100 px-2" onClick={() => handleBulkToggleActive(false)}>Desativar</Button>
            <Button size="sm" variant="ghost" className="h-8 text-neutral-600 hover:text-red-700 hover:bg-red-50 px-2 ml-1" onClick={handleBulkDelete}>Excluir</Button>
          </div>
        )}
      </div>

      <FabricList
        fabrics={fabrics}
        setFabrics={setFabrics}
        searchQuery={searchQuery}
        hideInactive={hideInactive}
        selectedColors={selectedColors}
        setSelectedColors={setSelectedColors}
        onEditFabric={openFabricDialog}
        onAddColor={openColorDialog}
        onEditColor={openColorDialog}
      />

      <FabricForm 
        isOpen={fabricDialogOpen} 
        onClose={closeFabricDialog} 
        fabric={editingFabric} 
      />

      <ColorForm 
        isOpen={colorDialogOpen} 
        onClose={closeColorDialog} 
        fabricId={activeFabricId} 
        color={editingColor} 
      />
    </div>
  )
}
