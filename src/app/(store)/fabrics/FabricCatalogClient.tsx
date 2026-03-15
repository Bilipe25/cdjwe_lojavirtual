'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Scissors, X, Maximize2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateFabricCatalogPDF } from '@/lib/utils/pdf-generator'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { Fabric, FabricColor } from '@/lib/types'
import Image from 'next/image'

type FabricWithColors = Fabric & { colors: FabricColor[] }

interface FabricCatalogClientProps {
    initialFabrics: FabricWithColors[]
    systemSettings?: { system_name?: string; logo_url?: string | null } | null
}

export function FabricCatalogClient({ initialFabrics, systemSettings }: FabricCatalogClientProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedColor, setSelectedColor] = useState<FabricColor | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)

    const normalizedQuery = searchQuery.trim().toLowerCase()

    const filteredFabrics = useMemo(() => {
        if (!normalizedQuery) {
            return initialFabrics
        }

        return initialFabrics
            .map((fabric) => {
                const fabricMatches =
                    fabric.name.toLowerCase().includes(normalizedQuery) ||
                    fabric.description?.toLowerCase().includes(normalizedQuery)

                const matchingColors = fabric.colors.filter(
                    (color) =>
                        color.name.toLowerCase().includes(normalizedQuery)
                )

                if (!fabricMatches && matchingColors.length === 0) {
                    return null
                }

                return {
                    ...fabric,
                    colors: fabricMatches ? fabric.colors : matchingColors,
                }
            })
            .filter((fabric): fabric is FabricWithColors => fabric !== null)
    }, [initialFabrics, normalizedQuery])

    const handleColorClick = (color: FabricColor) => {
        setSelectedColor(color)
        setPreviewOpen(true)
    }

    const handleDownloadPDF = async () => {
        setIsDownloading(true)
        try {
            await generateFabricCatalogPDF(initialFabrics, systemSettings || undefined)
        } finally {
            setIsDownloading(false)
        }
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-12">
            {/* Header section - Hidden on mobile as it's in topbar */}
            <div className="hidden md:flex flex-col md:items-end justify-between gap-6 mb-12">
                <div className="space-y-3 mr-auto">
                    <div className="flex items-center gap-2 text-bronze uppercase tracking-[0.2em] text-[10px] font-bold">
                        <Scissors className="h-3.5 w-3.5" />
                        Private Collection
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-bold font-heading text-gradient-navy tracking-tight">
                        Catalogo de Tecidos
                    </h1>
                    <p className="text-muted-foreground text-sm md:text-base max-w-3xl leading-relaxed">
                        Nossa curadoria exclusiva de tecidos e acabamentos. Clique em uma cor para uma previa ampliada e detalhes tecnicos.
                    </p>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-4 w-full md:w-auto">
                    <Button 
                        variant="outline" 
                        size="lg"
                        className="gap-2 rounded-2xl h-12 px-6 border-navy/20 text-navy hover:bg-navy/5 font-bold shadow-sm"
                        onClick={handleDownloadPDF}
                        disabled={isDownloading}
                    >
                        <Download className={`h-4 w-4 ${isDownloading ? 'animate-pulse' : ''}`} />
                        {isDownloading ? 'Gerando...' : 'Download PDF'}
                    </Button>

                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                        <Input
                            placeholder="Pesquisar por nome do tecido..."
                            className="pl-11 h-12 bg-white/40 border-border/30 focus:bg-white transition-all rounded-2xl shadow-sm italic"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Mobile Search - Only search input, header is in topbar */}
            <div className="md:hidden mb-8 space-y-3">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                        placeholder="Buscar tecido..."
                        className="pl-10 h-11 bg-white/60 border-border/40 focus:bg-white transition-all rounded-xl shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <Button
                    variant="outline"
                    className="h-11 w-full justify-center gap-2 rounded-xl border-navy/15 bg-white/70 text-sm font-semibold text-navy shadow-sm"
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                >
                    <Download className={`h-4 w-4 ${isDownloading ? 'animate-pulse' : ''}`} />
                    {isDownloading ? 'Gerando PDF...' : 'Baixar catalogo em PDF'}
                </Button>
            </div>

            {/* Fabrics List */}
            {filteredFabrics.length > 0 ? (
                <div className="space-y-16 md:space-y-24">
                    <AnimatePresence mode="popLayout">
                        {filteredFabrics.map((fabric) => (
                            <motion.section
                                key={fabric.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="relative"
                            >
                                {/* Fabric Header */}
                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-2xl md:text-3xl font-bold text-navy font-heading tracking-tight">
                                                {fabric.name}
                                            </h2>
                                            <Badge variant="outline" className="bg-bronze/5 text-bronze border-bronze/10 font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider">
                                                {fabric.colors.length} {fabric.colors.length === 1 ? 'Cor Disponivel' : 'Cores Disponiveis'}
                                            </Badge>
                                        </div>
                                        {fabric.description && (
                                            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                                                {fabric.description}
                                            </p>
                                        )}
                                    </div>
                                    
                                    <div className="hidden md:flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                                        <div className="h-px w-12 bg-border/50" />
                                        Premium Selection
                                    </div>
                                </div>

                                <Separator className="mb-8 opacity-40 bg-navy/10" />

                                {/* Color Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 gap-x-6 gap-y-10">
                                    {fabric.colors.map((color) => (
                                        <motion.div
                                            key={color.id}
                                            className="group flex flex-col items-center text-center gap-3"
                                        >
                                            <motion.button
                                                whileHover={{ scale: 1.05, y: -4 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => handleColorClick(color)}
                                                className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-[0_4px_12px_-4px_rgba(0,0,0,0.15)] group-hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.2)] transition-all bg-muted border border-white/50 ring-1 ring-black/5 hover:ring-bronze/40"
                                            >
                                                {color.image_url ? (
                                                    <Image
                                                        src={color.image_url}
                                                        alt={color.name}
                                                        fill
                                                        className="object-cover tray-transition"
                                                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 15vw"
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-full h-full"
                                                        style={{ backgroundColor: color.hex_code || '#f3f4f6' }}
                                                    />
                                                )}
                                                
                                                {/* Hover Overlay */}
                                                <div className="absolute inset-0 bg-navy/0 group-hover:bg-navy/10 transition-colors flex items-center justify-center">
                                                    <div className="p-2 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 border border-white/30">
                                                        <Maximize2 className="h-4 w-4 text-white drop-shadow-md" />
                                                    </div>
                                                </div>
                                            </motion.button>
                                            
                                            <div className="space-y-0.5 max-w-full">
                                                <h3 className="text-xs font-bold text-navy group-hover:text-bronze transition-colors line-clamp-1 uppercase tracking-tighter">
                                                    {color.name}
                                                </h3>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.section>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="h-24 w-24 rounded-full bg-muted/20 flex items-center justify-center mb-6 border border-dashed border-border/50">
                        <Search className="h-10 w-10 text-muted-foreground/20" />
                    </div>
                    <h3 className="text-2xl font-bold text-navy font-heading">Nenhum tecido encontrado</h3>
                    <p className="text-muted-foreground mt-2 max-w-xs mx-auto">
                        A busca por &quot;{searchQuery}&quot; nao retornou resultados em nossa colecao atual.
                    </p>
                </div>
            )}

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl backdrop-blur-xl bg-white/90">
                    <div className="relative aspect-square w-full">
                        {selectedColor?.image_url ? (
                            <Image
                                src={selectedColor.image_url}
                                alt={selectedColor.name}
                                fill
                                className="object-cover"
                                priority
                            />
                        ) : (
                            <div
                                className="w-full h-full"
                                style={{ backgroundColor: selectedColor?.hex_code || '#f3f4f6' }}
                            />
                        )}
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                        
                        <div className="absolute bottom-8 left-8 right-8 text-white">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] mb-2 opacity-70">
                                Fabric Detail
                            </div>
                            <h2 className="text-3xl font-bold font-heading drop-shadow-lg">
                                {selectedColor?.name}
                            </h2>
                        </div>
                        
                        <button 
                            onClick={() => setPreviewOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-md flex items-center justify-center transition-all border border-white/20 group/close"
                        >
                            <X className="h-5 w-5 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}


