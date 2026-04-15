'use client'

import { MoreHorizontal, FileSearch, Copy, ExternalLink, FileText, FileCode2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { FiscalDocumentListItem } from '../types'

export function FiscalDocumentRowActions({
  item,
  busy,
  onOpenDetail,
  onConsult,
  onOpenDanfe,
  onDownloadXml,
}: {
  item: FiscalDocumentListItem
  busy?: boolean
  onOpenDetail: () => void
  onConsult: () => void
  onOpenDanfe: () => void
  onDownloadXml: (assetType: 'xml_envio' | 'xml_retorno' | 'xml_processado') => void
}) {
  const hasAnyXml = Boolean(item.xmlEnvioPath || item.xmlRetornoPath || item.xmlProcessadoPath)

  async function handleCopyKey() {
    if (!item.chaveAcesso) {
      toast.error('Esta nota ainda nao possui chave de acesso.')
      return
    }

    await navigator.clipboard.writeText(item.chaveAcesso)
    toast.success('Chave de acesso copiada.')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Abrir acoes da nota fiscal">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Nota fiscal #{item.numeroNf}</DropdownMenuLabel>
        <DropdownMenuItem onClick={onOpenDetail}>
          <ExternalLink className="h-4 w-4" />
          Abrir detalhe
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={onConsult}>
          <FileSearch className="h-4 w-4" />
          Consultar documento
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenDanfe}>
          <FileText className="h-4 w-4" />
          Abrir DANFE
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!hasAnyXml}>
            <FileCode2 className="h-4 w-4" />
            Arquivos XML
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled={!item.xmlEnvioPath} onClick={() => onDownloadXml('xml_envio')}>
              XML de envio
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!item.xmlRetornoPath} onClick={() => onDownloadXml('xml_retorno')}>
              XML de retorno
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!item.xmlProcessadoPath} onClick={() => onDownloadXml('xml_processado')}>
              XML processado
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleCopyKey()}>
          <Copy className="h-4 w-4" />
          Copiar chave de acesso
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
