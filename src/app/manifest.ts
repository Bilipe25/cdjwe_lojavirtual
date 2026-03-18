import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/',
        name: 'JWE Centro de Distribuicao - Portal B2B',
        short_name: 'JWE B2B',
        description: 'Portal de vendas B2B para lojistas - JWE Centro de Distribuicao',
        start_url: '/catalog',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        background_color: '#f7f4ee',
        theme_color: '#1a2744',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['business', 'shopping'],
        prefer_related_applications: false,
        shortcuts: [
            {
                name: 'Catalogo',
                short_name: 'Catalogo',
                description: 'Abrir o catalogo de produtos',
                url: '/catalog',
                icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
                name: 'Meus Pedidos',
                short_name: 'Pedidos',
                description: 'Abrir a lista de pedidos do cliente',
                url: '/orders',
                icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
                name: 'Carrinho',
                short_name: 'Carrinho',
                description: 'Ir direto para o carrinho',
                url: '/cart',
                icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
                name: 'Tecidos',
                short_name: 'Tecidos',
                description: 'Abrir o catalogo de tecidos',
                url: '/fabrics',
                icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
        ],
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
