import { OPENCODE_GO_BASE_URL } from "./endpoints"
import type { AiModelDto } from "./providers"

/**
 * Catálogo do OpenCode Go (módulo PURO): converte a lista `GET /openai/v1/models` do gateway em
 * modelos do Opex e decide por qual API (e SDK) cada modelo é chamado.
 */

/** APIs do gateway, na ordem de preferência quando um modelo oferece mais de uma. */
export const OPENCODE_GO_APIS = ["chat-completions", "responses", "messages", "generate-content"] as const
export type OpencodeGoApi = (typeof OPENCODE_GO_APIS)[number]

/** Base padrão de cada API (usada quando o catálogo não informa ou informa fora do gateway). */
export const OPENCODE_GO_API_BASES: Record<OpencodeGoApi, string> = {
    "chat-completions": `${OPENCODE_GO_BASE_URL}/openai/v1`,
    responses: `${OPENCODE_GO_BASE_URL}/openai/v1`,
    messages: `${OPENCODE_GO_BASE_URL}/anthropic/v1`,
    "generate-content": `${OPENCODE_GO_BASE_URL}/google/v1beta`,
}

/** Esforços de raciocínio que a AI SDK aceita (opção `reasoning`); o Go informa quais cada modelo usa. */
export const OPENCODE_GO_REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const
export type OpencodeGoReasoningLevel = (typeof OPENCODE_GO_REASONING_LEVELS)[number]

export function isOpencodeGoReasoningLevel(value: string): value is OpencodeGoReasoningLevel {
    return (OPENCODE_GO_REASONING_LEVELS as readonly string[]).includes(value)
}

/** Modelo como o gateway devolve (só os campos usados). */
export interface OpencodeGoRawModel {
    id: string
    name?: string
    type?: string
    canonical_id?: string
    modalities?: { input?: string[] }
    capabilities?: { reasoning?: { supported?: boolean; effort?: string[] } }
    limit?: { context?: number }
    cost?: { text?: { input?: { price?: number }; output?: { price?: number } } }
    api?: Partial<Record<string, { base_url?: string }>>
}

export interface OpencodeGoRoute {
    api: OpencodeGoApi
    baseURL: string
}

/** API e base de um modelo. Base fora do gateway do Go é ignorada: a chave nunca vai para outro host. */
export function opencodeGoRoute(raw: OpencodeGoRawModel | undefined): OpencodeGoRoute {
    const api = OPENCODE_GO_APIS.find((candidate) => raw?.api?.[candidate]) ?? "chat-completions"
    const declared = raw?.api?.[api]?.base_url?.replace(/\/+$/, "")
    const baseURL = declared && declared.startsWith(`${OPENCODE_GO_BASE_URL}/`) ? declared : OPENCODE_GO_API_BASES[api]
    return { api, baseURL }
}

/** Modelo utilizável pelo Opex: de texto e numa das APIs suportadas. */
export function isUsableOpencodeGoModel(raw: OpencodeGoRawModel): boolean {
    if (raw.type && raw.type !== "chat") return false
    if (!raw.api) return true
    return OPENCODE_GO_APIS.some((api) => raw.api?.[api])
}

const price = (value: number | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null)

export function toOpencodeGoModel(raw: OpencodeGoRawModel): AiModelDto {
    const efforts = raw.capabilities?.reasoning?.supported === false ? [] : (raw.capabilities?.reasoning?.effort ?? []).filter(isOpencodeGoReasoningLevel)
    const input = price(raw.cost?.text?.input?.price)
    const output = price(raw.cost?.text?.output?.price)
    const group = raw.canonical_id?.includes("/") ? raw.canonical_id.split("/")[0]! : null
    return {
        id: raw.id,
        name: raw.name || raw.id,
        variants: [...new Set(efforts)],
        group,
        contextWindow: typeof raw.limit?.context === "number" ? raw.limit.context : null,
        free: /-free$/i.test(raw.id) || (input === 0 && output === 0),
        inputModalities: raw.modalities?.input ?? ["text"],
    }
}

export function toOpencodeGoModels(list: readonly OpencodeGoRawModel[]): AiModelDto[] {
    return list.filter((raw) => typeof raw?.id === "string" && isUsableOpencodeGoModel(raw)).map(toOpencodeGoModel).sort((a, b) => a.id.localeCompare(b.id))
}
