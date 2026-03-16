import { useEffect, useState, useRef } from 'react';
import { useFieldArray, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    ArrowDown,
    ArrowUp,
    Loader2,
    Info,
    Palette,
    Plus,
    Ruler,
    Trash2,
} from 'lucide-react';
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
import { ProductFabricConfig } from './ProductFabricConfig';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

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
        primaryImageId: string | null,
        activeVariantIds: string[],
        variantPriceOverrides: Record<string, number | null>,
        options: { variantConfigTouched: boolean; variantPricingTouched: boolean }
    ) => Promise<void>;
}

type ActiveTab = 'info' | 'fabrics';

export function ProductFormModal({
    isOpen,
    onOpenChange,
    categories,
    editingProduct,
    saving,
    onSave,
}: ProductFormModalProps) {
    const form = useForm<ProductFormData>({
        resolver: zodResolver(productSchema) as Resolver<ProductFormData>,
        defaultValues: {
            name: '',
            description: '',
            category_id: '',
            size: '',
            has_size_variants: false,
            size_options: [],
            base_price: 0,
            is_active: true,
            is_featured: false,
        }
    });

    const { register, handleSubmit, setValue, reset, getValues, formState: { errors, isDirty } } = form;
    const {
        fields: sizeOptionFields,
        append: appendSizeOption,
        remove: removeSizeOption,
        move: moveSizeOption,
    } = useFieldArray({
        control: form.control,
        name: 'size_options',
    });

    // Image state
    const [existingImages, setExistingImages] = useState<DBProductImage[]>([]);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
    const [primaryImageId, setPrimaryImageId] = useState<string | null>(null);

    // Fabric/Color config state
    const [activeVariantIds, setActiveVariantIds] = useState<string[]>([]);
    const [variantPriceOverrides, setVariantPriceOverrides] = useState<Record<string, number | null>>({});
    const [activeTab, setActiveTab] = useState<ActiveTab>('info');
    // Track if the fabric config was touched (to avoid unnecessary saves)
    const fabricConfigTouched = useRef(false);
    const variantPricingTouched = useRef(false);
    const previousPreviewUrlsRef = useRef<string[]>([]);

    // Initialize form when opening/editing
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setActiveTab('info');
            fabricConfigTouched.current = false;
            variantPricingTouched.current = false;
            setActiveVariantIds([]);
            setVariantPriceOverrides({});

            if (editingProduct) {
                reset({
                    name: editingProduct.name,
                    description: editingProduct.description || '',
                    category_id: editingProduct.category_id || '',
                    size: editingProduct.size || '',
                    has_size_variants: Boolean(editingProduct.has_size_variants),
                    size_options: [],
                    base_price: editingProduct.base_price,
                    is_active: editingProduct.is_active,
                    is_featured: editingProduct.is_featured,
                });

                setExistingImages(editingProduct.images || []);
                const primary = editingProduct.images?.find((i: DBProductImage) => i.is_primary);
                setPrimaryImageId(primary ? primary.id : editingProduct.images?.[0]?.id || null);

                const loadSizeOptions = async () => {
                    const supabase = createClient();
                    const { data, error } = await supabase
                        .from('product_size_options')
                        .select('id, name, price_mode, price_value, is_active, sort_order, is_default')
                        .eq('product_id', editingProduct.id)
                        .order('sort_order', { ascending: true })
                        .order('created_at', { ascending: true });

                    if (error) {
                        const message = (error.message || '').toLowerCase();
                        if (!message.includes('product_size_options')) {
                            toast.error('Falha ao carregar os tamanhos do produto.');
                        }
                        setValue('size_options', [], { shouldDirty: false });
                        return;
                    }

                    if (!data) {
                        setValue('size_options', [], { shouldDirty: false });
                        return;
                    }

                    setValue(
                        'size_options',
                        data.map((option) => ({
                            id: option.id,
                            name: option.name,
                            price_mode: option.price_mode,
                            price_value: option.price_value,
                            is_active: option.is_active,
                            sort_order: option.sort_order || 0,
                            is_default: option.is_default,
                        })),
                        { shouldDirty: false }
                    );
                };

                void loadSizeOptions();
            } else {
                reset({
                    name: '',
                    description: '',
                    category_id: categories[0]?.id || '',
                    size: '',
                    has_size_variants: false,
                    size_options: [],
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
    }, [isOpen, editingProduct, reset, categories, setValue]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleOpenChange = (open: boolean) => {
        if (!open && isDirty) {
            if (!confirm('Voce tem alteracoes nao salvas. Deseja realmente fechar?')) {
                return;
            }
        }
        onOpenChange(open);
    };

    const handleVariantChange = (payload: { activeVariantIds: string[]; priceOverrides: Record<string, number | null> }) => {
        setActiveVariantIds(payload.activeVariantIds);
        setVariantPriceOverrides(payload.priceOverrides);
        fabricConfigTouched.current = true;
        variantPricingTouched.current = true;
    };

    const onSubmit = async (data: ProductFormData) => {
        const normalizedSizeOptions = (data.size_options || []).map((option, index) => ({
            ...option,
            sort_order: index,
        }));

        if (data.has_size_variants) {
            if (normalizedSizeOptions.length === 0) {
                toast.error('Adicione ao menos 1 opcao de tamanho ativa.');
                return;
            }
            if (!normalizedSizeOptions.some((option) => option.is_active)) {
                toast.error('Ative ao menos 1 tamanho para continuar.');
                return;
            }
        }

        const requestedDefaultIndex = normalizedSizeOptions.findIndex(
            (option) => option.is_default && option.is_active
        );
        const fallbackDefaultIndex = normalizedSizeOptions.findIndex((option) => option.is_active);
        const resolvedDefaultIndex =
            requestedDefaultIndex >= 0 ? requestedDefaultIndex : fallbackDefaultIndex;
        const normalizedWithDefault = normalizedSizeOptions.map((option, index) => ({
            ...option,
            is_default:
                normalizedSizeOptions.length > 0
                    ? index === (resolvedDefaultIndex >= 0 ? resolvedDefaultIndex : 0)
                    : false,
        }));

        await onSave(
            {
                ...data,
                size_options: data.has_size_variants ? normalizedWithDefault : [],
            },
            newImageFiles,
            imagesToDelete,
            primaryImageId,
            fabricConfigTouched.current ? activeVariantIds : [],
            variantPricingTouched.current ? variantPriceOverrides : {},
            {
                variantConfigTouched: fabricConfigTouched.current,
                variantPricingTouched: variantPricingTouched.current,
            }
        );
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
        setPrimaryImageId((current) => {
            if (!current?.startsWith('new_')) return current;
            const currentIndex = Number(current.replace('new_', ''));
            if (!Number.isFinite(currentIndex)) return current;
            if (currentIndex === index) return null;
            if (currentIndex > index) return `new_${currentIndex - 1}`;
            return current;
        });
    };

    useEffect(() => {
        const previousUrls = previousPreviewUrlsRef.current;
        previousUrls.forEach((url) => {
            if (!previewUrls.includes(url)) URL.revokeObjectURL(url);
        });
        previousPreviewUrlsRef.current = previewUrls;
    }, [previewUrls]);

    useEffect(() => {
        return () => {
            previousPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    const categoryIdValue = useWatch({ control: form.control, name: 'category_id' }) || undefined;
    const isActiveValue = useWatch({ control: form.control, name: 'is_active' }) ?? false;
    const isFeaturedValue = useWatch({ control: form.control, name: 'is_featured' }) ?? false;
    const hasSizeVariantsValue = useWatch({ control: form.control, name: 'has_size_variants' }) ?? false;
    const sizeOptionsValue = useWatch({ control: form.control, name: 'size_options' }) ?? [];
    const activeSizeOptionsCount = sizeOptionsValue.filter((option) => option?.is_active).length;
    const defaultSizeOptionName =
        sizeOptionsValue.find((option) => option?.is_default)?.name || sizeOptionsValue[0]?.name || null;

    const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
        { id: 'info', label: 'Informacoes', icon: <Info className="h-3.5 w-3.5" /> },
        { id: 'fabrics', label: 'Tecidos & Cores', icon: <Palette className="h-3.5 w-3.5" /> },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-full! sm:max-w-[90vw]! md:max-w-[1000px]! w-full sm:w-[90vw]! h-dvh sm:h-[90vh] md:max-h-[90vh] flex flex-col p-0 overflow-hidden border-0 sm:border rounded-none sm:rounded-xl">
                <DialogHeader className="px-4 md:px-6 pt-6 pb-0 border-b">
                    <DialogTitle className="font-heading text-xl md:text-2xl text-navy mb-3">
                        {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                    </DialogTitle>

                    {/* Tabs */}
                    <div className="flex gap-0 sm:gap-1 -mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                                    ${activeTab === tab.id
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                                    }
                                `}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-2">
                    {/* Tab: Informacoes */}
                    {activeTab === 'info' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            {/* Left Column: Form Details */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b">Informacoes Basicas</h3>

                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Nome do Produto *</Label>
                                    <Input {...register('name')} placeholder="Ex: Sofa Retratil Florenca" className="bg-white/60" />
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
                                        <Label className="text-navy font-medium">Preco Base (R$) *</Label>
                                        <Input {...register('base_price')} type="text" placeholder="0.00" className="bg-white/60" />
                                        {errors.base_price && <p className="text-xs text-red-500">{errors.base_price.message}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Tamanho / Dimensoes</Label>
                                    <Input {...register('size')} placeholder="Ex: 3 Lugares (2.50m x 1.10m)" className="bg-white/60" />
                                    <p className="text-[11px] text-muted-foreground">Informe as medidas descritivas para facilitar a escolha do lojista.</p>
                                </div>

                                <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <Label className="text-sm font-semibold text-navy">Variacoes por tamanho</Label>
                                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                                Quando ativo, o cliente precisa escolher o tamanho antes de tecido/cor.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={hasSizeVariantsValue}
                                            onCheckedChange={(value) =>
                                                setValue('has_size_variants', value, { shouldDirty: true })
                                            }
                                        />
                                    </div>

                                    {hasSizeVariantsValue && (
                                        <div className="space-y-2.5">
                                            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5">
                                                <div className="flex items-center justify-between gap-3">
                                                    <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                                                        Opcoes de tamanho
                                                    </Label>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 gap-1 px-2.5 text-[11px]"
                                                        onClick={() =>
                                                            appendSizeOption({
                                                                name: '',
                                                                price_mode: 'delta',
                                                                price_value: 0,
                                                                is_active: true,
                                                                sort_order: sizeOptionFields.length,
                                                                is_default: sizeOptionFields.length === 0,
                                                            })
                                                        }
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                        Adicionar
                                                    </Button>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                                        {sizeOptionFields.length} cadastrados
                                                    </span>
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                                        {activeSizeOptionsCount} ativos
                                                    </span>
                                                    {defaultSizeOptionName && (
                                                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
                                                            Padrao: {defaultSizeOptionName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {sizeOptionFields.length === 0 && (
                                                <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-xs text-muted-foreground">
                                                    Nenhum tamanho configurado ainda.
                                                </div>
                                            )}

                                            <div className="space-y-1.5">
                                                {sizeOptionFields.map((field, index) => {
                                                    const option = sizeOptionsValue[index];
                                                    return (
                                                        <div
                                                            key={field.id}
                                                            className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
                                                        >
                                                            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[1.5fr_130px_120px_auto]">
                                                                <Input
                                                                    {...register(
                                                                        `size_options.${index}.name` as const
                                                                    )}
                                                                    placeholder="Ex: Solteiro, Casal, Queen"
                                                                    className="h-8 border-slate-200 bg-white text-sm"
                                                                />
                                                                <Select
                                                                    value={option?.price_mode || 'delta'}
                                                                    onValueChange={(value) =>
                                                                        setValue(
                                                                            `size_options.${index}.price_mode`,
                                                                            value as 'absolute' | 'delta',
                                                                            { shouldDirty: true }
                                                                        )
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-8 border-slate-200 bg-white text-sm">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="delta">Delta (+)</SelectItem>
                                                                        <SelectItem value="absolute">Absoluto</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                                <Input
                                                                    {...register(
                                                                        `size_options.${index}.price_value` as const
                                                                    )}
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    placeholder="0,00"
                                                                    className="h-8 border-slate-200 bg-white text-sm"
                                                                />
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                                                                    onClick={() => removeSizeOption(index)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>

                                                            <div className="mt-1.5 flex items-center justify-between">
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-muted-foreground disabled:opacity-40"
                                                                        disabled={index === 0}
                                                                        onClick={() => moveSizeOption(index, index - 1)}
                                                                    >
                                                                        <ArrowUp className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-muted-foreground disabled:opacity-40"
                                                                        disabled={index === sizeOptionFields.length - 1}
                                                                        onClick={() => moveSizeOption(index, index + 1)}
                                                                    >
                                                                        <ArrowDown className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <button
                                                                        type="button"
                                                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                                                                            option?.is_default
                                                                                ? 'bg-amber-100 text-amber-800'
                                                                                : 'bg-slate-100 text-muted-foreground hover:bg-slate-200'
                                                                        }`}
                                                                        onClick={() => {
                                                                            const current = getValues('size_options') || [];
                                                                            const next = current.map((item, itemIndex) => ({
                                                                                ...item,
                                                                                is_default: itemIndex === index,
                                                                            }));
                                                                            setValue('size_options', next, {
                                                                                shouldDirty: true,
                                                                            });
                                                                        }}
                                                                    >
                                                                        <Ruler className="h-3.5 w-3.5" />
                                                                        {option?.is_default ? 'Padrao' : 'Definir padrao'}
                                                                    </button>
                                                                </div>

                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[11px] text-muted-foreground">
                                                                            Ativo
                                                                        </span>
                                                                        <Switch
                                                                            checked={option?.is_active ?? true}
                                                                            onCheckedChange={(value) =>
                                                                                setValue(
                                                                                    `size_options.${index}.is_active`,
                                                                                    value,
                                                                                    { shouldDirty: true }
                                                                                )
                                                                            }
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Descricao Detalhada</Label>
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
                                previewUrls={previewUrls}
                                primaryImageId={primaryImageId}
                                onAddFiles={handleAddFiles}
                                onRemoveExisting={handleRemoveExisting}
                                onRemoveNew={handleRemoveNew}
                                onSetPrimary={setPrimaryImageId}
                            />
                        </div>
                    )}

                    {/* Tab: Tecidos & Cores */}
                    {activeTab === 'fabrics' && (
                        <div className="pt-4">
                            <div className="mb-3">
                                <p className="text-xs text-muted-foreground">
                                    Selecione quais combinacoes de tecido e cor estarao disponiveis para este produto.
                                    Por padrao, todas as combinacoes estao ativas.
                                </p>
                                {hasSizeVariantsValue && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Fluxo no cliente: Tamanho - Tecido - Cor. Garanta que os tamanhos estejam corretos na aba Informacoes.
                                    </p>
                                )}
                            </div>
                            <ProductFabricConfig
                                productId={editingProduct?.id}
                                onChange={handleVariantChange}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="px-4 md:px-6 pb-6 pt-4 border-t bg-muted/10">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving} className="flex-1 sm:flex-none">Cancelar</Button>
                    <Button type="button" className="gradient-navy border-0 text-white min-w-[120px] flex-1 sm:flex-none" onClick={() => { void handleSubmit(onSubmit)() }} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingProduct ? 'Salvar Alteracoes' : 'Criar Produto'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

