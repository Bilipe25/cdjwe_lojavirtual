import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'CDJWE Estofados — Portal B2B',
        short_name: 'CDJWE B2B',
        description: 'Portal de vendas B2B para lojistas — CDJWE Estofados',
        start_url: '/catalog',
        scope: '/',
        display: 'standalone',
        background_color: '#f5f3ef',
        theme_color: '#1a2744',
        orientation: 'any',
        categories: ['business', 'shopping'],
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    }
}
