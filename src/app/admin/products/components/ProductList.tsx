import { motion } from 'framer-motion';
import { Package, MoreHorizontal, Edit, Trash2, ImageIcon, Star, CheckSquare, Square } from 'lucide-react';
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
}

export function ProductList({
    products,
    loading,
    selectedProducts,
    onToggleSelect,
    onEdit,
    onDelete,
    onEmptyAction
}: ProductListProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Card key={i} className="glass-card border-0">
                        <CardContent className="p-4">
                            <Skeleton className="h-48 w-full rounded-lg mb-3" />
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-4 w-1/2 mt-2" />
                        </CardContent>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product, i) => {
                const primaryImg = product.images?.find(img => img.is_primary) || product.images?.[0];
                const imgCount = product.images?.length || 0;
                const isSelected = selectedProducts.includes(product.id);

                return (
                    <motion.div key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                        <Card className={`glass-card border-0 hover:shadow-lg transition-all duration-300 overflow-hidden ${!product.is_active ? 'opacity-70 grayscale-30' : ''} ${isSelected ? 'ring-2 ring-bronze' : ''}`}>
                            <div className="relative h-48 bg-muted group cursor-pointer" onClick={() => onToggleSelect(product.id)}>
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
                            
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                    <div className="min-w-0 pr-2">
                                        <h3 className="font-semibold text-lg text-navy truncate" title={product.name}>{product.name}</h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-xs font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[120px]">
                                                {product.category?.name || 'Sem Categoria'}
                                            </span>
                                            {product.size && (
                                                <span className="text-[10px] text-muted-foreground truncate">
                                                    Tam: {product.size}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xl font-bold text-gradient-bronze mt-2">
                                            R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy shrink-0 -mr-2" />}>
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
            })}
        </div>
    );
}
