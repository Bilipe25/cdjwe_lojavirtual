import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/',
        name: 'JWE Centro de Distribuição — Portal B2B',
        short_name: 'JWE B2B',
        description: 'Portal de vendas B2B para lojistas — JWE Centro de Distribuição',
        start_url: '/catalog',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        background_color: '#ffffff',
        theme_color: '#1a2744',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['business', 'shopping'],
        prefer_related_applications: false,
        icons: [
            { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    }
}
