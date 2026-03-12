'use client'

import Image from 'next/image'
import { Package } from 'lucide-react'
import type { Category } from '@/lib/types'

interface CategoryCarouselProps {
    categories: Category[]
    selectedCategory: string
    onSelect: (categoryId: string) => void
}

export function CategoryCarousel({ categories, selectedCategory, onSelect }: CategoryCarouselProps) {
    return (
        <div className="mb-4">
            <div
                className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-1 snap-x snap-mandatory"
                style={{ scrollPaddingLeft: '4px' }}
            >
                {/* "All" option */}
                <button
                    onClick={() => onSelect('all')}
                    className="flex flex-col items-center gap-1.5 shrink-0 snap-start"
                >
                    <div
                        className={`h-16 w-16 sm:h-18 sm:w-18 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                            selectedCategory === 'all'
                                ? 'gradient-bronze shadow-md ring-2 ring-bronze/30'
                                : 'bg-muted/60 border border-border/40 hover:bg-muted'
                        }`}
                    >
                        <Package
                            className={`h-6 w-6 ${
                                selectedCategory === 'all' ? 'text-white' : 'text-muted-foreground'
                            }`}
                        />
                    </div>
                    <span
                        className={`text-[10px] font-medium text-center leading-tight max-w-16 truncate ${
                            selectedCategory === 'all' ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        }`}
                    >
                        Todos
                    </span>
                </button>

                {/* Category items */}
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => onSelect(cat.id)}
                        className="flex flex-col items-center gap-1.5 shrink-0 snap-start"
                    >
                        <div
                            className={`h-16 w-16 sm:h-18 sm:w-18 rounded-2xl overflow-hidden relative transition-all duration-200 ${
                                selectedCategory === cat.id
                                    ? 'shadow-md ring-2 ring-bronze/30'
                                    : 'border border-border/40 hover:shadow-sm'
                            }`}
                        >
                            {cat.image_url ? (
                                <>
                                    <Image
                                        src={cat.image_url}
                                        alt={cat.name}
                                        fill
                                        className="object-cover"
                                    />
                                    {selectedCategory === cat.id && (
                                        <div className="absolute inset-0 bg-primary/20" />
                                    )}
                                </>
                            ) : (
                                <div
                                    className={`h-full w-full flex items-center justify-center ${
                                        selectedCategory === cat.id
                                            ? 'gradient-bronze'
                                            : 'bg-muted/60'
                                    }`}
                                >
                                    <span
                                        className={`text-sm font-bold ${
                                            selectedCategory === cat.id ? 'text-white' : 'text-muted-foreground'
                                        }`}
                                    >
                                        {cat.name.substring(0, 2).toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>
                        <span
                            className={`text-[10px] font-medium text-center leading-tight max-w-16 truncate ${
                                selectedCategory === cat.id ? 'text-foreground font-semibold' : 'text-muted-foreground'
                            }`}
                        >
                            {cat.name}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}
