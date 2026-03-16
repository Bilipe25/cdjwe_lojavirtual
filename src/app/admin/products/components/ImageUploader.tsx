import Image from 'next/image'
import { Trash2, X, UploadCloud, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { ProductImage as DBProductImage } from '@/lib/types'

interface ImageUploaderProps {
    existingImages: DBProductImage[]
    previewUrls: string[]
    primaryImageId: string | null
    onAddFiles: (files: File[]) => void
    onRemoveExisting: (id: string) => void
    onRemoveNew: (index: number) => void
    onSetPrimary: (id: string) => void
}

export function ImageUploader({
    existingImages,
    previewUrls,
    primaryImageId,
    onAddFiles,
    onRemoveExisting,
    onRemoveNew,
    onSetPrimary,
}: ImageUploaderProps) {
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            onAddFiles(Array.from(event.target.files))
        }
    }

    const totalImages = existingImages.length + previewUrls.length

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b flex items-center justify-between">
                <span>Galeria de Imagens</span>
                <span className="text-xs normal-case bg-muted px-2 py-0.5 rounded-full">{totalImages}/5 max</span>
            </h3>

            <div className="grid grid-cols-3 gap-3">
                {/* Existing Images */}
                {existingImages.map((image) => (
                    <div
                        key={image.id}
                        className={`relative aspect-square rounded-lg border-2 overflow-hidden group ${
                            primaryImageId === image.id ? 'border-bronze' : 'border-border'
                        }`}
                    >
                        <Image src={image.url} alt="Produto" fill className="object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            {primaryImageId !== image.id && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 text-[10px] w-20"
                                    onClick={() => onSetPrimary(image.id)}
                                >
                                    Capa
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="h-7 w-7"
                                onClick={() => onRemoveExisting(image.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                        {primaryImageId === image.id && (
                            <Badge className="absolute top-1 left-1 bg-bronze text-white text-[9px] px-1 py-0 h-4 border-0">
                                Capa
                            </Badge>
                        )}
                    </div>
                ))}

                {/* New Images Previews */}
                {previewUrls.map((url, index) => (
                    <div
                        key={`new_${index}`}
                        className={`relative aspect-square rounded-lg border-2 overflow-hidden group ${
                            primaryImageId === `new_${index}` ? 'border-bronze' : 'border-border'
                        }`}
                    >
                        <Image src={url} alt="Upload" fill className="object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            {primaryImageId !== `new_${index}` && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 text-[10px] w-20"
                                    onClick={() => onSetPrimary(`new_${index}`)}
                                >
                                    Capa
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="h-7 w-7"
                                onClick={() => onRemoveNew(index)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                        {primaryImageId === `new_${index}` && (
                            <Badge className="absolute top-1 left-1 bg-bronze text-white text-[9px] px-1 py-0 h-4 border-0">
                                Capa
                            </Badge>
                        )}
                    </div>
                ))}

                {/* Upload Button */}
                {totalImages < 5 && (
                    <Label className="relative aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-bronze hover:bg-bronze/5 transition-colors flex flex-col items-center justify-center cursor-pointer text-muted-foreground hover:text-bronze">
                        <UploadCloud className="h-8 w-8 mb-2" />
                        <span className="text-[10px] font-medium text-center px-2">Adicionar Foto</span>
                        <Input type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                    </Label>
                )}
            </div>

            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-start mt-4">
                <ImageIcon className="h-4 w-4 mr-2 shrink-0 mt-0.5" />
                <p className="text-xs">
                    Faca o upload de imagens em formato 1:1 (quadradas). Maximo 5 fotos. Limite de 5MB por foto.
                </p>
            </div>
        </div>
    )
}
