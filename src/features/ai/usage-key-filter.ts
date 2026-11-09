/**
 * Filtro "Chave de API" dos painéis de consumo (OPE-155) — módulo PURO (tela, rotas e agregadores).
 *
 * - `all` (padrão): todas as chaves;
 * - `<id da chave>`: só o consumo daquela chave;
 * - `none`: registros sem chave identificada (histórico anterior à OPE-155) — métricas desconhecidas
 *   continuam desconhecidas, nunca zero;
 * - `removed`: chaves que já foram removidas do chaveiro.
 */

export const USAGE_KEY_ALL = "all"
export const USAGE_KEY_NONE = "none"
export const USAGE_KEY_REMOVED = "removed"

/** Formato do id de uma chave do chaveiro (`newApiKeyId` em `src/lib/integrations/key-ring.ts`). */
export const API_KEY_ID_PATTERN = /^key_[a-f0-9]{18}$/

export const USAGE_KEY_PATTERN = /^(all|none|removed|key_[a-f0-9]{18})$/

export function isUsageKeyValue(value: string): boolean {
    return USAGE_KEY_PATTERN.test(value)
}

/** `$match` do Mongo para o filtro, dadas as chaves que existem hoje no provedor. */
export function usageKeyMatch(value: string | undefined, currentKeyIds: readonly string[]): Record<string, unknown> {
    if (!value || value === USAGE_KEY_ALL) return {}
    // `{ apiKeyId: null }` também casa com o campo ausente (registros históricos).
    if (value === USAGE_KEY_NONE) return { apiKeyId: null }
    if (value === USAGE_KEY_REMOVED) return { apiKeyId: { $nin: [null, ...currentKeyIds] } }
    return { apiKeyId: value }
}

export interface UsageKeyOption {
    value: string
    label: string
}

/** Opções do seletor: todas, cada chave atual (a ativa marcada), sem chave identificada e removidas. */
export function usageKeyOptions(keys: readonly { id: string; name: string; active: boolean }[]): UsageKeyOption[] {
    return [
        { value: USAGE_KEY_ALL, label: "Todas as chaves" },
        ...keys.map((key) => ({ value: key.id, label: key.active ? `${key.name} (em uso)` : key.name })),
        { value: USAGE_KEY_NONE, label: "Sem chave identificada (histórico)" },
        { value: USAGE_KEY_REMOVED, label: "Chaves removidas" },
    ]
}

/** Valor efetivo da URL: id que não existe mais no provedor (ou lixo) volta para "Todas". */
export function resolveUsageKey(value: string, keys: readonly { id: string }[] | undefined): string {
    if (!value || !isUsageKeyValue(value)) return USAGE_KEY_ALL
    if (API_KEY_ID_PATTERN.test(value) && keys && !keys.some((key) => key.id === value)) return USAGE_KEY_ALL
    return value
}
