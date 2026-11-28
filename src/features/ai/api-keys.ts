import type { AiApiKeyProviderId } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/api-keys"

/**
 * Provedores cuja chave PRINCIPAL alimenta o Engramind (Redator e embedding), que aceita uma chave
 * só. O JEV não gera texto; o Go e o Command Code não são fonte do Redator nem do embedding.
 */
export const AI_API_KEY_ENGRAMIND_PROVIDERS = ["gemini", "anthropic", "openai", "deepseek"] as const satisfies readonly AiApiKeyProviderId[]

export function feedsEngramind(provider: AiApiKeyProviderId): boolean {
    return (AI_API_KEY_ENGRAMIND_PROVIDERS as readonly string[]).includes(provider)
}
