import type { LanguageModel } from "ai"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { createKeyFailoverFetch, fetchWithKeyFailover, requireAiProviderKeyOrder, type AiProviderKey } from "./api-keys"
import { commandCodeStatusMessage, isCommandCodeUpgradeRequired } from "./command-code-errors"
import { commandCodeRoute, joinCommandCodeCatalog, toCommandCodeModels, type CommandCodeClientModel, type CommandCodeRawModel, type CommandCodeRoutingModel } from "./command-code-models"
import { COMMAND_CODE_API_URL, COMMAND_CODE_USER_AGENT } from "./endpoints"
import { AiProviderError } from "./errors"
import type { AiModelDto } from "./providers"

/**
 * Command Code — SOMENTE servidor (OPE-190). Inferência pela Provider API (`/provider/v1`) com a chave do Studio,
 * em rodízio com troca em falha. Cada modelo é chamado pela API que o catálogo declara (Chat Completions,
 * Responses ou Messages), com a SDK correspondente da Vercel AI SDK. As respostas não informam custo.
 */

export { COMMAND_CODE_API_URL, commandCodeStatusMessage }

const LABEL = "Command Code"
const CATALOG_CACHE_MS = 2 * 60_000
/** Limite da consulta ao catálogo no caminho da geração: catálogo lento não segura o turno. */
export const COMMAND_CODE_CATALOG_TIMEOUT_MS = 5_000
/** Logger sob demanda: módulos que mockam o logger sem `loggerFor` também importam este arquivo (via catálogo). */
const log = () => loggerFor({ module: "ai", provider: "command-code" })
/** Modelo que não existe: a autenticação é conferida antes do modelo (401 = chave recusada), sem gerar nada. */
export const COMMAND_CODE_PROBE_MODEL = "__opex_probe__"

let catalogCache: { at: number; list: CommandCodeRawModel[] } | null = null

export function clearCommandCodeCatalogCache(): void {
    catalogCache = null
}

function networkError(error: unknown): AiProviderError {
    return new AiProviderError(`Não foi possível conectar ao Command Code: ${error instanceof Error ? error.message : String(error)}`)
}

async function readCatalogList<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_command_code"), LABEL, `${COMMAND_CODE_API_URL}${path}`, {
            headers: { Accept: "application/json", "User-Agent": COMMAND_CODE_USER_AGENT },
            cache: "no-store",
            signal,
        })
    } catch (error) {
        throw networkError(error)
    }
    if (!res.ok) throw new AiProviderError(`O Command Code respondeu HTTP ${res.status} ao listar os modelos`)
    const body = (await res.json()) as { data?: T[] }
    return Array.isArray(body.data) ? body.data : []
}

/** Catálogo unido (rotas + capacidades), público; cache curto. A visão de cliente é opcional: sem ela, só as rotas. */
async function loadCatalog(signal?: AbortSignal, fresh = false): Promise<CommandCodeRawModel[]> {
    if (!fresh && catalogCache && Date.now() - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.list
    const [routing, client] = await Promise.all([
        readCatalogList<CommandCodeRoutingModel>("/models", signal),
        readCatalogList<CommandCodeClientModel>("/models?view=client", signal).catch((error: unknown) => {
            if (signal?.aborted) throw error
            log().warn({ err: error instanceof Error ? error.message : String(error) }, "[command-code] visão de cliente do catálogo indisponível")
            return [] as CommandCodeClientModel[]
        }),
    ])
    const list = joinCommandCodeCatalog(routing, client)
    catalogCache = { at: Date.now(), list }
    return list
}

export async function listCommandCodeModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    return toCommandCodeModels(await loadCatalog(signal, true))
}

/** Catálogo para a geração: limite próprio de poucos segundos; falhou, usa o último lido (mesmo vencido) ou `null`. */
async function catalogForGeneration(signal?: AbortSignal): Promise<CommandCodeRawModel[] | null> {
    const timeout = AbortSignal.timeout(COMMAND_CODE_CATALOG_TIMEOUT_MS)
    try {
        return await loadCatalog(signal ? AbortSignal.any([signal, timeout]) : timeout)
    } catch (error) {
        if (signal?.aborted) throw error
        const reason = error instanceof Error ? error.message : String(error)
        if (catalogCache) {
            log().warn({ err: reason }, "[command-code] catálogo indisponível; usando o último catálogo lido")
            return catalogCache.list
        }
        log().warn({ err: reason }, "[command-code] catálogo indisponível e sem cópia anterior")
        return null
    }
}

/** Tipos de entrada do modelo pelo catálogo (cache); `null` quando o catálogo não respondeu. */
export async function commandCodeModelInputs(modelId: string, signal?: AbortSignal): Promise<string[] | null> {
    const raw = (await catalogForGeneration(signal))?.find((model) => model.id === modelId)
    return raw ? (raw.inputModalities ?? ["text"]) : null
}

/**
 * Confirma a chave (o catálogo é público e não prova nada): um pedido a um modelo inexistente volta 401 com chave
 * inválida e 403 `upgrade_required` com plano sem API (Go); outra resposta = chave aceita, sem gerar nada. Sem
 * `key`, as chaves em uso giram e trocam em falha; com `key`, confere só aquela.
 */
export async function verifyCommandCodeKey(signal?: AbortSignal, key?: AiProviderKey): Promise<void> {
    let res: Response
    try {
        const call = (attempt: AiProviderKey) =>
            debugFetch(integrationDebug("ai_command_code"), LABEL, `${COMMAND_CODE_API_URL}/chat/completions`, {
                method: "POST",
                headers: { Authorization: `Bearer ${attempt.apiKey}`, "Content-Type": "application/json", "User-Agent": COMMAND_CODE_USER_AGENT },
                body: JSON.stringify({ model: COMMAND_CODE_PROBE_MODEL, messages: [{ role: "user", content: "." }], max_tokens: 1 }),
                cache: "no-store",
                signal,
            })
        res = (await fetchWithKeyFailover("ai_command_code", LABEL, call, { keys: key ? [key] : undefined })).response
    } catch (error) {
        if (error instanceof AiProviderError) throw error
        throw networkError(error)
    }
    if (res.status === 401) throw new AiProviderError(commandCodeStatusMessage(401)!)
    if (res.status === 403) {
        const body = await res.text().catch(() => "")
        if (isCommandCodeUpgradeRequired(body)) throw new AiProviderError(commandCodeStatusMessage(403, { upgradeRequired: true })!)
        return
    }
    if (res.status >= 500) throw new AiProviderError(`O Command Code respondeu HTTP ${res.status} ao conferir a chave`)
}

/** `fetch` das SDKs: `User-Agent` do Opex e debug sem o corpo (prompts). A chave entra pelo rodízio. */
function commandCodeFetch(): typeof fetch {
    const debug = integrationDebug("ai_command_code")
    return async (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set("User-Agent", COMMAND_CODE_USER_AGENT)
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        // O `next` do fetch do Next.js não vale aqui (e não casa com o tipo do debugFetch).
        const request: Omit<RequestInit, "next"> & { next?: unknown } = { ...init, headers }
        delete request.next
        return debugFetch(debug, LABEL, url, request as Omit<RequestInit, "next">, { body: "(corpo omitido)" })
    }
}

export interface CommandCodeModel {
    model: LanguageModel
    /** Chave do chaveiro que respondeu por último na geração: o consumo é atribuído a ela (`apiKeyId` dos logs). */
    currentKeyId: () => string
}

/** Modelo pronto para a AI SDK, pela API que o catálogo declara para ele (Chat Completions sem catálogo). */
export async function createCommandCodeModel(modelId: string, options: { signal?: AbortSignal } = {}): Promise<CommandCodeModel> {
    const order = await requireAiProviderKeyOrder("ai_command_code", LABEL)
    const keys = createKeyFailoverFetch({
        order,
        label: LABEL,
        baseFetch: commandCodeFetch(),
        // A rota Messages usa o `x-api-key` da SDK da Anthropic; o Bearer vale em todas as rotas.
        applyKey: (headers, key) => headers.set("Authorization", `Bearer ${key.apiKey}`),
    })
    const currentKeyId = () => keys.current().id
    const catalog = await catalogForGeneration(options.signal)
    const raw = catalog?.find((item) => item.id === modelId)
    if (!raw) log().warn({ model: modelId, catalog: catalog !== null }, "[command-code] modelo sem rota no catálogo; usando a rota pelo id")
    const { api, baseURL } = commandCodeRoute(raw ?? { id: modelId, endpoints: null })
    const common = { apiKey: keys.initialApiKey, baseURL, fetch: keys.fetch }
    if (api === "responses") {
        const { createOpenAI } = await import("@ai-sdk/openai")
        return { model: createOpenAI(common).responses(modelId), currentKeyId }
    }
    if (api === "messages") {
        const { createAnthropic } = await import("@ai-sdk/anthropic")
        return { model: createAnthropic(common)(modelId), currentKeyId }
    }
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible")
    return { model: createOpenAICompatible({ ...common, name: "commandCode", includeUsage: true })(modelId), currentKeyId }
}
