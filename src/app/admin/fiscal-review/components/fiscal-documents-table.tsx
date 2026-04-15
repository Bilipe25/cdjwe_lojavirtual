'use client'

import { useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, FileText } from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { FiscalDocumentListItem, FiscalSortDirection, FiscalSortField } from '../types'
import { FiscalDocumentRowActions } from './fiscal-document-row-actions'
import {
  FiscalDocumentStatusBadge,
  formatCurrency,
  formatDateTime,
  formatOrderNumber,
  getEffectiveDocumentDate,
  humanizeEnvironment,
  humanizeModel,
  humanizeOrderStatus,
} from './fiscal-document-ui'

export function FiscalDocumentsTable({
  items,
  total,
  page,
  pageSize,
  loading,
  busyDocumentId,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
  onOpenDetail,
  onConsult,
  onOpenDanfe,
  onDownloadXml,
}: {
  items: FiscalDocumentListItem[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  busyDocumentId?: string | null
  sortBy: FiscalSortField
  sortDir: FiscalSortDirection
  onSortChange: (field: FiscalSortField, direction: FiscalSortDirection) => void
  onPageChange: (page: number) => void
  onOpenDetail: (documentId: string) => void
  onConsult: (documentId: string) => void
  onOpenDanfe: (documentId: string) => void
  onDownloadXml: (documentId: string, assetType: 'xml_envio' | 'xml_retorno' | 'xml_processado') => void
}) {
  const sorting = useMemo<SortingState>(() => [{ id: sortBy, desc: sortDir === 'desc' }], [sortBy, sortDir])
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const columns = useMemo<ColumnDef<FiscalDocumentListItem>[]>(() => [
    {
      id: 'numero_nf',
      accessorKey: 'numeroNf',
      header: () => sortableHeader('Nota fiscal', 'numero_nf', sortBy, sortDir, onSortChange),
      cell: ({ row }) => (
        <button
          className="flex flex-col text-left transition hover:text-primary"
          onClick={() => onOpenDetail(row.original.id)}
        >
          <span className="font-semibold text-foreground">NF {row.original.numeroNf}</span>
          <span className="text-xs text-muted-foreground">
            Serie {row.original.serie} • {humanizeModel(row.original.documentModel)}
          </span>
        </button>
      ),
      size: 160,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <FiscalDocumentStatusBadge status={row.original.documentStatus} />,
      size: 120,
    },
    {
      id: 'pedido',
      header: 'Pedido / Loja',
      cell: ({ row }) => (
        <div className="min-w-[210px]">
          <div className="font-medium text-foreground">Pedido #{formatOrderNumber(row.original.orderNumber)}</div>
          <div className="text-xs text-muted-foreground">{row.original.storeName}</div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {humanizeOrderStatus(row.original.orderStatus)}
          </div>
        </div>
      ),
      size: 260,
    },
    {
      id: 'chave',
      header: 'Chave / Protocolo',
      cell: ({ row }) => (
        <div className="max-w-[270px]">
          <div className="truncate font-mono text-[11px] text-foreground" title={row.original.chaveAcesso || '-'}>
            {row.original.chaveAcesso || '-'}
          </div>
          <div className="text-xs text-muted-foreground" title={row.original.protocoloAutorizacao || '-'}>
            Prot. {row.original.protocoloAutorizacao || '-'}
          </div>
        </div>
      ),
      size: 280,
    },
    {
      id: 'valor_total_nota',
      accessorKey: 'valorTotalNota',
      header: () => sortableHeader('Valor', 'valor_total_nota', sortBy, sortDir, onSortChange),
      cell: ({ row }) => <span className="font-semibold text-foreground">R$ {formatCurrency(row.original.valorTotalNota)}</span>,
      size: 130,
    },
    {
      id: 'ambiente',
      header: 'Ambiente',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground">{humanizeEnvironment(row.original.ambiente)}</div>
          <div className="text-xs text-muted-foreground">{row.original.emittedByName || 'Sem operador'}</div>
        </div>
      ),
      size: 140,
    },
    {
      id: 'emitted_at',
      accessorFn: (row) => getEffectiveDocumentDate(row),
      header: () => sortableHeader('Emitida em', 'emitted_at', sortBy, sortDir, onSortChange),
      cell: ({ row }) => (
        <div>
          <div className="text-foreground">{formatDateTime(getEffectiveDocumentDate(row.original))}</div>
          <div className="text-xs text-muted-foreground">Atualizado em {formatDateTime(row.original.updatedAt)}</div>
        </div>
      ),
      size: 180,
    },
    {
      id: 'acoes',
      header: () => <div className="text-right">Acoes</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <FiscalDocumentRowActions
            item={row.original}
            busy={busyDocumentId === row.original.id}
            onOpenDetail={() => onOpenDetail(row.original.id)}
            onConsult={() => onConsult(row.original.id)}
            onOpenDanfe={() => onOpenDanfe(row.original.id)}
            onDownloadXml={(assetType) => onDownloadXml(row.original.id, assetType)}
          />
        </div>
      ),
      size: 90,
    },
  ], [busyDocumentId, onConsult, onDownloadXml, onOpenDanfe, onOpenDetail, onSortChange, sortBy, sortDir])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount,
    state: { sorting },
  })

  if (!loading && items.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-border/80 bg-background/60 px-6 py-14 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">Nenhuma nota fiscal encontrada</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Ajuste os filtros ou a busca para localizar outra nota emitida.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-white/25 bg-background/60 shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-12 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading
              ? Array.from({ length: pageSize }).map((_, index) => (
                <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                  {columns.map((column, columnIndex) => (
                    <TableCell key={`${column.id}-${columnIndex}`} className="px-4 py-3">
                      <Skeleton className="h-5 w-full rounded-lg" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
              : table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-border/60">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 rounded-[24px] border border-white/20 bg-background/60 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando <span className="font-semibold text-foreground">{items.length}</span> de{' '}
          <span className="font-semibold text-foreground">{total}</span> nota(s) fiscal(is).
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            onClick={() => onPageChange(page - 1)}
            disabled={loading || page <= 1}
          >
            Anterior
          </Button>
          <div className="rounded-2xl border border-white/25 bg-background/70 px-3 py-1.5 text-sm font-medium text-foreground">
            Pagina {page} de {pageCount}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            onClick={() => onPageChange(page + 1)}
            disabled={loading || page >= pageCount}
          >
            Proxima
          </Button>
        </div>
      </div>
    </div>
  )
}

function sortableHeader(
  label: string,
  field: FiscalSortField,
  currentField: FiscalSortField,
  currentDirection: FiscalSortDirection,
  onSortChange: (field: FiscalSortField, direction: FiscalSortDirection) => void
) {
  const isActive = currentField === field
  const nextDirection: FiscalSortDirection = isActive && currentDirection === 'desc' ? 'asc' : 'desc'

  return (
    <button
      className="inline-flex items-center gap-1 text-left transition hover:text-foreground"
      onClick={() => onSortChange(field, nextDirection)}
    >
      <span>{label}</span>
      {isActive ? (
        currentDirection === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
      )}
    </button>
  )
}
