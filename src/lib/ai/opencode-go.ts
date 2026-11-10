import type { LanguageModel } from "ai"
import { randomUUID } from "node:crypto"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { requireActiveAiProviderKey, type ActiveAiProviderKey } from "./api-keys"
import { AiProviderError } from "./errors"
import { opencodeGoStatusMessage } from "./opencode-go-errors"
import { OPENCODE_GO_API_URL, OPENCODE_GO_USER_AGENT } from "./endpoints"
import { opencodeGoRoute, toOpencodeGoModels, type OpencodeGoRawModel } from "./opencode-go-models"
import { addStepCost, createOpencodeGoCostScanner, type AiStepCost } from "./provider-cost"
import type { AiModelDto } from "./providers"

/**
 * OpenCode Go — SOMENTE servidor. Inferência pela API do gateway do Go com a chave da assinatura
 * (`oc_sk_…`), sem sessão do OpenCode no host. Cada modelo é chamado pela API que o catálogo do Go
 * declara (Chat Completions, Responses, Messages ou Generate Content), com a SDK correspondente da
 * Vercel AI SDK, o `x-opencode-session` estável por conversa e o `User-Agent` do Opex.
 */

export { OPENCODE_GO_API_URL, opencodeGoStatusMessage }

const LABEL = "OpenCode Go"
const CATALOG_CACHE_MS = 2 * 60_000
/** Limite da consulta ao catálogo no caminho da geração: catálogo lento não segura o turno. */
export const OPENCODE_GO_CATALOG_TIMEOUT_MS = 5_000
/** Logger sob demanda: módulos que mockam o logger sem `loggerFor` também importam este arquivo (via catálogo). */
const log = () => loggerFor({ module: "ai", provider: "opencode-go" })
/** Modelo que não existe: o Go valida a chave antes do modelo (401 = chave recusada, 400 = chave aceita), sem gerar nada. */
export const OPENCODE_GO_PROBE_MODEL = "__opex_probe__"

let catalogCache: { at: number; list: OpencodeGoRawModel[] } | null = null

export function clearOpencodeGoCatalogCache(): void {
    catalogCache = null
}

/** Chave **em uso** do chaveiro do Go (OPE-156); sem chave ativa, erro acionável antes de qualquer chamada. */
function activeOpencodeGoKey(): Promise<ActiveAiProviderKey> {
    return requireActiveAiProviderKey("ai_opencode_go", LABEL)
}

function networkError(error: unknown): AiProviderError {
    return new AiProviderError(`Não foi possível conectar ao OpenCode Go: ${error instanceof Error ? error.message : String(error)}`)
}

/** Catálogo bruto do gateway (cache curto); a lista é pública, mas só é lida com a integração configurada. */
async function loadCatalog(signal?: AbortSignal, fresh = false): Promise<OpencodeGoRawModel[]> {
    if (!fresh && catalogCache && Date.now() - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.list
    const { apiKey } = await activeOpencodeGoKey()
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_opencode_go"), LABEL, `${OPENCODE_GO_API_URL}/models`, {
            headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": OPENCODE_GO_USER_AGENT },
            cache: "no-store",
            signal,
        })
    } catch (error) {
        throw networkError(error)
    }
    const known = opencodeGoStatusMessage(res.status)
    if (known) throw new AiProviderError(known)
    if (!res.ok) throw new AiProviderError(`O OpenCode Go respondeu HTTP ${res.status} ao listar os modelos`)
    const body = (await res.json()) as { data?: OpencodeGoRawModel[] }
    const list = Array.isArray(body.data) ? body.data : []
    catalogCache = { at: Date.now(), list }
    return list
}

export async function listOpencodeGoModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    return toOpencodeGoModels(await loadCatalog(signal, true))
}

/**
 * Catálogo para a geração: respeita o cancelamento de quem pediu e um limite próprio de poucos
 * segundos. Falhou (lento, fora do ar): usa o último catálogo bom, mesmo vencido, com aviso no log;
 * sem nenhum, `null`. Cancelamento de quem pediu é repassado (não vira catálogo vazio).
 */
async function catalogForGeneration(signal?: AbortSignal): Promise<OpencodeGoRawModel[] | null> {
    const timeout = AbortSignal.timeout(OPENCODE_GO_CATALOG_TIMEOUT_MS)
    try {
        return await loadCatalog(signal ? AbortSignal.any([signal, timeout]) : timeout)
    } catch (error) {
        if (signal?.aborted) throw error
        const reason = error instanceof Error ? error.message : String(error)
        if (catalogCache) {
            log().warn({ err: reason }, "[opencode-go] catálogo indisponível; usando o último catálogo lido")
            return catalogCache.list
        }
        log().warn({ err: reason }, "[opencode-go] catálogo indisponível e sem cópia anterior")
        return null
    }
}

/** Tipos de entrada do modelo pelo catálogo (cache); `null` quando o catálogo não respondeu. */
export async function opencodeGoModelInputs(modelId: string, signal?: AbortSignal): Promise<string[] | null> {
    const raw = (await catalogForGeneration(signal))?.find((model) => model.id === modelId)
    return raw ? (raw.modalities?.input ?? ["text"]) : null
}

/**
 * Confirma a chave (a lista de modelos é pública e não prova nada): um pedido a um modelo inexistente
 * volta 401 com chave inválida e 400 com chave aceita, sem consumir a cota.
 */
export async function verifyOpencodeGoKey(signal?: AbortSignal): Promise<void> {
    const { apiKey } = await activeOpencodeGoKey()
    let res: Response
    try {
        res = await debugFetch(
            integrationDebug("ai_opencode_go"),
            LABEL,
            `${OPENCODE_GO_API_URL}/chat/completions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "User-Agent": OPENCODE_GO_USER_AGENT,
                    "x-opencode-session": `opex-probe-${randomUUID()}`,
                },
                body: JSON.stringify({ model: OPENCODE_GO_PROBE_MODEL, messages: [{ role: "user", content: "." }], max_tokens: 1 }),
                cache: "no-store",
                signal,
            },
        )
    } catch (error) {
        throw networkError(error)
    }
    if (res.status === 401) throw new AiProviderError(opencodeGoStatusMessage(401)!)
    if (res.status >= 500) throw new AiProviderError(`O OpenCode Go respondeu HTTP ${res.status} ao conferir a chave`)
}

/** Medidor do custo das respostas do Go numa geração (lido a cada passo ou no fim). */
export interface OpencodeGoMeter {
    /** Custo acumulado desde a última leitura (e zera). */
    take(): AiStepCost | null
}

function meteredBody(body: ReadableStream<Uint8Array>, onCost: (cost: AiStepCost) => void): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder()
    const scanner = createOpencodeGoCostScanner(onCost)
    return body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                scanner.push(decoder.decode(chunk, { stream: true }))
                controller.enqueue(chunk)
            },
            flush() {
                scanner.push(decoder.decode())
                scanner.end()
            },
        }),
    )
}

/** `fetch` das SDKs: cabeçalhos exigidos pelo Go, debug sem o corpo (prompts) e leitura do custo. */
function opencodeGoFetch(apiKey: string, session: string, onCost: (cost: AiStepCost) => void): typeof fetch {
    const debug = integrationDebug("ai_opencode_go")
    return async (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Bearer ${apiKey}`)
        headers.set("User-Agent", OPENCODE_GO_USER_AGENT)
        headers.set("x-opencode-session", session)
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        // O `next` do fetch do Next.js não vale aqui (e não casa com o tipo do debugFetch).
        const request: Omit<RequestInit, "next"> & { next?: unknown } = { ...init, headers }
        delete request.next
        const response = await debugFetch(debug, LABEL, url, request as Omit<RequestInit, "next">, { body: "(corpo omitido)" })
        if (!response.body) return response
        return new Response(meteredBody(response.body, onCost), { status: response.status, statusText: response.statusText, headers: response.headers })
    }
}

export interface OpencodeGoModel {
    model: LanguageModel
    meter: OpencodeGoMeter
    /** Chave do chaveiro usada na preparação: o consumo é atribuído a ela (`apiKeyId` dos logs). */
    apiKeyId: string
}

/**
 * Modelo pronto para a AI SDK. `session` é o id estável da conversa (`x-opencode-session`: roteamento
 * e cache de prompt do Go); sem ele, cada geração ganha um id novo.
 */
export async function createOpencodeGoModel(modelId: string, options: { session?: string | null; signal?: AbortSignal } = {}): Promise<OpencodeGoModel> {
    const { id: apiKeyId, apiKey } = await activeOpencodeGoKey()
    const session = options.session?.trim() || `opex-${randomUUID()}`
    let pending: AiStepCost | null = null
    const fetchImpl = opencodeGoFetch(apiKey, session, (cost) => {
        pending = addStepCost(pending, cost)
    })
    const meter: OpencodeGoMeter = {
        take() {
            const value = pending
            pending = null
            return value
        },
    }
    const catalog = await catalogForGeneration(options.signal)
    const raw = catalog?.find((item) => item.id === modelId)
    // Sem catálogo (nem cópia anterior) ou modelo fora dele: vai por Chat Completions, com aviso no log.
    if (!raw) log().warn({ model: modelId, catalog: catalog !== null }, "[opencode-go] modelo sem rota no catálogo; usando Chat Completions")
    const { api, baseURL } = opencodeGoRoute(raw)
    const common = { apiKey, baseURL, fetch: fetchImpl }
    if (api === "responses") {
        const { createOpenAI } = await import("@ai-sdk/openai")
        return { model: createOpenAI(common).responses(modelId), meter, apiKeyId }
    }
    if (api === "messages") {
        const { createAnthropic } = await import("@ai-sdk/anthropic")
        return { model: createAnthropic(common)(modelId), meter, apiKeyId }
    }
    if (api === "generate-content") {
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
        return { model: createGoogleGenerativeAI(common)(modelId), meter, apiKeyId }
    }
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible")
    return { model: createOpenAICompatible({ ...common, name: "opencodeGo", includeUsage: true })(modelId), meter, apiKeyId }
}
