'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Package, Eye } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/types'

interface ProductCardProps {
    product: Product & {
        images?: { url: string; is_primary: boolean }[]
        category?: { name: string }
    }
}

export function ProductCard({ product }: ProductCardProps) {
    const primaryImage = product.images?.find((img) => img.is_primary) || product.images?.[0]

    return (
        <Link href={`/catalog/${product.id}`}>
            <Card className="group glass-card border-0 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                {/* Image */}
                <div className="relative h-56 bg-muted overflow-hidden">
                    {primaryImage ? (
                        <Image
                            src={primaryImage.url}
                            alt={product.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="h-full w-full flex items-center justify-center">
                            <Package className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                    )}

                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-2">
                        {product.is_featured && (
                            <Badge className="gradient-bronze border-0 text-white text-[10px]">
                                Destaque
                            </Badge>
                        )}
                        {product.category && (
                            <Badge variant="secondary" className="bg-white/80 backdrop-blur text-[10px]">
                                {product.category.name}
                            </Badge>
                        )}
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                        <Button
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 gradient-navy border-0 text-white"
                        >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Detalhes
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <CardContent className="p-4">
                    <h3 className="font-semibold font-[family-name:var(--font-heading)] text-base line-clamp-1 group-hover:text-primary transition-colors">
                        {product.name}
                    </h3>
                    {product.size && (
                        <p className="text-xs text-muted-foreground mt-0.5">{product.size}</p>
                    )}
                    {product.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {product.description}
                        </p>
                    )}
                    <div className="mt-3 flex items-end justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground">A partir de</p>
                            <p className="text-lg font-bold text-gradient-bronze">
                                R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
