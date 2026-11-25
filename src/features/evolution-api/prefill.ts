import { EVOLUTION_DEFAULT_HOST, EVOLUTION_DEFAULT_PORT, EVOLUTION_ENV_KEY, EVOLUTION_ENV_PORT, EVOLUTION_ENV_SERVER_URL, EVOLUTION_ENV_VERSION, EVOLUTION_WEBHOOK_PATH } from "./constants"

/** O que a tela recebe do pré-preenchimento. NUNCA inclui a chave: só se ela existe no ambiente. */
export interface EvolutionPrefillDto {
    /** O ambiente `evolution-api` existe e foi lido. */
    available: boolean
    /** A integração já tem URL interna salva (a tela não pré-preenche por cima). */
    configured: boolean
    /** A chave global já está salva no banco. */
    keyConfigured: boolean
    /** `AUTHENTICATION_API_KEY` existe no ambiente (o servidor a grava ao salvar). */
    keyAvailable: boolean
    internalUrl: string
    publicUrl: string | null
    version: string | null
    /** URL padrão do webhook: o Opex pela rede Docker (`opex-<porta>`, alias no compose). */
    webhookUrl: string
}

/** Endereço do Opex na rede `evolution-network` (alias `opex-<porta>` do docker-compose). */
export function defaultWebhookUrl(port: string | undefined): string {
    const p = port?.trim() || "3100"
    return `http://opex-${p}:${p}${EVOLUTION_WEBHOOK_PATH}`
}

/** Monta o pré-preenchimento a partir das variáveis do ambiente (puro; `vars` nulo = ambiente ausente). */
export function prefillFromEnv(vars: ReadonlyMap<string, string> | null, options: { configured: boolean; keyConfigured: boolean; port?: string }): EvolutionPrefillDto {
    const get = (key: string) => vars?.get(key)?.trim() || null
    const portRaw = get(EVOLUTION_ENV_PORT)
    const port = portRaw && /^\d{2,5}$/.test(portRaw) ? portRaw : String(EVOLUTION_DEFAULT_PORT)
    const publicUrl = get(EVOLUTION_ENV_SERVER_URL)
    return {
        available: vars !== null,
        configured: options.configured,
        keyConfigured: options.keyConfigured,
        keyAvailable: Boolean(get(EVOLUTION_ENV_KEY)),
        internalUrl: `http://${EVOLUTION_DEFAULT_HOST}:${port}`,
        publicUrl: publicUrl ? publicUrl.replace(/\/+$/, "") : null,
        version: get(EVOLUTION_ENV_VERSION)?.replace(/^v/i, "") ?? null,
        webhookUrl: defaultWebhookUrl(options.port),
    }
}
