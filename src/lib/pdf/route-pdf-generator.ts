import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getBase64ImageFromURL } from '@/lib/utils'

const pdfFontsConfig = pdfFonts as unknown as { pdfMake?: { vfs?: unknown }; vfs?: unknown }
const pdfMakeConfig = pdfMake as unknown as {
    vfs?: unknown
    fonts?: Record<
        string,
        {
            normal: string
            bold: string
            italics: string
            bolditalics: string
        }
    >
}

if (pdfFonts && pdfFontsConfig.pdfMake) {
    pdfMakeConfig.vfs = pdfFontsConfig.pdfMake.vfs
} else if (pdfFonts) {
    pdfMakeConfig.vfs = pdfFontsConfig.vfs || pdfFonts
}

export type RoutePdfMode = 'standard' | 'operational'

export interface RoutePdfBranding {
    system_name?: string | null
    logo_url?: string | null
    cnpj?: string | null
    city?: string | null
    state?: string | null
    address?: string | null
    phone?: string | null
    email?: string | null
}

export interface RoutePdfOrderRef {
    order_number?: string | null
    total?: number | null
}

export interface RoutePdfStop {
    id?: string
    stop_position?: number | null
    customer_name?: string | null
    address_snapshot?: string | null
    status?: string | null
    estimated_arrival_min?: number | null
    eta?: string | null
    estimated_distance_km?: number | null
    notes?: string | null
    failure_reason?: string | null
    orders?: RoutePdfOrderRef | null
}

export interface RoutePdfRoute {
    route_number?: string | null
    status?: string | null
    planned_date?: string | null
    total_distance_km?: number | null
    total_duration_min?: number | null
    total_stops?: number | null
    optimization_engine?: string | null
    optimization_result?: { engine?: string | null } | null
    drivers?: { profiles?: { full_name?: string | null } | null } | null
    vehicles?: { plate?: string | null; name?: string | null; type?: string | null } | null
    route_centers?: { name?: string | null; city?: string | null; address?: string | null } | null
}

export interface RoutePdfCostEstimate {
    total_cost?: number | null
    distance_km?: number | null
    fuel_cost?: number | null
}

export interface RoutePdfInput {
    route: RoutePdfRoute
    stops: RoutePdfStop[]
    branding?: RoutePdfBranding | null
    costEstimate?: RoutePdfCostEstimate | null
    generatedAt?: Date
}

interface RoutePdfViewModel {
    routeCode: string
    routeStatus: string
    routeDate: string
    driver: string
    vehicle: string
    center: string
    distance: string
    duration: string
    stopCount: string
    engine: string
    totalOrders: string
    totalCustomers: string
    estimatedCost: string
    generatedAtLabel: string
}

function normalizeNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function formatCurrencyBRL(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDateBR(value: string | null | undefined): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return format(date, 'dd/MM/yyyy', { locale: ptBR })
}

function formatDateTimeBR(value: Date | string | null | undefined): string {
    if (!value) return '—'
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

function getRouteStatusLabel(status: string | null | undefined): string {
    const map: Record<string, string> = {
        draft: 'Rascunho',
        optimized: 'Otimizada',
        confirmed: 'Confirmada',
        in_progress: 'Em andamento',
        completed: 'Concluída',
        cancelled: 'Cancelada',
    }
    return map[(status || '').toLowerCase()] || '—'
}

function getStopStatusLabel(status: string | null | undefined): string {
    const map: Record<string, string> = {
        pending: 'Pendente',
        arrived: 'Chegou',
        delivered: 'Entregue',
        failed: 'Insucesso',
        skipped: 'Pulada',
    }
    return map[(status || '').toLowerCase()] || '—'
}

function getStopStatusColor(status: string | null | undefined): string {
    const map: Record<string, string> = {
        pending: '#64748b',
        arrived: '#2563eb',
        delivered: '#059669',
        failed: '#dc2626',
        skipped: '#d97706',
    }
    return map[(status || '').toLowerCase()] || '#334155'
}

function getEngineLabel(route: RoutePdfRoute): string {
    const engine = route.optimization_result?.engine || route.optimization_engine
    if (!engine) return '—'
    if (engine === 'ors_vroom') return 'ORS Vroom'
    if (engine === 'osrm_nn') return 'OSRM'
    return engine
}

function buildRouteViewModel(input: RoutePdfInput): RoutePdfViewModel {
    const distanceKm = normalizeNumber(input.route.total_distance_km)
    const durationMin = normalizeNumber(input.route.total_duration_min)
    const totalStops = normalizeNumber(input.route.total_stops)
    const uniqueOrders = new Set(
        input.stops
            .map((stop) => stop.orders?.order_number?.trim())
            .filter((value): value is string => Boolean(value))
    )
    const uniqueCustomers = new Set(
        input.stops
            .map((stop) => stop.customer_name?.trim())
            .filter((value): value is string => Boolean(value))
    )
    const generatedAt = input.generatedAt || new Date()
    const vehicleParts = [input.route.vehicles?.plate, input.route.vehicles?.name].filter(Boolean)

    return {
        routeCode: input.route.route_number || '—',
        routeStatus: getRouteStatusLabel(input.route.status),
        routeDate: formatDateBR(input.route.planned_date),
        driver: input.route.drivers?.profiles?.full_name || 'Não atribuído',
        vehicle: vehicleParts.length > 0 ? vehicleParts.join(' - ') : 'Não atribuído',
        center: input.route.route_centers?.name || 'Não atribuído',
        distance: distanceKm !== null ? `${distanceKm.toFixed(1)} km` : '—',
        duration: durationMin !== null ? `${Math.round(durationMin)} min` : '—',
        stopCount: `${totalStops ?? input.stops.length ?? 0}`,
        engine: getEngineLabel(input.route),
        totalOrders: `${uniqueOrders.size}`,
        totalCustomers: `${uniqueCustomers.size}`,
        estimatedCost: formatCurrencyBRL(normalizeNumber(input.costEstimate?.total_cost)),
        generatedAtLabel: formatDateTimeBR(generatedAt),
    }
}

function summaryCell(label: string, value: string, options?: { fontSize?: number }): TableCell {
    const valueFont = options?.fontSize ?? 10
    return {
        stack: [
            { text: label.toUpperCase(), fontSize: 7.2, color: '#64748b', bold: true, margin: [0, 0, 0, 3] },
            { text: value || '—', fontSize: valueFont, color: '#0f172a', bold: true, lineHeight: 1.15 },
        ],
        fillColor: '#f8fafc',
        border: [false, false, false, false],
        margin: [8, 7, 8, 7],
    }
}

function sectionTitle(title: string, lineWidth = 535): Content {
    return {
        stack: [
            {
                text: title.toUpperCase(),
                fontSize: 8,
                bold: true,
                color: '#475569',
                characterSpacing: 0.8,
            },
            {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: lineWidth, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }],
                margin: [0, 6, 0, 0],
            },
        ],
        margin: [0, 0, 0, 10],
    }
}

function setupPdfFonts() {
    const vfs = (pdfMakeConfig.vfs as Record<string, string> | undefined) || {}
    const keys = Object.keys(vfs)
    const findFont = (patterns: string[], fallback: string) => {
        const match = keys.find((key) => patterns.some((pattern) => key.toLowerCase().includes(pattern.toLowerCase())))
        return match || fallback
    }

    const regular = findFont(['roboto-regular.ttf', 'roboto.ttf'], 'Roboto-Regular.ttf')
    const bold = findFont(['roboto-medium.ttf', 'roboto-bold.ttf'], regular)
    const italic = findFont(['roboto-italic.ttf'], regular)
    const boldItalic = findFont(['roboto-mediumitalic.ttf', 'roboto-bolditalic.ttf'], bold)

    pdfMakeConfig.fonts = {
        Roboto: {
            normal: regular,
            bold,
            italics: italic,
            bolditalics: boldItalic,
        },
    }
}

function buildStandardStopRows(stops: RoutePdfStop[]): TableCell[][] {
    return stops.map((stop, index) => {
        const etaLabel = stop.eta
            ? formatDateTimeBR(stop.eta)
            : normalizeNumber(stop.estimated_arrival_min) !== null
                ? `${Math.round(normalizeNumber(stop.estimated_arrival_min) as number)} min`
                : '—'
        const notes = [stop.failure_reason, stop.notes].filter(Boolean).join(' | ')
        const distance = normalizeNumber(stop.estimated_distance_km)

        return [
            {
                text: String(stop.stop_position ?? index + 1),
                fontSize: 8.5,
                bold: true,
                color: '#334155',
                alignment: 'center',
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
            {
                text: stop.customer_name || 'Cliente não informado',
                fontSize: 8.8,
                color: '#0f172a',
                bold: true,
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
            {
                text: stop.address_snapshot || 'Endereço não informado',
                fontSize: 8.2,
                color: '#475569',
                lineHeight: 1.15,
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
            {
                text: stop.orders?.order_number || '—',
                fontSize: 8.4,
                color: '#334155',
                alignment: 'center',
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
            {
                text: getStopStatusLabel(stop.status),
                fontSize: 8.2,
                bold: true,
                color: getStopStatusColor(stop.status),
                alignment: 'center',
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
            {
                text: etaLabel,
                fontSize: 8.2,
                color: '#334155',
                alignment: 'center',
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
            {
                text: [distance !== null ? `${distance.toFixed(1)} km` : null, notes || null].filter(Boolean).join(' | ') || '—',
                fontSize: 7.9,
                color: '#475569',
                lineHeight: 1.15,
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'],
            },
        ]
    })
}

function buildOperationalStopRows(stops: RoutePdfStop[]): TableCell[][] {
    return stops.map((stop, index) => {
        const etaLabel = stop.eta
            ? formatDateTimeBR(stop.eta)
            : normalizeNumber(stop.estimated_arrival_min) !== null
                ? `${Math.round(normalizeNumber(stop.estimated_arrival_min) as number)} min`
                : '—'
        const customer = stop.customer_name || 'Cliente não informado'
        const address = stop.address_snapshot || 'Endereço não informado'

        return [
            {
                text: String(stop.stop_position ?? index + 1),
                fontSize: 9.8,
                bold: true,
                color: '#0f172a',
                alignment: 'center',
                margin: [0, 8, 0, 8],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'],
            },
            {
                stack: [
                    { text: customer, fontSize: 9.6, bold: true, color: '#0f172a' },
                    { text: address, fontSize: 8.7, color: '#475569', margin: [0, 3, 0, 0], lineHeight: 1.18 },
                ],
                margin: [0, 7, 0, 7],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'],
            },
            {
                text: stop.orders?.order_number || '—',
                fontSize: 9.1,
                alignment: 'center',
                margin: [0, 8, 0, 8],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'],
            },
            {
                text: getStopStatusLabel(stop.status),
                fontSize: 9.1,
                bold: true,
                color: getStopStatusColor(stop.status),
                alignment: 'center',
                margin: [0, 8, 0, 8],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'],
            },
            {
                text: etaLabel,
                fontSize: 9.1,
                alignment: 'center',
                margin: [0, 8, 0, 8],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'],
            },
            {
                text: '__________',
                fontSize: 11,
                alignment: 'center',
                margin: [0, 8, 0, 8],
                border: [false, false, false, true],
                borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'],
            },
        ]
    })
}

function buildSummaryBlocks(view: RoutePdfViewModel): Content {
    return {
        table: {
            widths: ['*', '*', '*'],
            body: [[
                {
                    stack: [
                        { text: 'Resumo operacional', fontSize: 7.4, color: '#64748b', bold: true, margin: [0, 0, 0, 4] },
                        { text: `${view.totalOrders} pedidos • ${view.totalCustomers} clientes`, fontSize: 9.4, color: '#0f172a', bold: true },
                    ],
                    fillColor: '#f8fafc',
                    border: [false, false, false, false],
                    margin: [10, 9, 10, 9],
                },
                {
                    stack: [
                        { text: 'Custo estimado', fontSize: 7.4, color: '#64748b', bold: true, margin: [0, 0, 0, 4] },
                        { text: view.estimatedCost, fontSize: 9.4, color: '#0f172a', bold: true },
                    ],
                    fillColor: '#f8fafc',
                    border: [false, false, false, false],
                    margin: [10, 9, 10, 9],
                },
                {
                    stack: [
                        { text: 'Rendimento planejado', fontSize: 7.4, color: '#64748b', bold: true, margin: [0, 0, 0, 4] },
                        { text: `${view.distance} • ${view.duration}`, fontSize: 9.4, color: '#0f172a', bold: true },
                    ],
                    fillColor: '#f8fafc',
                    border: [false, false, false, false],
                    margin: [10, 9, 10, 9],
                },
            ]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 14],
    }
}

export async function buildRoutePdfDocumentDefinition(
    input: RoutePdfInput,
    mode: RoutePdfMode = 'standard',
): Promise<TDocumentDefinitions> {
    const view = buildRouteViewModel(input)
    const branding = input.branding || null
    const logoBase64 = branding?.logo_url ? await getBase64ImageFromURL(branding.logo_url) : null
    const systemName = branding?.system_name || 'CDJWE Estofados'
    const companyLocation = [branding?.city, branding?.state].filter(Boolean).join(' / ')
    const docTitle = mode === 'operational' ? 'Romaneio Operacional de Rota' : 'Detalhes da Rota'
    const stopRows = mode === 'operational' ? buildOperationalStopRows(input.stops) : buildStandardStopRows(input.stops)

    const content: Content[] = [
        {
            columns: [
                logoBase64
                    ? {
                          image: logoBase64,
                          width: 86,
                          margin: [0, 0, 0, 6],
                      }
                    : {
                          text: systemName,
                          fontSize: 19,
                          bold: true,
                          color: '#0f172a',
                          width: 'auto',
                      },
                {
                    stack: [
                        { text: systemName.toUpperCase(), fontSize: 13.5, bold: true, color: '#0f172a' },
                        { text: [companyLocation, branding?.cnpj ? `CNPJ ${branding.cnpj}` : null].filter(Boolean).join(' • '), fontSize: 8.2, color: '#64748b', margin: [0, 3, 0, 0] },
                        { text: [branding?.address, branding?.phone, branding?.email].filter(Boolean).join(' • '), fontSize: 7.8, color: '#94a3b8', margin: [0, 3, 0, 0] },
                    ],
                    alignment: 'right',
                },
            ],
            margin: [0, 0, 0, 12],
        },
        {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 535, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }],
            margin: [0, 0, 0, 14],
        },
        {
            columns: [
                {
                    stack: [
                        { text: docTitle.toUpperCase(), fontSize: 15, bold: true, color: '#0f172a' },
                        { text: `Rota ${view.routeCode}`, fontSize: 11.2, bold: true, color: '#1d4ed8', margin: [0, 3, 0, 0] },
                    ],
                },
                {
                    stack: [
                        { text: `Emitido em ${view.generatedAtLabel}`, alignment: 'right', fontSize: 8.8, color: '#475569' },
                        { text: `Status: ${view.routeStatus}`, alignment: 'right', fontSize: 9, color: '#0f172a', bold: true, margin: [0, 3, 0, 0] },
                    ],
                },
            ],
            margin: [0, 0, 0, 14],
        },
        sectionTitle('Resumo da rota'),
        {
            table: {
                widths: mode === 'operational' ? [110, '*', 110, '*'] : [130, '*', 130, '*'],
                body: [
                    [
                        summaryCell('Código', view.routeCode, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Data da rota', view.routeDate, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Status', view.routeStatus, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Engine', view.engine, { fontSize: mode === 'operational' ? 11 : 10 }),
                    ],
                    [
                        summaryCell('Motorista', view.driver, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Veículo', view.vehicle, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Centro de saída', view.center, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Paradas', view.stopCount, { fontSize: mode === 'operational' ? 11 : 10 }),
                    ],
                    [
                        summaryCell('Distância', view.distance, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Duração estimada', view.duration, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Pedidos', view.totalOrders, { fontSize: mode === 'operational' ? 11 : 10 }),
                        summaryCell('Clientes', view.totalCustomers, { fontSize: mode === 'operational' ? 11 : 10 }),
                    ],
                ],
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 6,
            },
            margin: [0, 0, 0, 12],
        },
        buildSummaryBlocks(view),
        sectionTitle(mode === 'operational' ? 'Paradas para conferência' : 'Paradas da rota'),
        mode === 'operational'
            ? {
                  table: {
                      headerRows: 1,
                      widths: [22, '*', 64, 58, 54, 65],
                      body: [
                          [
                              { text: '#', alignment: 'center', fontSize: 8.6, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 7, 0, 7], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'] },
                              { text: 'CLIENTE / ENDEREÇO', fontSize: 8.6, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 7, 0, 7], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'] },
                              { text: 'PEDIDO', alignment: 'center', fontSize: 8.6, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 7, 0, 7], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'] },
                              { text: 'STATUS', alignment: 'center', fontSize: 8.6, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 7, 0, 7], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'] },
                              { text: 'ETA', alignment: 'center', fontSize: 8.6, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 7, 0, 7], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'] },
                              { text: 'CHECK', alignment: 'center', fontSize: 8.6, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 7, 0, 7], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#dbe3ed'] },
                          ],
                          ...stopRows,
                      ],
                  },
                  layout: 'noBorders',
                  margin: [0, 0, 0, 8],
              }
            : {
                  table: {
                      headerRows: 1,
                      widths: [22, 82, '*', 58, 54, 54, '*'],
                      body: [
                          [
                              { text: '#', alignment: 'center', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                              { text: 'CLIENTE', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                              { text: 'ENDEREÇO', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                              { text: 'PEDIDO', alignment: 'center', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                              { text: 'STATUS', alignment: 'center', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                              { text: 'ETA', alignment: 'center', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                              { text: 'OBSERVAÇÕES', fontSize: 8, bold: true, color: '#64748b', fillColor: '#f8fafc', margin: [0, 6, 0, 6], border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'] },
                          ],
                          ...stopRows,
                      ],
                  },
                  layout: 'noBorders',
                  margin: [0, 0, 0, 6],
              },
        ...(mode === 'operational'
            ? [{
                table: {
                    widths: ['*', '*', '*', '*', '*'],
                    body: [[
                        { text: 'Pendente', color: '#64748b', fontSize: 8.2, alignment: 'center', margin: [0, 5, 0, 5], border: [false, false, false, false], fillColor: '#f8fafc' },
                        { text: 'Chegou', color: '#2563eb', fontSize: 8.2, alignment: 'center', margin: [0, 5, 0, 5], border: [false, false, false, false], fillColor: '#f8fafc' },
                        { text: 'Entregue', color: '#059669', fontSize: 8.2, alignment: 'center', margin: [0, 5, 0, 5], border: [false, false, false, false], fillColor: '#f8fafc' },
                        { text: 'Insucesso', color: '#dc2626', fontSize: 8.2, alignment: 'center', margin: [0, 5, 0, 5], border: [false, false, false, false], fillColor: '#f8fafc' },
                        { text: 'Pulada', color: '#d97706', fontSize: 8.2, alignment: 'center', margin: [0, 5, 0, 5], border: [false, false, false, false], fillColor: '#f8fafc' },
                    ]],
                },
                layout: 'noBorders',
                margin: [0, 6, 0, 0],
            } as Content]
            : []),
    ]

    return {
        pageSize: 'A4',
        pageMargins: [30, 34, 30, 34],
        content,
        defaultStyle: { font: 'Roboto' },
        footer: (currentPage, pageCount) => ({
            margin: [30, 4, 30, 0],
            columns: [
                { text: systemName, color: '#64748b', fontSize: 7.5 },
                { text: `Gerado em ${view.generatedAtLabel}`, color: '#64748b', fontSize: 7.5, alignment: 'center' },
                { text: `Página ${currentPage} de ${pageCount}`, color: '#64748b', fontSize: 7.5, alignment: 'right' },
            ],
        }),
    }
}

export async function generateRouteDetailPDF(input: RoutePdfInput, mode: RoutePdfMode = 'standard'): Promise<void> {
    setupPdfFonts()
    const docDefinition = await buildRoutePdfDocumentDefinition(input, mode)
    const routeCode = input.route.route_number || 'rota'
    const fileSuffix = mode === 'operational' ? 'operacional' : 'detalhes'
    pdfMake.createPdf(docDefinition).download(`Rota-${routeCode}-${fileSuffix}.pdf`)
}
