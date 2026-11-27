import { z } from "zod"
import type { AiProviderId } from "@/lib/ai/providers"
import type { AiKeyBilling } from "@/features/ai-billing/schemas"

/**
 * Chaves de API nomeadas dos provedores de IA (OPE-155) — módulo PURO (tela e API). Cada provedor por
 * API key tem várias chaves, **várias em uso** (rodízio, OPE-179) e **uma principal**; o segredo nunca
 * volta ao navegador (o DTO não o carrega).
 */

/** Provedores com chaveiro: todos os de API key (OpenCode Go desde a OPE-156); o OpenCode no host usa a senha do `opencode serve` e fica fora. */
export const AI_API_KEY_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek", "opencode-go", "command-code", "jev"] as const satisfies readonly AiProviderId[]
export type AiApiKeyProviderId = (typeof AI_API_KEY_PROVIDER_IDS)[number]

export function isAiApiKeyProviderId(value: string): value is AiApiKeyProviderId {
    return (AI_API_KEY_PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * Provedores que alimentam o Engramind (Redator/embedding): ele aceita uma chave só e recebe a principal.
 * O JEV não gera texto; o Go e o Command Code não são fonte do Redator nem do embedding.
 */
export const AI_API_KEY_ENGRAMIND_PROVIDERS = ["gemini", "anthropic", "openai", "deepseek"] as const satisfies readonly AiApiKeyProviderId[]

/** Provedores com plano de cobrança na chave (OPE-203): os que geram texto (o JEV fica fora). */
export const AI_BILLING_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek", "opencode-go", "command-code"] as const satisfies readonly AiApiKeyProviderId[]

export function hasKeyBilling(provider: AiApiKeyProviderId): boolean {
    return (AI_BILLING_PROVIDER_IDS as readonly string[]).includes(provider)
}

export function feedsEngramind(provider: AiApiKeyProviderId): boolean {
    return (AI_API_KEY_ENGRAMIND_PROVIDERS as readonly string[]).includes(provider)
}

export const AI_API_KEY_NAME_MAX = 60
export const AI_API_KEY_SECRET_MAX = 4096

const name = z.string().trim().min(1, "Informe um nome para a chave").max(AI_API_KEY_NAME_MAX, `Use no máximo ${AI_API_KEY_NAME_MAX} caracteres`)
const secret = z.string().trim().min(1, "Cole o segredo da chave de API").max(AI_API_KEY_SECRET_MAX, "Segredo longo demais")

export const createAiApiKeySchema = z.object({ name, secret })
export type CreateAiApiKeyInput = z.infer<typeof createAiApiKeySchema>

export const renameAiApiKeySchema = z.object({ name })
export type RenameAiApiKeyInput = z.infer<typeof renameAiApiKeySchema>

export const replaceAiApiKeySecretSchema = z.object({ secret })
export type ReplaceAiApiKeySecretInput = z.infer<typeof replaceAiApiKeySecretSchema>

/** PATCH de uma chave: renomear e/ou substituir o segredo (ao menos um). */
export const updateAiApiKeySchema = z
    .object({ name: name.optional(), secret: secret.optional() })
    .refine((input) => input.name !== undefined || input.secret !== undefined, { message: "Informe o nome ou o novo segredo" })
export type UpdateAiApiKeyInput = z.infer<typeof updateAiApiKeySchema>

/** Pôr ou tirar uma chave do rodízio (`PATCH .../keys/[keyId]/selection`). */
export const aiApiKeySelectionSchema = z.object({ selected: z.boolean({ error: "Informe se a chave fica em uso" }) })
export type AiApiKeySelectionInput = z.infer<typeof aiApiKeySelectionSchema>

export interface AiApiKeyDto {
    id: string
    name: string
    /** Em uso: entra no rodízio das gerações (OPE-179). */
    active: boolean
    /** Principal (uma por provedor): Engramind, teste do provedor e "Todas" da assinatura do Go. Sempre em uso. */
    primary: boolean
    /** Plano de cobrança (OPE-203); sem plano salvo = pago por uso. */
    billing: AiKeyBilling
    /** Avisos do plano (créditos vencidos/esgotados, assinatura com valores diferentes na mesma conta). */
    billingNotices: string[]
    createdAt: string
    updatedAt: string
}

/** Evento Pusher (`private-app`) quando o chaveiro de um provedor muda. Payload `{ provider }`. */
export const AI_PROVIDER_KEYS_UPDATED_EVENT = "ai-provider-keys-updated"
