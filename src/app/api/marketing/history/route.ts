import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireAdminSession } from '@/lib/marketing/auth'

type AllowedChannel = 'email' | 'notification' | 'push' | 'popup'
type AllowedStatus = 'sent' | 'delivered' | 'failed' | 'opened'
type AllowedPeriod = '7d' | '30d' | '90d' | 'all'

const allowedChannels: AllowedChannel[] = ['email', 'notification', 'push', 'popup']
const allowedStatuses: AllowedStatus[] = ['sent', 'delivered', 'failed', 'opened']

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

function normalizeChannel(value: string | null): AllowedChannel | 'all' {
    if (!value) return 'all'
    return allowedChannels.includes(value as AllowedChannel) ? (value as AllowedChannel) : 'all'
}

function normalizeStatus(value: string | null): AllowedStatus | 'all' {
    if (!value) return 'all'
    return allowedStatuses.includes(value as AllowedStatus) ? (value as AllowedStatus) : 'all'
}

function normalizePeriod(value: string | null): AllowedPeriod {
    if (value === '7d' || value === '30d' || value === '90d' || value === 'all') return value
    return '30d'
}

function resolveFromDate(period: AllowedPeriod): string | null {
    if (period === 'all') return null
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const searchParams = req.nextUrl.searchParams
        const channel = normalizeChannel(searchParams.get('channel'))
        const status = normalizeStatus(searchParams.get('status'))
        const period = normalizePeriod(searchParams.get('period'))
        const page = parsePositiveInt(searchParams.get('page'), 1)
        const pageSize = Math.min(parsePositiveInt(searchParams.get('pageSize'), 30), 100)
        const fromDate = resolveFromDate(period)

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const supabase = createServiceRoleClient()

        let entriesQuery = supabase
            .from('campaign_send_history')
            .select('id, channel, status, recipient_email, error_message, sent_at, campaigns(title)', { count: 'exact' })
            .order('sent_at', { ascending: false })
            .range(from, to)

        if (channel !== 'all') {
            entriesQuery = entriesQuery.eq('channel', channel)
        }

        if (status !== 'all') {
            entriesQuery = entriesQuery.eq('status', status)
        }

        if (fromDate) {
            entriesQuery = entriesQuery.gte('sent_at', fromDate)
        }

        const { data: entries, count: totalCount, error: entriesError } = await entriesQuery
        if (entriesError) throw entriesError

        let totalCountQuery = supabase
            .from('campaign_send_history')
            .select('id', { count: 'exact', head: true })

        if (channel !== 'all') {
            totalCountQuery = totalCountQuery.eq('channel', channel)
        }

        if (status !== 'all') {
            totalCountQuery = totalCountQuery.eq('status', status)
        }

        if (fromDate) {
            totalCountQuery = totalCountQuery.gte('sent_at', fromDate)
        }

        const failedCountQuery = (() => {
            let query = supabase
                .from('campaign_send_history')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'failed')

            if (channel !== 'all') {
                query = query.eq('channel', channel)
            }

            if (fromDate) {
                query = query.gte('sent_at', fromDate)
            }

            return query
        })()

        const countQueries = await Promise.all([
            totalCountQuery,
            failedCountQuery,
            ...allowedChannels.map((channelKey) => {
                let query = supabase
                    .from('campaign_send_history')
                    .select('id', { count: 'exact', head: true })
                    .eq('channel', channelKey)

                if (status !== 'all') {
                    query = query.eq('status', status)
                }

                if (fromDate) {
                    query = query.gte('sent_at', fromDate)
                }

                return query
            }),
        ])

        const totalAttempts = countQueries[0].count || 0
        const totalFailed = countQueries[1].count || 0

        const byChannel = allowedChannels.reduce<Record<string, number>>((acc, channelKey, index) => {
            acc[channelKey] = countQueries[index + 2].count || 0
            return acc
        }, {})

        return NextResponse.json({
            entries: entries || [],
            pagination: {
                page,
                pageSize,
                total: totalCount || 0,
                hasMore: from + (entries?.length || 0) < (totalCount || 0),
            },
            filters: {
                channel,
                status,
                period,
            },
            stats: {
                totalAttempts,
                totalFailed,
                byChannel,
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
