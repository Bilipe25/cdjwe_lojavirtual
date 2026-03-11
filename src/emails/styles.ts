// Shared email styles and utilities for all templates

export function formatCurrency(value: number): string {
    return value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// ==================== Base Layout ====================
export const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

export const container = {
    margin: '0 auto',
    padding: '20px 0',
    maxWidth: '580px',
}

export const headerSection = {
    backgroundColor: '#1e3a5f',
    padding: '24px 32px',
    borderRadius: '12px 12px 0 0',
}

export const logo = {
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: '700' as const,
    margin: '0',
    textAlign: 'center' as const,
}

export const contentSection = {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '0 0 12px 12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

// ==================== Typography ====================
export const heading = {
    color: '#1e3a5f',
    fontSize: '22px',
    fontWeight: '700' as const,
    margin: '0 0 12px',
}

export const paragraph = {
    color: '#555',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 16px',
}

// ==================== Info Cards ====================
export const infoCard = {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid #e2e8f0',
}

export const infoLabel = {
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '12px 0 2px',
}

export const infoValue = {
    color: '#1e293b',
    fontSize: '15px',
    fontWeight: '500' as const,
    margin: '0 0 4px',
}

// ==================== CTA Buttons ====================
export const ctaSection = {
    textAlign: 'center' as const,
    marginTop: '24px',
}

export const buttonPrimary = {
    backgroundColor: '#1e3a5f',
    color: '#ffffff',
    padding: '12px 32px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600' as const,
    textDecoration: 'none',
    display: 'inline-block',
}

export const buttonSuccess = {
    ...buttonPrimary,
    backgroundColor: '#16a34a',
}

// ==================== Footer ====================
export const hr = {
    borderColor: '#e6ebf1',
    margin: '20px 0',
}

export const footer = {
    color: '#8898aa',
    fontSize: '12px',
    textAlign: 'center' as const,
}
