import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { CustomerType } from '@/lib/types';

interface CustomerFiltersProps {
    search: string;
    onSearchChange: (val: string) => void;
    statusFilter: string;
    onStatusChange: (val: string) => void;
    typeFilter: string;
    onTypeChange: (val: string) => void;
    customerTypes: CustomerType[];
    selectedCount: number;
    onBulkApprove: () => void;
    onBulkBlock: () => void;
    onBulkDelete: () => void;
}

export function CustomerFilters({
    search,
    onSearchChange,
    statusFilter,
    onStatusChange,
    typeFilter,
    onTypeChange,
    customerTypes,
    selectedCount,
    onBulkApprove,
    onBulkBlock,
    onBulkDelete
}: CustomerFiltersProps) {
    return (
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white/60 p-4 rounded-xl border shadow-sm">
            <div className="flex flex-1 w-full gap-3 items-center flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome, email, CNPJ..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-11 bg-white"
                    />
                </div>
                <Select value={statusFilter} onValueChange={(v) => v && onStatusChange(v)}>
                    <SelectTrigger className="w-full sm:w-40 h-11 bg-white">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendentes</SelectItem>
                        <SelectItem value="approved">Ativos</SelectItem>
                        <SelectItem value="blocked">Bloqueados</SelectItem>
                        <SelectItem value="imported">Importados</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => v && onTypeChange(v)}>
                    <SelectTrigger className="w-full sm:w-44 h-11 bg-white">
                        <SelectValue placeholder="Tipo de Cliente" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os Tipos</SelectItem>
                        {customerTypes.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {selectedCount > 0 && (
                <div className="flex items-center gap-2 bg-navy/5 px-3 py-2 rounded-lg border w-full md:w-auto overflow-x-auto shrink-0">
                    <span className="text-sm font-medium text-navy whitespace-nowrap">{selectedCount} selecionados</span>
                    <div className="h-4 w-px bg-border mx-1" />
                    <Button size="sm" variant="ghost" className="h-8 text-green-700 hover:text-green-800 hover:bg-green-100 px-2" onClick={onBulkApprove}>
                        Aprovar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-orange-700 hover:text-orange-800 hover:bg-orange-100 px-2" onClick={onBulkBlock}>
                        Bloquear
                    </Button>
                    <div className="h-4 w-px bg-border mx-1" />
                    <Button size="sm" variant="ghost" className="h-8 text-red-700 hover:text-red-800 hover:bg-red-100 px-2" onClick={onBulkDelete}>
                        Excluir
                    </Button>
                </div>
            )}
        </div>
    );
}
