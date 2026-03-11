'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, UploadCloud, X } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'

import type { Fabric } from '@/lib/types'
import { fabricSchema, type FabricFormData } from '../schema'
import { saveFabric } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { syncAllVariants } from '../../actions/variants'

interface FabricFormProps {
  isOpen: boolean
  onClose: () => void
  fabric: Fabric | null
}

export function FabricForm({ isOpen, onClose, fabric }: FabricFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const supabase = createClient()

  const form = useForm<FabricFormData>({
    resolver: zodResolver(fabricSchema),
    defaultValues: {
      id: fabric?.id,
      name: fabric?.name || '',
      description: fabric?.description || '',
      price_modifier: fabric?.price_modifier || 0,
      image_url: fabric?.image_url || '',
      is_active: fabric ? fabric.is_active : true,
    },
  })

  // Update form when fabric prop changes
  useEffect(() => {
    form.reset({
      id: fabric?.id,
      name: fabric?.name || '',
      description: fabric?.description || '',
      price_modifier: fabric?.price_modifier || 0,
      image_url: fabric?.image_url || '',
      is_active: fabric ? fabric.is_active : true,
    })
  }, [fabric, form])

  const onSubmit = async (values: FabricFormData) => {
    setIsSaving(true)
    try {
      const result = await saveFabric(values)
      if (result.error) {
        toast.error(result.error)
        return
      }

      await syncAllVariants()
      
      toast.success(fabric ? 'Tecido atualizado com sucesso!' : 'Tecido criado com sucesso!')
      onClose()
    } catch (error: any) {
      toast.error('Erro inesperado: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `fabrics/${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(fileName, file)

      if (uploadError) throw new Error(uploadError.message)

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(fileName)

      form.setValue('image_url', publicUrl, { shouldValidate: true })
      toast.success('Imagem enviada com sucesso!')
    } catch (error: any) {
      toast.error('Erro ao fazer upload da imagem: ' + error.message)
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[600px] !w-[95vw] sm:!w-[90vw] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 border-b">
          <DialogTitle className="font-[family-name:var(--font-heading)] text-2xl text-navy">
            {fabric ? 'Editar Tecido' : 'Novo Tecido'}
          </DialogTitle>
        </DialogHeader>

        <form id="fabric-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b">
              Informações Básicas
            </h3>

            <div className="space-y-2">
              <Label className="text-navy font-medium">Nome *</Label>
              <Input 
                {...form.register('name')} 
                placeholder="Ex: Suede" 
                className="bg-white/60" 
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-navy font-medium">Descrição</Label>
              <Textarea 
                {...form.register('description')} 
                placeholder="Descrição do tecido..." 
                className="bg-white/60 resize-none" 
                rows={2} 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-navy font-medium">Imagem Principal do Tecido (Opcional)</Label>
              {form.watch('image_url') ? (
                <div className="relative w-full h-32 rounded-xl overflow-hidden border group">
                  <img src={form.watch('image_url') || ''} alt="Preview do Tecido" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="icon"
                      onClick={() => form.setValue('image_url', '', { shouldValidate: true })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full">
                  <label htmlFor="fabric-image-upload" className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer bg-white/40 hover:bg-white/60 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-6 h-6 mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-navy">Fazer upload</span> ou arraste a imagem
                      </p>
                    </div>
                    <input id="fabric-image-upload" type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={handleImageUpload} />
                  </label>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-navy font-medium">Adicional de Preço (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  {...form.register('price_modifier', { valueAsNumber: true })} 
                  placeholder="0,00" 
                  className="bg-white/60" 
                />
                {form.formState.errors.price_modifier && (
                  <p className="text-sm text-red-500">{form.formState.errors.price_modifier.message}</p>
                )}
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <div className="flex items-center gap-2 mb-2">
                  <Switch 
                    checked={form.watch('is_active')} 
                    onCheckedChange={(val) => form.setValue('is_active', val)} 
                  />
                  <Label className="font-medium text-navy">Visível no Catálogo</Label>
                </div>
              </div>
            </div>
          </div>
        </form>

        <DialogFooter className="px-6 pb-6 pt-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={isSaving || isUploading}>
            Cancelar
          </Button>
          <Button type="submit" form="fabric-form" className="gradient-navy border-0 text-white min-w-[120px]" disabled={isSaving || isUploading}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : fabric ? 'Salvar Alterações' : 'Criar Tecido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
