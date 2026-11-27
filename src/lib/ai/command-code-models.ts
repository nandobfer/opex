import { COMMAND_CODE_API_URL } from "./endpoints"
import type { AiModelDto } from "./providers"
import { isAiSdkReasoningLevel } from "./reasoning-levels"
import type { CommandCodePricing } from "./pricing/command-code"

/**
 * Catálogo do Command Code (módulo PURO, OPE-190): une `GET /provider/v1/models` (rotas por modelo) e
 * `GET /provider/v1/models?view=client` (esforços, tipos de entrada, preços e grupo), ambos públicos, e decide por
 * qual API (e SDK) cada modelo é chamado. A base é sempre a constante oficial: a chave nunca vai a outro host.
 */

/** APIs do Provider API, na ordem de preferência quando um modelo oferece mais de uma. */
export const COMMAND_CODE_APIS = ["chat-completions", "responses", "messages"] as const
export type CommandCodeApi = (typeof COMMAND_CODE_APIS)[number]

/** Caminho que o catálogo usa em `supported_endpoints` para cada API. */
const ENDPOINT_PATHS: Record<CommandCodeApi, string> = {
    "chat-completions": "/chat/completions",
    responses: "/responses",
    messages: "/messages",
}

/** Modelo de `/models` (rotas). */
export interface CommandCodeRoutingModel {
    id: string
    name?: string
    context_length?: number
    supported_endpoints?: string[]
}

/** Modelo de `/models?view=client` (capacidades). */
export interface CommandCodeClientModel {
    id: string
    name?: string
    context_length?: number
    display?: { group?: string | null; label?: string | null } | null
    inputModalities?: string[]
    reasoningEfforts?: string[]
    pricing?: CommandCodePricing | null
}

/** Modelo do catálogo já unido pelo id. */
export interface CommandCodeRawModel {
    id: string
    name: string | null
    contextLength: number | null
    endpoints: string[] | null
    group: string | null
    inputModalities: string[] | null
    reasoningEfforts: string[]
    inputCost: number | null
    outputCost: number | null
    /** Preço completo do catálogo (cache e faixas de contexto), para o custo de tabela (OPE-203). */
    pricing: CommandCodePricing | null
}

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)
const strings = (value: unknown): string[] | null => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null)

/** Une as duas listas pelo id (a de rotas manda; um modelo só da visão de cliente entra sem rotas). */
export function joinCommandCodeCatalog(routing: readonly CommandCodeRoutingModel[], client: readonly CommandCodeClientModel[]): CommandCodeRawModel[] {
    const byId = new Map<string, CommandCodeClientModel>()
    for (const item of client) if (typeof item?.id === "string") byId.set(item.id, item)
    const ids = new Set<string>()
    const result: CommandCodeRawModel[] = []
    const push = (id: string, route: CommandCodeRoutingModel | undefined) => {
        if (ids.has(id)) return
        ids.add(id)
        const info = byId.get(id)
        result.push({
            id,
            name: text(info?.display?.label) ?? text(route?.name) ?? text(info?.name),
            contextLength: finite(route?.context_length) ?? finite(info?.context_length),
            endpoints: strings(route?.supported_endpoints),
            group: text(info?.display?.group),
            inputModalities: strings(info?.inputModalities),
            reasoningEfforts: strings(info?.reasoningEfforts) ?? [],
            inputCost: finite(info?.pricing?.inputCost),
            outputCost: finite(info?.pricing?.outputCost),
            pricing: info?.pricing && typeof info.pricing === "object" ? info.pricing : null,
        })
    }
    for (const item of routing) if (typeof item?.id === "string") push(item.id, item)
    for (const item of client) if (typeof item?.id === "string") push(item.id, undefined)
    return result
}

/** APIs que o modelo atende, pela lista do catálogo; sem a lista, o prefixo do id decide (`claude-` → Messages). */
function apisOf(raw: Pick<CommandCodeRawModel, "id" | "endpoints"> | undefined): CommandCodeApi[] {
    if (raw?.endpoints) return COMMAND_CODE_APIS.filter((api) => raw.endpoints!.includes(ENDPOINT_PATHS[api]))
    if (raw && /^claude-/i.test(raw.id)) return ["messages"]
    return ["chat-completions"]
}

export interface CommandCodeRoute {
    api: CommandCodeApi
    baseURL: string
}

/** API de um modelo (Chat Completions sem catálogo). A base é sempre a oficial. */
export function commandCodeRoute(raw: Pick<CommandCodeRawModel, "id" | "endpoints"> | undefined): CommandCodeRoute {
    return { api: apisOf(raw)[0] ?? "chat-completions", baseURL: COMMAND_CODE_API_URL }
}

/** Utilizável pelo Opex: atende alguma das três APIs de texto (o `typesafe/jev`, só em `/systemone`, sai). */
export function isUsableCommandCodeModel(raw: CommandCodeRawModel): boolean {
    return apisOf(raw).length > 0
}

export function toCommandCodeModel(raw: CommandCodeRawModel): AiModelDto {
    return {
        id: raw.id,
        name: raw.name ?? raw.id,
        variants: [...new Set(raw.reasoningEfforts.filter(isAiSdkReasoningLevel))],
        group: raw.group,
        contextWindow: raw.contextLength,
        free: raw.inputCost === 0 && raw.outputCost === 0,
        inputModalities: raw.inputModalities ?? ["text"],
    }
}

export function toCommandCodeModels(list: readonly CommandCodeRawModel[]): AiModelDto[] {
    return list.filter(isUsableCommandCodeModel).map(toCommandCodeModel).sort((a, b) => a.id.localeCompare(b.id))
}
