export type ValueLabelOption = {
    value: string
    label: string
}

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RemovableEntity = 'driver' | 'vehicle' | 'center' | 'region'

function normalizeText(value: string | null | undefined) {
    return String(value || '').trim()
}

export function isUuidLike(value: string | null | undefined) {
    const normalized = normalizeText(value)
    return normalized.length > 0 && UUID_REGEX.test(normalized)
}

export function getRemovedEntityLabel(entity: RemovableEntity) {
    switch (entity) {
        case 'driver':
            return 'Motorista removido'
        case 'vehicle':
            return 'Veiculo removido'
        case 'center':
            return 'Centro removido'
        case 'region':
            return 'Regiao removida'
        default:
            return 'Registro removido'
    }
}

export function buildOptionLabelMap(options: ValueLabelOption[]) {
    const map = new Map<string, string>()
    for (const option of options) {
        const value = normalizeText(option.value)
        const label = normalizeText(option.label)
        if (!value || !label || map.has(value)) continue
        map.set(value, label)
    }
    return map
}

export function resolveLabelFromMap(
    value: string | null | undefined,
    labelMap: Map<string, string>,
    fallbackLabel: string,
) {
    const normalizedValue = normalizeText(value)
    if (!normalizedValue) return ''
    const direct = labelMap.get(normalizedValue)
    if (direct) return direct
    return fallbackLabel
}

export function ensureCurrentOption(
    options: ValueLabelOption[],
    currentValue: string | null | undefined,
    currentLabel: string,
) {
    const normalizedValue = normalizeText(currentValue)
    if (!normalizedValue) return options
    if (options.some((option) => normalizeText(option.value) === normalizedValue)) {
        return options
    }
    return [{ value: normalizedValue, label: normalizeText(currentLabel) || 'Registro removido' }, ...options]
}

export function buildRegionDisplayOptions(
    regionValues: Array<string | null | undefined>,
    regionCatalog: Array<{ id: string; name: string }>,
) {
    const labelByRegionId = new Map<string, string>()
    for (const region of regionCatalog) {
        const id = normalizeText(region.id)
        const name = normalizeText(region.name)
        if (!id || !name || labelByRegionId.has(id)) continue
        labelByRegionId.set(id, name)
    }

    const result: ValueLabelOption[] = []
    const seen = new Set<string>()

    const pushOption = (valueInput: string | null | undefined, explicitLabel?: string | null) => {
        const value = normalizeText(valueInput)
        if (!value || seen.has(value)) return
        const fallbackLabel = isUuidLike(value)
            ? labelByRegionId.get(value) || getRemovedEntityLabel('region')
            : value
        const label = normalizeText(explicitLabel || fallbackLabel)
        if (!label) return
        seen.add(value)
        result.push({ value, label })
    }

    for (const value of regionValues) {
        pushOption(value)
    }
    for (const region of regionCatalog) {
        const name = normalizeText(region.name)
        if (!name) continue
        pushOption(name, name)
    }

    return result.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}
