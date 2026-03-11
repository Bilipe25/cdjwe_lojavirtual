'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, UploadCloud, X } from 'lucide-react'
import Image from 'next/image'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import type { FabricColor } from '@/lib/types'
import { fabricColorSchema, type FabricColorFormData } from '../schema'
import { saveColor } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { syncAllVariants } from '../../actions/variants'

interface ColorFormProps {
  isOpen: boolean
  onClose: () => void
  color: FabricColor | null
  fabricId: string
}

export function ColorForm({ isOpen, onClose, color, fabricId }: ColorFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  // Local preview state for responsive UI before uploading directly to Supabase storage
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  const supabase = createClient()

  const form = useForm<FabricColorFormData>({
    resolver: zodResolver(fabricColorSchema),
    defaultValues: {
      id: color?.id,
      fabric_id: fabricId,
      name: color?.name || '',
      hex_code: color?.hex_code || '#8B7355',
      image_url: color?.image_url || '',
      is_active: color ? color.is_active : true,
    },
  })

  // Update form when color prop changes
  useEffect(() => {
    form.reset({
      id: color?.id,
      fabric_id: fabricId,
      name: color?.name || '',
      hex_code: color?.hex_code || '#8B7355',
      image_url: color?.image_url || '',
      is_active: color ? color.is_active : true,
    })
    setLocalImagePreview(color?.image_url || null)
    setSelectedFile(null)
  }, [color, fabricId, form])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setLocalImagePreview(URL.createObjectURL(file))
      form.setValue('image_url', '', { shouldValidate: true }) // Clears the existing validated URL because we have a new file
    }
  }

  const removeImage = () => {
    setSelectedFile(null)
    setLocalImagePreview(null)
    form.setValue('image_url', '', { shouldValidate: true }) // Clears the schema value
  }

  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `colors/${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(fileName, file)

    if (uploadError) throw new Error(uploadError.message)

    const { data: { publicUrl } } = supabase.storage
      .from('products')
      .getPublicUrl(fileName)
      
    return publicUrl
  }

  const onSubmit = async (values: FabricColorFormData) => {
    setIsSaving(true)
    try {
      let finalImageUrl = values.image_url

      if (selectedFile) {
        setIsUploading(true)
        const uploadedUrl = await uploadImageToStorage(selectedFile)
        setIsUploading(false)
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl
          values.image_url = uploadedUrl
        } else {
           throw new Error('Falha no upload da textura real.')
        }
      }

      const result = await saveColor(values)
      if (result.error) {
        toast.error(result.error)
        return
      }

      await syncAllVariants()
      
      toast.success(color ? 'Cor atualizada com sucesso!' : 'Cor criada com sucesso!')
      onClose()
    } catch (error: any) {
      toast.error('Erro ao salvar cor: ' + error.message)
      setIsUploading(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[700px] !w-[95vw] sm:!w-[90vw] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 border-b">
          <DialogTitle className="font-[family-name:var(--font-heading)] text-2xl text-navy">
            {color ? 'Editar Cor' : 'Nova Cor'}
          </DialogTitle>
        </DialogHeader>

        <form id="color-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 pb-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {/* Left Column: Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b">Configurações</h3>
              
              <div className="space-y-2">
                <Label className="text-navy font-medium">Nome *</Label>
                <Input 
                  {...form.register('name')} 
                  placeholder="Ex: Bege Dourado" 
                  className="bg-white/60" 
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-navy font-medium">Cor de Fundo (Hex)</Label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={form.watch('hex_code') || '#000000'}
                    onChange={(e) => form.setValue('hex_code', e.target.value)} 
                    className="h-10 w-14 rounded border cursor-pointer" 
                  />
                  <Input 
                    {...form.register('hex_code')} 
                    className="bg-white/60 flex-1 font-mono uppercase" 
                    placeholder="#000000" 
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Essa cor será exibida se você não anexar uma foto (textura).</p>
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <Switch 
                  checked={form.watch('is_active')} 
                  onCheckedChange={(val) => form.setValue('is_active', val)} 
                />
                <Label className="font-medium text-navy">Visível no Catálogo</Label>
              </div>
            </div>

            {/* Right Column: Image */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b">
                Amostra (Textura)
              </h3>

              <div className="grid gap-4">
                {localImagePreview ? (
                  <div className="relative aspect-square rounded-xl overflow-hidden border bg-muted/30 max-h-[220px] max-w-[220px]">
                    <Image src={localImagePreview} alt="Amostra da Cor" fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button type="button" size="sm" variant="destructive" onClick={removeImage} className="gap-2">
                        <X className="h-4 w-4" /> Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Label className="relative aspect-square max-h-[220px] max-w-[220px] rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-bronze hover:bg-bronze/5 transition-colors flex flex-col items-center justify-center cursor-pointer text-muted-foreground hover:text-bronze">
                    <UploadCloud className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-sm font-medium text-center px-4">Adicionar Foto Real do Tecido</span>
                    <span className="text-xs opacity-70 mt-1 px-4 text-center">JPG ou PNG (Quadrado)</span>
                    <Input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageChange}
                      disabled={isUploading}
                    />
                  </Label>
                )}
              </div>
            </div>
          </div>
        </form>

        <DialogFooter className="px-6 pb-6 pt-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={isSaving || isUploading}>Cancelar</Button>
          <Button type="submit" form="color-form" className="gradient-navy border-0 text-white min-w-[120px]" disabled={isSaving || isUploading}>
            {(isSaving || isUploading) ? <Loader2 className="h-4 w-4 animate-spin" /> : color ? 'Salvar Alterações' : 'Criar Cor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
