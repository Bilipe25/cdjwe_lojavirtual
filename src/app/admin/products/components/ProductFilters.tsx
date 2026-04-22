import { Search, LayoutGrid, List as ListIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Category } from '@/lib/types';

interface ProductFiltersProps {
    search: string;
    onSearchChange: (val: string) => void;
    categoryFilter: string;
    onCategoryChange: (val: string) => void;
    categories: Category[];
    selectedCount: number;
    onBulkActivate: () => void;
    onBulkDeactivate: () => void;
    onBulkDelete: () => void;
    layout: 'grid' | 'list';
    onLayoutChange: (layout: 'grid' | 'list') => void;
}

export function ProductFilters({
    search,
    onSearchChange,
    categoryFilter,
    onCategoryChange,
    categories,
    selectedCount,
    onBulkActivate,
    onBulkDeactivate,
    onBulkDelete,
    layout,
    onLayoutChange
}: ProductFiltersProps) {
    return (
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-start md:items-center bg-white/60 p-3 md:p-4 rounded-xl border shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex flex-1 w-full gap-3 items-center">
                <div className="relative w-full lg:max-w-sm order-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome ou codigo comercial..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-10 md:h-11 bg-white"
                    />
                </div>
                
                <div className="flex gap-2 order-2">
                    <Select value={categoryFilter} onValueChange={(v) => v && onCategoryChange(v)}>
                        <SelectTrigger className="flex-1 sm:w-48 h-10 md:h-11 bg-white">
                            <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as Categorias</SelectItem>
                            {categories.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    <div className="flex border rounded-md overflow-hidden bg-white shrink-0 shadow-sm">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`rounded-none h-10 w-10 md:h-11 md:w-11 ${layout === 'grid' ? 'bg-muted text-navy' : 'text-muted-foreground'}`}
                            onClick={() => onLayoutChange('grid')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`rounded-none h-10 w-10 md:h-11 md:w-11 ${layout === 'list' ? 'bg-muted text-navy' : 'text-muted-foreground'}`}
                            onClick={() => onLayoutChange('list')}
                        >
                            <ListIcon className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {selectedCount > 0 && (
                <div className="flex items-center gap-2 bg-bronze/10 px-3 py-2 rounded-lg border border-bronze/20 w-full md:w-auto overflow-x-auto">
                    <span className="text-sm font-medium text-bronze whitespace-nowrap">{selectedCount} selecionados</span>
                    <div className="h-4 w-px bg-bronze/20 mx-1" />
                    <Button size="sm" variant="ghost" className="h-8 text-green-700 hover:text-green-800 hover:bg-green-100 px-2" onClick={onBulkActivate}>
                        Ativar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-orange-700 hover:text-orange-800 hover:bg-orange-100 px-2" onClick={onBulkDeactivate}>
                        Desativar
                    </Button>
                    <div className="h-4 w-px bg-bronze/20 mx-1" />
                    <Button size="sm" variant="ghost" className="h-8 text-red-700 hover:text-red-800 hover:bg-red-100 px-2" onClick={onBulkDelete}>
                        Excluir
                    </Button>
                </div>
            )}
        </div>
    );
}
