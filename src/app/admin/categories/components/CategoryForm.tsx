'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UploadCloud, X, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Category } from '@/lib/types'
import { saveCategory } from '../actions'

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'O nome é obrigatório').max(100, 'Nome muito longo'),
  description: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean(),
})

type FormValues = z.infer<typeof categorySchema>

interface CategoryFormProps {
  isOpen: boolean
  onClose: () => void
  category: Category | null
  categories: Category[]
}

export function CategoryForm({ isOpen, onClose, category, categories }: CategoryFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const supabase = createClient()

  const form = useForm<FormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      id: category?.id,
      name: category?.name || '',
      description: category?.description || '',
      parent_id: category?.parent_id || '',
      image_url: category?.image_url || '',
      is_active: category ? category.is_active : true,
    },
  })

  // Update form when category prop changes
  useEffect(() => {
    form.reset({
      id: category?.id,
      name: category?.name || '',
      description: category?.description || '',
      parent_id: category?.parent_id || '',
      image_url: category?.image_url || '',
      is_active: category ? category.is_active : true,
    })
  }, [category, form])

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true)
    try {
      // Normalize empty select value to null
      const payload = { ...values, parent_id: values.parent_id === 'none' ? '' : values.parent_id }

      const result = await saveCategory(payload)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(category ? 'Categoria atualizada!' : 'Categoria criada com sucesso!')
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
      const fileName = `categories/${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`

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
      // Reset the file input so the same file can be selected again if needed
      e.target.value = ''
    }
  }

  // Prevent selecting itself as parent
  const availableParents = categories.filter(c => !category || c.id !== category.id)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-navy">
            {category ? 'Editar Categoria' : 'Nova Categoria'}
          </DialogTitle>
          <DialogDescription>
            Organize os produtos da loja em categorias e subcategorias.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Categoria *</Label>
            <Input
              id="name"
              {...form.register('name')}
              placeholder="Ex: Sofá Retrátil"
              className="bg-white/60"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (Visível ao cliente)</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder="Linha premium de sofás retráteis..."
              className="bg-white/60 resize-none"
              rows={2}
            />
            {form.formState.errors.description && (
              <p className="text-sm text-red-500">{form.formState.errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Imagem da Categoria (Opcional)</Label>
            {form.watch('image_url') ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border group">
                <img src={form.watch('image_url') || ''} alt="Preview" className="w-full h-full object-cover" />
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
                <label htmlFor="image-upload" className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer bg-white/40 hover:bg-white/60 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 mb-3 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold text-navy">Clique para fazer upload</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isUploading ? 'Enviando...' : 'PNG, JPG ou WEBP (Max. 2MB)'}
                    </p>
                  </div>
                  <input id="image-upload" type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={handleImageUpload} />
                </label>
              </div>
            )}
            {form.formState.errors.image_url && (
              <p className="text-sm text-red-500">{form.formState.errors.image_url.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Categoria Pai (Opcional)</Label>
            <Select 
              value={form.watch('parent_id') || 'none'} 
              onValueChange={(val) => form.setValue('parent_id', val === 'none' ? '' : val)}
            >
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (Categoria Principal)</SelectItem>
                {availableParents.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.parent_id && (
              <p className="text-sm text-red-500">{form.formState.errors.parent_id.message}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Nota: O sistema impedirá automaticamente ciclos (A → B → A).
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mb-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Status Ativo</Label>
              <p className="text-[11px] text-muted-foreground">
                Exibir esta categoria na loja
              </p>
            </div>
            <Switch
              checked={form.watch('is_active')}
              onCheckedChange={(val) => form.setValue('is_active', val)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
              {isSaving ? 'Salvando...' : 'Salvar Categoria'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
