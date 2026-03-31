'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Palette,
  MoreHorizontal,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Paintbrush,
  GripVertical,
  CheckSquare,
  Square
} from 'lucide-react'
import Image from 'next/image'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { Fabric, FabricColor } from '@/lib/types'
import { deleteFabric, deleteColor, reorderFabrics, reorderColors } from '../actions'

type FabricWithColors = Fabric & { colors: FabricColor[] }

interface FabricListProps {
  fabrics: FabricWithColors[]
  setFabrics: React.Dispatch<React.SetStateAction<FabricWithColors[]>>
  searchQuery: string
  hideInactive: boolean
  selectedColors: string[]
  setSelectedColors: React.Dispatch<React.SetStateAction<string[]>>
  onEditFabric: (fabric: Fabric) => void
  onAddColor: (fabricId: string) => void
  onEditColor: (fabricId: string, color: FabricColor) => void
}

export function FabricList({
  fabrics,
  setFabrics,
  searchQuery,
  hideInactive,
  selectedColors,
  setSelectedColors,
  onEditFabric,
  onAddColor,
  onEditColor
}: FabricListProps) {
  const [expandedFabric, setExpandedFabric] = useState<string | null>(null)
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null)

  // Dialog State
  const [fabricToDelete, setFabricToDelete] = useState<string | null>(null)
  const [colorToDelete, setColorToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEndFabric = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = fabrics.findIndex((f) => f.id === active.id)
      const newIndex = fabrics.findIndex((f) => f.id === over.id)

      const reordered = arrayMove(fabrics, oldIndex, newIndex)
      
      // Optimistic UI Update
      setFabrics(reordered)

      // Background persistence
      const supabaseIds = reordered.map((f) => f.id)
      const result = await reorderFabrics(supabaseIds)
      
      if (result.error) {
        toast.error(result.error)
        setFabrics(fabrics) // Rollback
      }
    }
  }

  const handleDragEndColor = async (event: DragEndEvent, fabricId: string) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const fabricIndex = fabrics.findIndex(f => f.id === fabricId)
      if (fabricIndex === -1) return

      const fabric = fabrics[fabricIndex]
      const oldIndex = fabric.colors.findIndex(c => c.id === active.id)
      const newIndex = fabric.colors.findIndex(c => c.id === over.id)

      const reorderedColors = arrayMove(fabric.colors, oldIndex, newIndex)

      const updatedFabrics = [...fabrics]
      updatedFabrics[fabricIndex] = { ...fabric, colors: reorderedColors }
      
      // Optimistic UI Update
      setFabrics(updatedFabrics)

      // Background persistence
      const supabaseIds = reorderedColors.map((c) => c.id)
      const result = await reorderColors(supabaseIds)
      
      if (result.error) {
        toast.error(result.error)
        setFabrics(fabrics) // Rollback
      }
    }
  }

  const toggleColorSelection = (colorId: string) => {
    setSelectedColors(prev =>
      prev.includes(colorId)
        ? prev.filter(id => id !== colorId)
        : [...prev, colorId]
    )
  }

  const confirmDeleteFabric = async () => {
    if (!fabricToDelete) return
    setIsDeleting(true)
    const result = await deleteFabric(fabricToDelete)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
      setFabricToDelete(null)
      return
    }

    if (result.mode === 'deleted') {
      setFabrics(prev => prev.filter(f => f.id !== fabricToDelete))
    } else {
      setFabrics(prev => prev.map(f => (
        f.id === fabricToDelete ? { ...f, is_active: false } : f
      )))
    }

    toast.success(result.message)
    setFabricToDelete(null)
  }

  const confirmDeleteColor = async () => {
    if (!colorToDelete) return
    setIsDeleting(true)
    const result = await deleteColor(colorToDelete)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
      setColorToDelete(null)
      return
    }

    if (result.mode === 'deleted') {
      setFabrics(prev => prev.map(f => ({
        ...f,
        colors: f.colors.filter(c => c.id !== colorToDelete)
      })))
    } else {
      setFabrics(prev => prev.map(f => ({
        ...f,
        colors: f.colors.map(c => (
          c.id === colorToDelete ? { ...c, is_active: false } : c
        ))
      })))
    }

    toast.success(result.message)
    setColorToDelete(null)
  }

  // Filtering Logic
  const filteredFabrics = fabrics.filter(f => {
    if (hideInactive && !f.is_active) return false

    const searchLower = searchQuery.toLowerCase()
    
    // Check if fabric matches name
    const matchesFabricName = f.name.toLowerCase().includes(searchLower)
    
    // Check if any color matches name OR hex code
    const matchesColorName = f.colors.some(c => 
      c.name.toLowerCase().includes(searchLower) || 
      (c.hex_code && c.hex_code.toLowerCase().includes(searchLower))
    )

    return matchesFabricName || matchesColorName
  }).map(f => {
    return {
      ...f,
      colors: f.colors.filter(c => {
        if (hideInactive && !c.is_active) return false

        const searchLower = searchQuery.toLowerCase()
        
        // If searching, and fabric doesn't match, only show matching colors.
        // Otherwise, show all of them for this fabric
        if (searchLower && !f.name.toLowerCase().includes(searchLower)) {
          return c.name.toLowerCase().includes(searchLower) || 
                 (c.hex_code && c.hex_code.toLowerCase().includes(searchLower))
        }

        return true
      })
    }
  })

  if (filteredFabrics.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <Palette className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Nenhum resultado encontrado</h3>
      </div>
    )
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndFabric}>
        <SortableContext items={filteredFabrics.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {filteredFabrics.map((fabric, i) => (
              <SortableFabricItem
                key={fabric.id}
                fabric={fabric}
                index={i}
                expandedFabric={expandedFabric}
                setExpandedFabric={setExpandedFabric}
                onEditFabric={onEditFabric}
                onAddColor={onAddColor}
                onEditColor={onEditColor}
                onDeleteFabric={setFabricToDelete}
                sensors={sensors}
                handleDragEndColor={handleDragEndColor}
                selectedColors={selectedColors}
                toggleColorSelection={toggleColorSelection}
                onDeleteColor={setColorToDelete}
                setZoomedImageUrl={setZoomedImageUrl}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Delete Fabric Dialog */}
      <AlertDialog open={!!fabricToDelete} onOpenChange={(open) => !open && !isDeleting && setFabricToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Tecido</AlertDialogTitle>
            <AlertDialogDescription>
              Se houver variantes vinculadas, o tecido sera inativado. Sem vinculos, a exclusao sera definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); confirmDeleteFabric(); }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={isDeleting}
            >
              {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Color Dialog */}
      <AlertDialog open={!!colorToDelete} onOpenChange={(open) => !open && !isDeleting && setColorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cor</AlertDialogTitle>
            <AlertDialogDescription>
              Se houver variantes vinculadas, a cor sera inativada. Sem vinculos, a exclusao sera definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); confirmDeleteColor(); }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={isDeleting}
            >
              {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Zoom Dialog */}
      <Dialog open={!!zoomedImageUrl} onOpenChange={(open: boolean) => !open && setZoomedImageUrl(null)}>
        <DialogContent className="!max-w-[500px] p-0 overflow-hidden bg-transparent border-none shadow-2xl flex items-center justify-center">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualização da Cor</DialogTitle>
          </DialogHeader>
          {zoomedImageUrl && (
            <div className="relative aspect-square w-full max-w-[90vw] sm:max-w-[500px] rounded-xl overflow-hidden bg-muted">
              <Image 
                src={zoomedImageUrl} 
                alt="Cor ampliada" 
                fill 
                className="object-cover"
                sizes="(max-width: 768px) 90vw, 500px" 
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// -------------------------------------------------------------------------------- //
// DND Sub-components
// -------------------------------------------------------------------------------- //

interface SortableFabricItemProps {
  fabric: FabricWithColors
  index: number
  expandedFabric: string | null
  setExpandedFabric: (id: string | null) => void
  onEditFabric: (fabric: Fabric) => void
  onAddColor: (fabricId: string) => void
  onEditColor: (fabricId: string, color: FabricColor) => void
  onDeleteFabric: (id: string) => void
  sensors: ReturnType<typeof useSensors>
  handleDragEndColor: (e: DragEndEvent, fabricId: string) => Promise<void>
  selectedColors: string[]
  toggleColorSelection: (id: string) => void
  onDeleteColor: (id: string) => void
  setZoomedImageUrl: (url: string) => void
}

function SortableFabricItem({
  fabric,
  index,
  expandedFabric,
  setExpandedFabric,
  onEditFabric,
  onAddColor,
  onEditColor,
  onDeleteFabric,
  sensors,
  handleDragEndColor,
  selectedColors,
  toggleColorSelection,
  onDeleteColor,
  setZoomedImageUrl
}: SortableFabricItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: fabric.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
  }

  const isExpanded = expandedFabric === fabric.id

  return (
    <motion.div ref={setNodeRef} style={style} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className="glass-card border-0">
        <CardContent className="p-0">
          <div className="flex items-center p-4 cursor-pointer" onClick={() => setExpandedFabric(isExpanded ? null : fabric.id)}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Drag Handle */}
              <div {...attributes} {...listeners} className="cursor-grab hover:bg-muted p-1 rounded-sm active:cursor-grabbing" onClick={e => e.stopPropagation()}>
                <GripVertical className="h-4 w-4 text-muted-foreground opacity-50" />
              </div>

              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              
              <div className="h-10 w-10 relative overflow-hidden rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                {fabric.image_url ? (
                  <Image src={fabric.image_url} alt={fabric.name} fill className="object-cover" sizes="40px" />
                ) : (
                  <Palette className="h-5 w-5 text-white" />
                )}
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{fabric.name}</h3>
                  {!fabric.is_active && <Badge className="text-[10px] bg-red-100 text-red-800 border-red-200">Inativo</Badge>}
                </div>
                
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {fabric.price_modifier > 0 ? ` +R$ ${fabric.price_modifier.toFixed(2)}` : 'Sem adicional de preço'}
                  </p>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 opacity-80 font-normal">
                    {fabric.variant_count || 0} prod.
                  </Badge>
                </div>
              </div>

              {/* Dynamic Mini Swatches (Only visible when collapsed) */}
              {!isExpanded && fabric.colors.length > 0 && (
                <div className="hidden sm:flex -space-x-2 mr-4 overflow-hidden" title={`${fabric.colors.length} cores cadastradas`}>
                  {fabric.colors.slice(0, 5).map((color, i) => (
                    <div 
                      key={color.id} 
                      className="h-6 w-6 rounded-full border-2 border-white shadow-sm overflow-hidden z-[5] relative"
                      style={!color.image_url ? { backgroundColor: color.hex_code || '#ccc', zIndex: 10 - i } : { zIndex: 10 - i }}
                    >
                      {color.image_url && <Image src={color.image_url} alt="amostra" fill className="object-cover" sizes="24px" />}
                    </div>
                  ))}
                  {fabric.colors.length > 5 && (
                    <div className="h-6 w-6 rounded-full border-2 border-white bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-medium z-0 relative">
                      +{fabric.colors.length - 5}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="outline" className="gap-1 h-8 px-2 sm:px-3 text-xs sm:text-sm" onClick={() => onAddColor(fabric.id)}>
                <Paintbrush className="h-3.5 w-3.5" /><span className="hidden sm:inline">+ Cor</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditFabric(fabric)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDeleteFabric(fabric.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Colors (expanded) */}
          {isExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-t px-4 py-3 bg-muted/20">
              {fabric.colors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cor cadastrada</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndColor(e, fabric.id)}>
                  <SortableContext items={fabric.colors.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap gap-2">
                      {fabric.colors.map((color) => (
                        <SortableColorItem
                          key={color.id}
                          color={color}
                          isSelected={selectedColors.includes(color.id)}
                          toggleSelection={() => toggleColorSelection(color.id)}
                          onEditColor={() => onEditColor(fabric.id, color)}
                          onDeleteColor={onDeleteColor}
                          setZoomedImageUrl={setZoomedImageUrl}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

interface SortableColorItemProps {
  color: FabricColor
  isSelected: boolean
  toggleSelection: () => void
  onEditColor: () => void
  onDeleteColor: (id: string) => void
  setZoomedImageUrl: (url: string) => void
}

function SortableColorItem({ 
  color, 
  isSelected, 
  toggleSelection, 
  onEditColor, 
  onDeleteColor, 
  setZoomedImageUrl 
}: SortableColorItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: color.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg border bg-white/60 hover:shadow-sm transition-shadow ${isSelected ? 'ring-2 ring-bronze/50 border-bronze/50 bg-bronze/5' : ''}`}>
      {/* Grab trigger left */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 opacity-20 hover:opacity-100">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* Bulk Select Checkbox */}
      <button onClick={toggleSelection} className="flex items-center justify-center text-muted-foreground hover:text-bronze focus:outline-none">
        {isSelected ? <CheckSquare className="h-4 w-4 text-bronze" /> : <Square className="h-4 w-4 opacity-50" />}
      </button>

      <div
        className={`h-7 w-7 rounded-full border shadow-inner relative overflow-hidden flex-shrink-0 ${color.image_url ? 'cursor-zoom-in group-hover:ring-2 ring-bronze/50' : ''}`}
        style={!color.image_url ? { backgroundColor: color.hex_code || '#ccc' } : undefined}
        onClick={() => color.image_url ? setZoomedImageUrl(color.image_url) : undefined}
      >
        {color.image_url && <Image src={color.image_url} alt={color.name} fill className="object-cover" sizes="28px" />}
      </div>

      <div className="flex flex-col min-w-[80px]">
        <span className="text-sm font-medium leading-none mb-1">{color.name}</span>
        <div className="flex items-center gap-2">
          {color.hex_code && !color.image_url && (
              <span className="text-[10px] text-muted-foreground uppercase">{color.hex_code}</span>
          )}
          <span className="text-[10px] text-muted-foreground">{color.variant_count || 0} prod.</span>
        </div>
      </div>

      {!color.is_active && <span className="text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-500 font-bold ml-1">OFF</span>}

      <div className="flex sm:hidden group-hover:flex md:flex absolute -top-2 -right-2 gap-0.5 z-20">
        <button onClick={onEditColor} className="h-7 w-7 sm:h-6 sm:w-6 rounded-full bg-white border shadow flex items-center justify-center hover:bg-muted text-navy transition-colors">
          <Edit className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
        </button>
        <button onClick={() => onDeleteColor(color.id)} className="h-7 w-7 sm:h-6 sm:w-6 rounded-full bg-white border shadow flex items-center justify-center hover:bg-red-50 text-destructive transition-colors">
          <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
        </button>
      </div>
    </div>
  )
}

