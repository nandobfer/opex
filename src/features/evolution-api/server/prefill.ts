
import { DomainError } from "@/lib/api/route"
import { getIntegration } from "@/lib/integrations/runtime"
import type { IntegrationUpdateInput } from "@nandobfer/integracoes"
import { EVOLUTION_ENV_KEY, EVOLUTION_ENVIRONMENT_SLUG, EVOLUTION_INTEGRATION_ID } from "../constants"
import { prefillFromEnv, type EvolutionPrefillDto } from "../prefill"
import { evolutionLog, saveEvolutionFields } from "./shared"

/**
 * Pré-preenchimento a partir do ambiente `evolution-api` (módulo Ambientes): as variáveis são decifradas
 * NO SERVIDOR; a chave nunca sai daqui (a tela recebe só `keyAvailable`). Sem o ambiente, devolve só os
 * padrões (`available: false`).
 */

async function environmentVars(): Promise<Map<string, string> | null> {
    const { resolveEnvironmentRef, envVarsOf } = await import("@/features/environments/server/service")
    try {
        const env = await resolveEnvironmentRef(EVOLUTION_ENVIRONMENT_SLUG)
        return new Map(envVarsOf(env).map((item) => [item.key, item.value]))
    } catch (error) {
        if (error instanceof DomainError && error.status === 404) return null
        evolutionLog.warn({ err: error }, "[evolution] Não foi possível ler o ambiente evolution-api")
        return null
    }
}

export async function getEvolutionPrefill(): Promise<EvolutionPrefillDto> {
    const resolved = await getIntegration(EVOLUTION_INTEGRATION_ID)
    const vars = resolved.stored ? null : await environmentVars()
    return prefillFromEnv(vars, { configured: resolved.stored, keyConfigured: resolved.secretSources.apiKey === "db", port: process.env.PORT })
}

/** Grava a chave lida do ambiente (o dono confirmou o pré-preenchimento). */
export async function applyEnvironmentKey(input: IntegrationUpdateInput, actorId: string) {
    const vars = await environmentVars()
    const key = vars?.get(EVOLUTION_ENV_KEY)?.trim()
    if (!key) throw new DomainError(404, `O ambiente "${EVOLUTION_ENVIRONMENT_SLUG}" não tem a variável ${EVOLUTION_ENV_KEY}`, "EVOLUTION_ENV_KEY_MISSING")
    const saved = await saveEvolutionFields({ ...input, secrets: { apiKey: { action: "set", value: key } } }, actorId)
    evolutionLog.info("[evolution] Chave global gravada a partir do ambiente")
    return saved
}
