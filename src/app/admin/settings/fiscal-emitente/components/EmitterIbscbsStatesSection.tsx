'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Globe, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  deleteEmitterIbscbsLink,
  loadEmitterIbscbsLinks,
  loadIbscbsBaseOptions,
  saveEmitterIbscbsLink,
} from '../emitter-taxes'
import { EmitterStateLinkDialog } from './EmitterStateLinkDialog'
import type { EmitterIbscbsStateLink } from '@/lib/types'
import type { IbscbsBaseOption } from '../emitter-taxes'

export function EmitterIbscbsStatesSection() {
  const [links, setLinks] = useState<EmitterIbscbsStateLink[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add')
  const [editingLink, setEditingLink] = useState<EmitterIbscbsStateLink | null>(null)
  const [ibscbsOptions, setIbscbsOptions] = useState<IbscbsBaseOption[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    const [linksResult, optionsResult] = await Promise.all([
      loadEmitterIbscbsLinks(),
      loadIbscbsBaseOptions(),
    ])
    if (linksResult.error) toast.error(linksResult.error)
    if (optionsResult.error) toast.error(optionsResult.error)
    setLinks(linksResult.data)
    setIbscbsOptions(optionsResult.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [reload])

  const handleAdd = () => {
    setDialogMode('add')
    setEditingLink(null)
    setDialogOpen(true)
  }

  const handleEdit = (link: EmitterIbscbsStateLink) => {
    setDialogMode('edit')
    setEditingLink(link)
    setDialogOpen(true)
  }

  const handleSave = async (data: {
    targetUf: string | null
    baseId: string
    versionId?: string | null
    editId?: string
  }) => {
    const result = await saveEmitterIbscbsLink({
      id: data.editId,
      target_uf: data.targetUf,
      ibscbs_base_id: data.baseId,
      ibscbs_version_id: data.versionId || null,
    })

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(data.editId ? 'Vinculo de IBS/CBS atualizado.' : 'Vinculo de IBS/CBS adicionado.')
    await reload()
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const result = await deleteEmitterIbscbsLink(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Vinculo de IBS/CBS removido.')
      await reload()
    }
    setDeletingId(null)
  }

  const existingUFs = links.map((link) => link.target_uf)
  const nationalLink = useMemo(() => links.find((link) => !link.target_uf) || null, [links])
  const stateLinks = useMemo(() => links.filter((link) => Boolean(link.target_uf)), [links])
  const readyLinksCount = useMemo(
    () => links.filter((link) => Boolean(link.ibscbs_version_id && link.ibscbs_version_label)).length,
    [links]
  )

  if (loading) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="glass-card border-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg font-heading">
              <FileText className="h-5 w-5 text-bronze" />
              Fallback IBS/CBS por abrangencia do emitente
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-bronze/30 text-bronze hover:bg-bronze/5"
              onClick={handleAdd}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Usado como complemento geografico quando o Perfil Tributario nao trouxer base/versionamento suficientes. CFOP
            e Base IBS/CBS continuam definindo CST, classificacao, aliquotas e formula numerica.
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Regra nacional</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {nationalLink
                  ? `${nationalLink.ibscbs_base_code || 'Base vinculada'} | ${nationalLink.ibscbs_version_label || 'Versao ativa'}`
                  : 'Ainda nao configurada'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                O perfil tributario vence quando tiver base/versionamento. Aqui o emitente define a regra nacional usada
                como fallback geografico.
              </p>
            </div>

            <div className="rounded-xl border bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Excecoes por UF</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {stateLinks.length === 0 ? 'Nenhuma excecao estadual' : `${stateLinks.length} UF(s) com override`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use excecoes apenas quando a regra do emitente realmente mudar por estado de destino.
              </p>
            </div>

            <div className="rounded-xl border bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prontidao geografica</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {readyLinksCount === links.length && links.length > 0
                  ? 'Todos os vinculos com versao ativa'
                  : links.length === 0
                    ? 'Sem vinculos ativos'
                    : `${readyLinksCount}/${links.length} vinculo(s) prontos`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cada vinculo precisa apontar para base e versao ativa para o runtime manter rastreabilidade.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
            <p className="font-medium text-slate-900">Linguagem unica do IBS/CBS</p>
            <ul className="mt-2 space-y-1">
              <li>Base IBS/CBS: catalogos, regra nacional/UF e modelo numerico.</li>
              <li>CFOP: enquadramento da operacao, CST, classificacao e credito presumido.</li>
              <li>Perfil tributario: heranca padrao da base/versionamento do produto.</li>
              <li>Emitente por UF: fallback geografico quando o perfil nao resolver tudo.</li>
            </ul>
          </div>

          {links.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">Nenhum vinculo geografico de IBS/CBS configurado.</p>
              <p className="mt-1 text-xs">
                Cadastre primeiro a regra nacional do emitente. Depois adicione apenas as UFs que realmente exigirem
                excecao.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {links.map((link) => (
                <motion.div
                  key={link.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="group flex items-center justify-between rounded-xl border bg-white/60 p-3 transition-colors hover:bg-white/80"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        link.target_uf ? 'bg-violet-100' : 'bg-emerald-100'
                      }`}
                    >
                      {link.target_uf ? (
                        <MapPin className="h-4 w-4 text-violet-600" />
                      ) : (
                        <Globe className="h-4 w-4 text-emerald-600" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {link.ibscbs_national_cst ? (
                          <Badge
                            variant="outline"
                            className="mr-1.5 border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] text-violet-700"
                          >
                            CST {link.ibscbs_national_cst}
                          </Badge>
                        ) : null}
                        {link.ibscbs_classification_code ? (
                          <Badge
                            variant="outline"
                            className="mr-1.5 border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] text-slate-700"
                          >
                            Classificacao {link.ibscbs_classification_code}
                          </Badge>
                        ) : null}
                        {link.ibscbs_version_label ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700"
                          >
                            {link.ibscbs_version_label}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {link.target_uf ? `UF ${link.target_uf}` : 'Brasil (regra nacional)'}
                        {link.ibscbs_base_name ? ` - ${link.ibscbs_base_name}` : ''}
                        {link.ibscbs_base_code ? ` (${link.ibscbs_base_code})` : ''}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {link.target_uf
                          ? 'Excecao geografica do emitente para esta UF.'
                          : 'Fallback geografico aplicado quando nao houver excecao estadual.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(link)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDelete(link.id)}
                      disabled={deletingId === link.id}
                    >
                      {deletingId === link.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>

      <EmitterStateLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type="ibscbs"
        mode={dialogMode}
        existingUFs={existingUFs}
        ibscbsOptions={ibscbsOptions}
        editData={
          editingLink
            ? {
                id: editingLink.id,
                targetUf: editingLink.target_uf,
                baseId: editingLink.ibscbs_base_id,
                versionId: editingLink.ibscbs_version_id,
              }
            : undefined
        }
        onSave={handleSave}
      />
    </>
  )
}
