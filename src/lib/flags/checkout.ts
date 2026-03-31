const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function isCheckoutV2Enabled() {
    const value = (process.env.CHECKOUT_V2_ENABLED || '').trim().toLowerCase()
    return TRUE_VALUES.has(value)
}

