'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Plus, Pencil, Trash2, Database, Globe, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  loadEmitterIcmsLinks,
  saveEmitterIcmsLink,
  deleteEmitterIcmsLink,
  loadIcmsBaseOptions,
} from '../emitter-taxes'
import { EmitterStateLinkDialog } from './EmitterStateLinkDialog'
import type { EmitterIcmsStateLink } from '@/lib/types'
import type { IcmsBaseOption } from '../emitter-taxes'

export function EmitterIcmsStatesSection() {
  const [links, setLinks] = useState<EmitterIcmsStateLink[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add')
  const [editingLink, setEditingLink] = useState<EmitterIcmsStateLink | null>(null)
  const [icmsOptions, setIcmsOptions] = useState<IcmsBaseOption[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    const [linksResult, optionsResult] = await Promise.all([loadEmitterIcmsLinks(), loadIcmsBaseOptions()])
    if (linksResult.error) toast.error(linksResult.error)
    setLinks(linksResult.data)
    setIcmsOptions(optionsResult.data)
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

  const handleEdit = (link: EmitterIcmsStateLink) => {
    setDialogMode('edit')
    setEditingLink(link)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const result = await deleteEmitterIcmsLink(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Vínculo de ICMS removido.')
      await reload()
    }
    setDeletingId(null)
  }

  const handleSave = async (data: { targetUf: string | null; baseId: string; editId?: string }) => {
    const result = await saveEmitterIcmsLink({
      id: data.editId,
      target_uf: data.targetUf,
      icms_base_id: data.baseId,
    })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(data.editId ? 'Vínculo de ICMS atualizado.' : 'Vínculo de ICMS adicionado.')
      await reload()
    }
  }

  const existingUFs = links.map((l) => l.target_uf)

  if (loading) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-6 w-48" />
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
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Database className="h-5 w-5 text-bronze" />
              ICMS por Estado
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
            Vincule a base de ICMS padrão do emitente por abrangência nacional ou por exceção estadual. As regras detalhadas continuam dentro das Bases Fiscais.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {links.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground rounded-xl border border-dashed">
              <Database className="mx-auto h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm font-medium">Nenhum vínculo de ICMS configurado.</p>
              <p className="text-xs mt-1">
                Adicione uma base nacional ou uma exceção por UF para orientar o fallback fiscal do emitente.
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
                  className="flex items-center justify-between p-3 rounded-xl border bg-white/60 hover:bg-white/80 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${link.target_uf ? 'bg-sky-100' : 'bg-emerald-100'}`}>
                      {link.target_uf ? (
                        <MapPin className="h-4 w-4 text-sky-600" />
                      ) : (
                        <Globe className="h-4 w-4 text-emerald-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {link.icms_national_cst && (
                          <Badge variant="outline" className="mr-2 text-[10px] px-1.5 py-0 border-sky-200 bg-sky-50 text-sky-700">
                            CST {link.icms_national_cst}
                          </Badge>
                        )}
                        {link.icms_base_code || link.icms_base_name || 'Base sem nome'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {link.target_uf ? link.target_uf : 'Brasil'}
                        {link.icms_base_name && link.icms_base_code ? ` — ${link.icms_base_name}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
        type="icms"
        mode={dialogMode}
        existingUFs={existingUFs}
        icmsOptions={icmsOptions}
        editData={
          editingLink
            ? {
                id: editingLink.id,
                targetUf: editingLink.target_uf,
                baseId: editingLink.icms_base_id,
              }
            : undefined
        }
        onSave={handleSave}
      />
    </>
  )
}
