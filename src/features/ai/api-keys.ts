import { z } from "zod"
import type { AiProviderId } from "@/lib/ai/providers"

/**
 * Chaves de API nomeadas dos provedores de IA (OPE-155) — módulo PURO (tela e API). Cada provedor por
 * API key tem várias chaves e **uma ativa**; o segredo nunca volta ao navegador (o DTO não o carrega).
 */

/** Provedores com chaveiro: todos os de API key; o OpenCode usa a senha do `opencode serve` e fica fora. */
export const AI_API_KEY_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek", "jev"] as const satisfies readonly AiProviderId[]
export type AiApiKeyProviderId = (typeof AI_API_KEY_PROVIDER_IDS)[number]

export function isAiApiKeyProviderId(value: string): value is AiApiKeyProviderId {
    return (AI_API_KEY_PROVIDER_IDS as readonly string[]).includes(value)
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

export interface AiApiKeyDto {
    id: string
    name: string
    active: boolean
    createdAt: string
    updatedAt: string
}

/** Evento Pusher (`private-app`) quando o chaveiro de um provedor muda. Payload `{ provider }`. */
export const AI_PROVIDER_KEYS_UPDATED_EVENT = "ai-provider-keys-updated"
