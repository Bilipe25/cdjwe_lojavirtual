'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Globe, Loader2, MapPin, Plus, Trash2 } from 'lucide-react'
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
        reload()
    }, [reload])

    const handleAdd = () => {
        setDialogMode('add')
        setEditingLink(null)
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

        toast.success(data.editId ? 'Vínculo IBS/CBS atualizado.' : 'Vínculo IBS/CBS adicionado.')
        await reload()
    }

    const handleDelete = async (id: string) => {
        setDeletingId(id)
        const result = await deleteEmitterIbscbsLink(id)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Vínculo IBS/CBS removido.')
            await reload()
        }
        setDeletingId(null)
    }

    if (loading) {
        return (
            <Card className="glass-card border-0">
                <CardContent className="p-6 space-y-3">
                    <Skeleton className="h-6 w-56" />
                    <Skeleton className="h-14 w-full" />
                </CardContent>
            </Card>
        )
    }

    const existingUFs = links.map((link) => link.target_uf)

    return (
        <>
            <Card className="glass-card border-0">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <FileText className="h-5 w-5 text-bronze" />
                            IBS/CBS por Estado
                        </CardTitle>
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-bronze border-bronze/30 hover:bg-bronze/5 gap-1.5"
                            onClick={handleAdd}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Cada vínculo do emitente agora grava <strong>base + versão ativa</strong>, garantindo rastreabilidade e
                        evitando que uma troca silenciosa de versão mude o comportamento fiscal da empresa sem revisão.
                    </p>
                </CardHeader>
                <CardContent className="space-y-2">
                    {links.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="mx-auto h-8 w-8 mb-2 opacity-30" />
                            <p className="text-sm">Nenhum vínculo IBS/CBS configurado.</p>
                            <p className="text-xs mt-1">Adicione uma base com versão ativa para nacional ou por UF.</p>
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
                                    className="flex items-center justify-between p-3 rounded-xl border bg-white/60 hover:bg-white/80 transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div
                                            className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
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
                                            <div className="text-sm font-medium truncate">
                                                {link.ibscbs_national_cst ? (
                                                    <Badge variant="outline" className="mr-1.5 text-[10px] px-1.5 py-0 border-violet-200 bg-violet-50 text-violet-700">
                                                        CST {link.ibscbs_national_cst}
                                                    </Badge>
                                                ) : null}
                                                {link.ibscbs_classification_code ? (
                                                    <Badge variant="outline" className="mr-1.5 text-[10px] px-1.5 py-0 border-slate-200 bg-slate-50 text-slate-700">
                                                        Classificação {link.ibscbs_classification_code}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {link.target_uf ? link.target_uf : 'Brasil'}
                                                {link.ibscbs_base_name ? ` — ${link.ibscbs_base_name}` : ''}
                                                {link.ibscbs_base_code ? ` (${link.ibscbs_base_code})` : ''}
                                                {link.ibscbs_version_label ? ` • ${link.ibscbs_version_label}` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
