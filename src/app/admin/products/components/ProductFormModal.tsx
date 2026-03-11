import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploader } from './ImageUploader';
import { productSchema, type ProductFormData } from '../schema';
import type { Category, ProductImage as DBProductImage } from '@/lib/types';
import type { ProductWithDetails } from './ProductList';

interface ProductFormModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    categories: Category[];
    editingProduct: ProductWithDetails | null;
    saving: boolean;
    onSave: (
        data: ProductFormData,
        newImageFiles: File[],
        imagesToDelete: string[],
        primaryImageId: string | null
    ) => Promise<void>;
}

export function ProductFormModal({
    isOpen,
    onOpenChange,
    categories,
    editingProduct,
    saving,
    onSave,
}: ProductFormModalProps) {
    const form = useForm<ProductFormData>({
        resolver: zodResolver(productSchema) as any,
        defaultValues: {
            name: '',
            description: '',
            category_id: '',
            size: '',
            base_price: 0,
            is_active: true,
            is_featured: false,
        }
    });

    const { register, handleSubmit, setValue, watch, reset, formState: { errors, isDirty } } = form;

    // Image state
    const [existingImages, setExistingImages] = useState<DBProductImage[]>([]);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
    const [primaryImageId, setPrimaryImageId] = useState<string | null>(null);

    // Initialize form when opening/editing
    useEffect(() => {
        if (isOpen) {
            if (editingProduct) {
                reset({
                    name: editingProduct.name,
                    description: editingProduct.description || '',
                    category_id: editingProduct.category_id || '',
                    size: editingProduct.size || '',
                    base_price: editingProduct.base_price,
                    is_active: editingProduct.is_active,
                    is_featured: editingProduct.is_featured,
                });

                setExistingImages(editingProduct.images || []);
                const primary = editingProduct.images?.find((i: DBProductImage) => i.is_primary);
                setPrimaryImageId(primary ? primary.id : editingProduct.images?.[0]?.id || null);
            } else {
                reset({
                    name: '',
                    description: '',
                    category_id: categories[0]?.id || '',
                    size: '',
                    base_price: 0,
                    is_active: true,
                    is_featured: false,
                });
                setExistingImages([]);
                setPrimaryImageId(null);
            }
            setNewImageFiles([]);
            setPreviewUrls([]);
            setImagesToDelete([]);
        }
    }, [isOpen, editingProduct, reset, categories]);

    const handleOpenChange = (open: boolean) => {
        if (!open && isDirty) {
            if (!confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
                return;
            }
        }
        onOpenChange(open);
    };

    const onSubmit = async (data: ProductFormData) => {
        await onSave(data, newImageFiles, imagesToDelete, primaryImageId);
        // We do not close the modal here directly; assuming orchestrator closes it on success
    };

    // Images Handlers
    const handleAddFiles = (files: File[]) => {
        setNewImageFiles(prev => [...prev, ...files]);
        const newPreviews = files.map(f => URL.createObjectURL(f));
        setPreviewUrls(prev => {
            const upds = [...prev, ...newPreviews];
            if (!primaryImageId && existingImages.length === 0 && prev.length === 0) {
                setPrimaryImageId(`new_0`);
            }
            return upds;
        });
    };

    const handleRemoveExisting = (id: string) => {
        setExistingImages(prev => prev.filter(img => img.id !== id));
        setImagesToDelete(prev => [...prev, id]);
        if (primaryImageId === id) setPrimaryImageId(null);
    };

    const handleRemoveNew = (index: number) => {
        setNewImageFiles(prev => prev.filter((_, i) => i !== index));
        setPreviewUrls(prev => prev.filter((_, i) => i !== index));
        if (primaryImageId === `new_${index}`) setPrimaryImageId(null);
    };

    const categoryIdValue = watch('category_id') || undefined;
    const isActiveValue = watch('is_active');
    const isFeaturedValue = watch('is_featured');

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-[1000px]! w-[95vw]! sm:w-[90vw]! max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2 border-b">
                    <DialogTitle className="font-heading text-2xl text-navy">
                        {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                        {/* Left Column: Form Details */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b">Informações Básicas</h3>

                            <div className="space-y-2">
                                <Label className="text-navy font-medium">Nome do Produto *</Label>
                                <Input {...register('name')} placeholder="Ex: Sofá Retrátil Florença" className="bg-white/60" />
                                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Categoria *</Label>
                                    <Select 
                                        value={categoryIdValue} 
                                        onValueChange={(v) => setValue('category_id', v || '', { shouldDirty: true })}
                                    >
                                        <SelectTrigger className="bg-white/60">
                                            <SelectValue placeholder="Selecione">
                                                {categoryIdValue ? categories.find(c => c.id === categoryIdValue)?.name || 'Selecione' : 'Selecione'}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    {errors.category_id && <p className="text-xs text-red-500">{errors.category_id.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Preço Base (R$) *</Label>
                                    <Input {...register('base_price')} type="text" placeholder="0.00" className="bg-white/60" />
                                    {errors.base_price && <p className="text-xs text-red-500">{errors.base_price.message}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-navy font-medium">Tamanho / Dimensões</Label>
                                <Input {...register('size')} placeholder="Ex: 3 Lugares (2.50m x 1.10m)" className="bg-white/60" />
                                <p className="text-[11px] text-muted-foreground">Informe as medidas descritivas para facilitar a escolha do lojista.</p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-navy font-medium">Descrição Detalhada</Label>
                                <Textarea {...register('description')} placeholder="Descreva os diferenciais, espumas utilizadas, etc..." className="bg-white/60 resize-none" rows={4} />
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-white/40">
                                    <Switch 
                                        checked={isActiveValue} 
                                        onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })} 
                                        id="active-mode" 
                                    />
                                    <Label htmlFor="active-mode" className="cursor-pointer">Ativo na Loja</Label>
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-white/40">
                                    <Switch 
                                        checked={isFeaturedValue} 
                                        onCheckedChange={(v) => setValue('is_featured', v, { shouldDirty: true })} 
                                        id="featured-mode" 
                                    />
                                    <Label htmlFor="featured-mode" className="cursor-pointer">Destaque</Label>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Images Gallery */}
                        <ImageUploader 
                            existingImages={existingImages}
                            newImageFiles={newImageFiles}
                            previewUrls={previewUrls}
                            primaryImageId={primaryImageId}
                            onAddFiles={handleAddFiles}
                            onRemoveExisting={handleRemoveExisting}
                            onRemoveNew={handleRemoveNew}
                            onSetPrimary={setPrimaryImageId}
                        />
                    </div>
                </div>

                <DialogFooter className="px-6 pb-6 pt-4 border-t bg-muted/10">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
                    <Button type="button" className="gradient-navy border-0 text-white min-w-[120px]" onClick={handleSubmit(onSubmit)} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
