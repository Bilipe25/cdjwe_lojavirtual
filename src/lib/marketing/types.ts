export type MarketingTargetAudience = 'all' | 'segment' | 'specific'

export type MarketingTargetSegment = {
    states?: string[]
    cities?: string[]
    clientIds?: string[]
}

export const MARKETING_CHANNELS = ['email', 'notification', 'push', 'popup'] as const
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number]
