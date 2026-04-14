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
                    type="button"
                    onClick={() => onSelect('all')}
                    aria-pressed={selectedCategory === 'all'}
                    className="group flex shrink-0 snap-start flex-col items-center gap-1.5 focus-visible:outline-none"
                >
                    <div
                        className={`flex h-16 w-16 items-center justify-center rounded-2xl border transition-all duration-200 ease-out motion-reduce:transform-none sm:h-18 sm:w-18 ${
                            selectedCategory === 'all'
                                ? 'gradient-bronze border-transparent shadow-md ring-2 ring-bronze/30 md:group-hover:shadow-lg md:group-hover:ring-bronze/40 group-focus-visible:shadow-lg group-focus-visible:ring-bronze/40'
                                : 'border-border/40 bg-muted/60 md:group-hover:-translate-y-0.5 md:group-hover:border-bronze/30 md:group-hover:bg-muted md:group-hover:shadow-md group-focus-visible:-translate-y-0.5 group-focus-visible:border-bronze/30 group-focus-visible:bg-muted group-focus-visible:shadow-md'
                        }`}
                    >
                        <Package
                            className={`h-6 w-6 transition-colors duration-200 ${
                                selectedCategory === 'all'
                                    ? 'text-white'
                                    : 'text-muted-foreground md:group-hover:text-foreground group-focus-visible:text-foreground'
                            }`}
                        />
                    </div>
                    <span
                        className={`max-w-16 truncate text-center text-[10px] leading-tight transition-colors duration-200 ${
                            selectedCategory === 'all'
                                ? 'font-semibold text-foreground'
                                : 'font-medium text-muted-foreground md:group-hover:text-foreground group-focus-visible:text-foreground'
                        }`}
                    >
                        Todos
                    </span>
                </button>

                {/* Category items */}
                {categories.map((cat) => (
                    <button
                        type="button"
                        key={cat.id}
                        onClick={() => onSelect(cat.id)}
                        aria-pressed={selectedCategory === cat.id}
                        className="group flex shrink-0 snap-start flex-col items-center gap-1.5 focus-visible:outline-none"
                    >
                        <div
                            className={`relative h-16 w-16 overflow-hidden rounded-2xl border transition-all duration-200 ease-out motion-reduce:transform-none sm:h-18 sm:w-18 ${
                                selectedCategory === cat.id
                                    ? 'border-transparent shadow-md ring-2 ring-bronze/30 md:group-hover:shadow-lg md:group-hover:ring-bronze/40 group-focus-visible:shadow-lg group-focus-visible:ring-bronze/40'
                                    : 'border-border/40 md:group-hover:-translate-y-0.5 md:group-hover:border-bronze/25 md:group-hover:shadow-md group-focus-visible:-translate-y-0.5 group-focus-visible:border-bronze/25 group-focus-visible:shadow-md'
                            }`}
                        >
                            {cat.image_url ? (
                                <>
                                    <Image
                                        src={cat.image_url}
                                        alt={cat.name}
                                        fill
                                        className="object-cover transition-transform duration-200 ease-out motion-reduce:transform-none md:group-hover:scale-105 group-focus-visible:scale-105"
                                    />
                                    <div
                                        className={`absolute inset-0 transition-colors duration-200 ${
                                            selectedCategory === cat.id
                                                ? 'bg-primary/20 md:group-hover:bg-primary/25 group-focus-visible:bg-primary/25'
                                                : 'bg-slate-950/0 md:group-hover:bg-slate-950/10 group-focus-visible:bg-slate-950/10'
                                        }`}
                                    />
                                </>
                            ) : (
                                <div
                                    className={`flex h-full w-full items-center justify-center transition-all duration-200 ease-out motion-reduce:transform-none ${
                                        selectedCategory === cat.id
                                            ? 'gradient-bronze'
                                            : 'bg-muted/60 md:group-hover:bg-muted group-focus-visible:bg-muted'
                                    }`}
                                >
                                    <span
                                        className={`text-sm font-bold transition-colors duration-200 ${
                                            selectedCategory === cat.id
                                                ? 'text-white'
                                                : 'text-muted-foreground md:group-hover:text-foreground group-focus-visible:text-foreground'
                                        }`}
                                    >
                                        {cat.name.substring(0, 2).toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>
                        <span
                            className={`max-w-16 truncate text-center text-[10px] leading-tight transition-colors duration-200 ${
                                selectedCategory === cat.id
                                    ? 'font-semibold text-foreground'
                                    : 'font-medium text-muted-foreground md:group-hover:text-foreground group-focus-visible:text-foreground'
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
