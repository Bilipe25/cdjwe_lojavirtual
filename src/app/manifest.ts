import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'CDJWE Estofados — Portal B2B',
        short_name: 'CDJWE B2B',
        description: 'Portal de vendas B2B para lojistas — CDJWE Estofados',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f3ef',
        theme_color: '#1a2744',
        orientation: 'any',
        categories: ['business', 'shopping'],
    }
}
