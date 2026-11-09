import { randomBytes } from "crypto"
import { INTEGRATIONS, type IntegrationId } from "./catalog"

/**
 * Chaveiro de chaves de API nomeadas (OPE-155): várias chaves por integração, uma ativa. Hoje vale
 * para os provedores de IA por API key (Gemini, Anthropic, OpenAI, DeepSeek e JEV); o OpenCode usa a
 * senha do `opencode serve` e fica fora.
 */

/** Integrações com um campo de chaveiro (`keyRing`). */
export const KEY_RING_INTEGRATION_IDS: readonly IntegrationId[] = INTEGRATIONS.filter((def) => def.secretFields.some((field) => field.keyRing)).map((def) => def.id)

export function isKeyRingIntegration(id: string): boolean {
    return (KEY_RING_INTEGRATION_IDS as readonly string[]).includes(id)
}

/** Id de uma chave do chaveiro (opaco, seguro em URL). */
export const newApiKeyId = () => `key_${randomBytes(9).toString("hex")}`

