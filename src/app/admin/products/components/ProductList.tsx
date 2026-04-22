import { motion } from 'framer-motion';
import { Package, MoreHorizontal, Edit, Trash2, ImageIcon, Star, CheckSquare, Square, ShieldAlert } from 'lucide-react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Product, Category, ProductImage as DBProductImage } from '@/lib/types';

export type ProductWithDetails = Product & { category?: Category; images?: DBProductImage[] };

interface ProductListProps {
    products: ProductWithDetails[];
    loading: boolean;
    selectedProducts: string[];
    onToggleSelect: (id: string) => void;
    onEdit: (product: ProductWithDetails) => void;
    onDelete: (id: string, name: string) => void;
    onEmptyAction: () => void;
    layout: 'grid' | 'list';
}

export function ProductList({
    products,
    loading,
    selectedProducts,
    onToggleSelect,
    onEdit,
    onDelete,
    onEmptyAction,
    layout
}: ProductListProps) {
    if (loading) {
        return (
            <div className={layout === 'grid' ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4" : "flex flex-col gap-3"}>
                {Array.from({ length: layout === 'grid' ? 8 : 4 }).map((_, i) => (
                    <Card key={i} className={`glass-card border-0 ${layout === 'list' ? 'flex h-24' : ''}`}>
                        {layout === 'grid' ? (
                            <CardContent className="p-2 sm:p-4 w-full">
                                <Skeleton className="h-32 sm:h-48 w-full rounded-lg mb-3" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2 mt-2" />
                            </CardContent>
                        ) : (
                            <CardContent className="p-0 w-full flex items-center gap-4 pr-4">
                                <Skeleton className="h-24 w-24 rounded-l-lg rounded-r-none shrink-0" />
                                <div className="flex-1 py-4">
                                    <Skeleton className="h-5 w-1/3 mb-2" />
                                    <Skeleton className="h-4 w-1/4" />
                                </div>
                                <Skeleton className="h-8 w-8 rounded-md" />
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Package className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Nenhum produto encontrado</h3>
                <p className="text-muted-foreground text-sm mt-1">Nenhum resultado para os filtros atuais ou não há produtos criados.</p>
                <Button className="mt-6 gradient-bronze border-0 text-white" onClick={onEmptyAction}>
                    Criar Produto
                </Button>
            </div>
        );
    }

    return (
        <div className={layout === 'grid' ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4" : "flex flex-col gap-3"}>
            {products.map((product, i) => {
                const primaryImg = product.images?.find(img => img.is_primary) || product.images?.[0];
                const imgCount = product.images?.length || 0;
                const isSelected = selectedProducts.includes(product.id);

                if (layout === 'list') {
                    return (
                        <motion.div key={product.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                            <Card 
                                className={`glass-card border-0 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-row items-stretch h-24 cursor-pointer ${!product.is_active ? 'opacity-70 grayscale-30' : ''} ${isSelected ? 'ring-2 ring-bronze' : ''}`}
                                onClick={() => onEdit(product)}
                            >
                                <div className="relative w-24 bg-muted group shrink-0">
                                    {primaryImg ? (
                                        <Image src={primaryImg.url} alt={product.name} fill className="object-cover select-none" />
                                    ) : (
                                        <div className="h-full flex items-center justify-center bg-navy/5"><ImageIcon className="h-6 w-6 text-navy/20" /></div>
                                    )}

                                    {/* Selection Checkbox */}
                                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onToggleSelect(product.id); }}
                                            className="h-8 w-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur shadow-sm hover:bg-white"
                                        >
                                            {isSelected ? <CheckSquare className="h-5 w-5 text-bronze" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                                        </button>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute inset-0 bg-bronze/20 flex items-center justify-center pointer-events-none">
                                            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-white shadow-sm">
                                                <CheckSquare className="h-5 w-5 text-bronze" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <CardContent className="p-4 flex-1 flex items-center justify-between min-w-0">
                                    <div className="flex-1 min-w-0 pr-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                        <div className="min-w-0 col-span-1 md:col-span-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-base text-navy truncate" title={product.name}>{product.name}</h3>
                                                {!product.is_active && <Badge className="bg-red-500/90 text-[10px] px-1 py-0 h-4 text-white">Inativo</Badge>}
                                                {product.is_featured && <Star className="h-3 w-3 fill-bronze text-bronze" />}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                {product.commercial_code && (
                                                    <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded truncate max-w-[160px]">
                                                        Cod: {product.commercial_code}
                                                    </span>
                                                )}
                                                <span className="text-[11px] font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[150px]">
                                                    {product.category?.name || 'Sem Categoria'}
                                                </span>
                                                {product.tax_profile_id ? (
                                                    <span className="text-[11px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded truncate max-w-[160px]">
                                                        Fiscal: {product.tax_profile?.code || 'Perfil vinculado'}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                                        <ShieldAlert className="h-3 w-3" />
                                                        Sem perfil fiscal
                                                    </span>
                                                )}
                                                {product.has_size_variants && (
                                                    <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                                        Tamanhos
                                                    </span>
                                                )}
                                                {product.size && (
                                                    <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                                                        Tam: {product.size}
                                                    </span>
                                                )}
                                                {imgCount > 1 && <span className="text-[10px] text-muted-foreground"><ImageIcon className="h-3 w-3 inline mr-0.5" />{imgCount}</span>}
                                            </div>
                                        </div>
                                        <div className="hidden md:flex justify-end pr-4">
                                            <p className="text-lg font-bold text-gradient-bronze whitespace-nowrap">
                                                R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center md:hidden pr-4">
                                        <p className="text-base font-bold text-gradient-bronze whitespace-nowrap">
                                            R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>

                                    <div onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy shrink-0" />}>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(product)}><Edit className="h-4 w-4 mr-2" /> Editar / Fotos</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => onDelete(product.id, product.name)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                }

                // Grid Layout
                return (
                    <motion.div key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                        <Card 
                            className={`glass-card border-0 hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer ${!product.is_active ? 'opacity-70 grayscale-30' : ''} ${isSelected ? 'ring-2 ring-bronze' : ''}`}
                            onClick={() => onEdit(product)}
                        >
                            <div className="relative h-32 sm:h-48 bg-muted group">
                                {primaryImg ? (
                                    <Image src={primaryImg.url} alt={product.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105 select-none" />
                                ) : (
                                    <div className="h-full flex items-center justify-center bg-navy/5"><ImageIcon className="h-12 w-12 text-navy/20" /></div>
                                )}

                                {/* Selection Checkbox */}
                                <div className="absolute top-2 left-2 z-10 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onToggleSelect(product.id); }}
                                        className="h-8 w-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur shadow-sm hover:bg-white"
                                    >
                                        {isSelected ? <CheckSquare className="h-5 w-5 text-bronze" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                                    </button>
                                </div>

                                <div className="absolute top-2 right-2 flex flex-col gap-2 items-end">
                                    {product.is_featured && <Badge className="gradient-bronze border-0 text-white shadow-sm"><Star className="h-3 w-3 mr-1 fill-white" /> Destaque</Badge>}
                                    {imgCount > 1 && <Badge variant="secondary" className="shadow-sm bg-white/90 text-navy backdrop-blur-sm"><ImageIcon className="h-3 w-3 mr-1" /> {imgCount}</Badge>}
                                </div>

                                {!product.is_active && <Badge className="absolute bottom-2 left-2 bg-red-500/90 text-white">Inativo</Badge>}
                            </div>
                            
                            <CardContent className="p-2 sm:p-4 mt-auto">
                                <div className="flex items-start justify-between">
                                    <div className="min-w-0 pr-1 flex-1">
                                        <h3 className="font-semibold text-sm sm:text-lg text-navy truncate" title={product.name}>{product.name}</h3>
                                        <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                                            {product.commercial_code && (
                                                <span className="text-[9px] sm:text-[10px] font-medium bg-slate-100 text-slate-700 px-1 py-0.5 rounded truncate max-w-[120px]">
                                                    {product.commercial_code}
                                                </span>
                                            )}
                                            <span className="text-[10px] sm:text-xs font-medium bg-muted px-1 sm:px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[80px] sm:max-w-[120px]">
                                                {product.category?.name || 'Sem Categoria'}
                                            </span>
                                            {product.tax_profile_id ? (
                                                <span className="text-[9px] sm:text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded truncate max-w-[110px]">
                                                    {product.tax_profile?.code || 'Fiscal'}
                                                </span>
                                            ) : (
                                                <span className="text-[9px] sm:text-[10px] font-medium bg-amber-50 text-amber-700 px-1 py-0.5 rounded inline-flex items-center gap-1">
                                                    <ShieldAlert className="h-3 w-3" />
                                                    Sem fiscal
                                                </span>
                                            )}
                                            {product.has_size_variants && (
                                                <span className="text-[9px] sm:text-[10px] font-medium bg-blue-50 text-blue-700 px-1 py-0.5 rounded">
                                                    Tamanhos
                                                </span>
                                            )}
                                            {product.size && (
                                                <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
                                                    {product.size}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm sm:text-xl font-bold text-gradient-bronze mt-1 sm:mt-2">
                                            R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-navy -mr-1" />}>
                                                <MoreHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(product)}><Edit className="h-4 w-4 mr-2" /> Editar / Fotos</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => onDelete(product.id, product.name)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                );
            })}
        </div>
    );
}
