import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import type { AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { AiKeysExhaustedError, fetchWithKeyFailover, type AiProviderKey } from "./api-keys"
import { recordJevUsage, type JevUsageContext } from "./record-jev-usage"

/**
 * JEV (TypeSafe) — SOMENTE servidor.
 *
 * O JEV é um modelo "System One" de **decisão estruturada**: a API `POST /v1/systemone` recebe um
 * estado (`state`) e perguntas tipadas (`questions`) e devolve respostas estruturadas (`answers`),
 * sem geração de texto. Cada avaliação registra tokens e custo uma única vez, no servidor.
 */

export const JEV_API_URL = "https://api.typesafe.ai/v1"

const LABEL = "JEV"

interface JevModelRaw {
    name: string
    description?: string
    release_date?: string
}

export function toJevModel(raw: JevModelRaw): AiModelDto {
    return {
        id: raw.name,
        name: raw.name,
        // O JEV não expõe variantes por modelo.
        variants: [],
        group: null,
        contextWindow: null,
        free: false,
    }
}

/**
 * Modelos e aliases aceitos no campo `model` (`jev-latest`, `jev-preview`, ...). As chaves em uso giram e
 * trocam em falha (OPE-179); `key` confere só aquela chave.
 */
export async function listJevModels(signal?: AbortSignal, key?: AiProviderKey): Promise<AiModelDto[]> {
    let res: Response
    try {
        const call = (attempt: AiProviderKey) =>
            debugFetch(integrationDebug("ai_jev"), LABEL, `${JEV_API_URL}/models`, {
                headers: { Authorization: `Bearer ${attempt.apiKey}`, Accept: "application/json" },
                cache: "no-store",
                signal,
            })
        res = (await fetchWithKeyFailover("ai_jev", LABEL, call, { keys: key ? [key] : undefined })).response
    } catch (error) {
        if (error instanceof AiProviderError) throw error
        throw new AiProviderError(`Não foi possível conectar ao JEV: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`O JEV recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`O JEV respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { models?: JevModelRaw[] }
    return (body.models ?? []).map(toJevModel)
}

// ── System One (decisão estruturada) ─────────────────────────────────────────

/** Critério de uma questão `noul` (o que conta como sim e como não). */
export interface JevNoulCriteria {
    true: string
    false: string
}

/** Questão tipada enviada ao JEV (`/v1/systemone`). */
export type JevQuestion =
    | { type: "noul"; instructions: string; criteria?: JevNoulCriteria }
    | { type: "choice"; instructions: string; criteria: Record<string, string> }
    | { type: "score"; instructions: string; criteria: string[] }

export interface JevNoulAnswer {
    type: "noul"
    noul: number
}

export interface JevChoiceAnswer {
    type: "choice"
    choice: string
    confidence: number
    probabilities: Record<string, number>
}

export interface JevScoreAnswer {
    type: "score"
    score: number
    confidence: number
    legend: Record<string, unknown>
    probabilities: Record<string, number>
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer

export interface JevResponse {
    model?: string
    answers?: Record<string, JevAnswer>
    usage?: { input_tokens?: number; output_tokens?: number }
}

export interface JevSystemOneInput {
    model: string
    tracking: JevUsageContext
    /** Estado avaliado: texto ou objeto JSON (as perguntas são julgadas contra ele). */
    state: unknown
    questions: Record<string, JevQuestion>
    signal?: AbortSignal
}

/**
 * Envia `state` + `questions` tipadas e devolve as respostas (`answers`). SOMENTE servidor; nunca
 * gera texto. Erros viram `AiProviderError` com mensagem acionável em pt-BR.
 */
export async function askJevSystemOne(input: JevSystemOneInput): Promise<JevResponse> {
    const startedAt = Date.now()
    let body: JevResponse | undefined
    let failure: string | null = null
    let apiKeyId: string | null = null
    try {
        let res: Response
        try {
            // Rodízio por chamada (OPE-179): a chave que respondeu recebe o registro de uso.
            const result = await fetchWithKeyFailover("ai_jev", LABEL, (key) => {
                apiKeyId = key.id
                return debugFetch(integrationDebug("ai_jev"), LABEL, `${JEV_API_URL}/systemone`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ model: input.model, state: input.state, questions: input.questions }),
                    cache: "no-store",
                    signal: input.signal,
                })
            })
            res = result.response
            apiKeyId = result.key.id
        } catch (error) {
            if (error instanceof AiKeysExhaustedError) apiKeyId = error.lastKeyId
            if (error instanceof AiProviderError) throw error
            throw new AiProviderError(`Não foi possível conectar ao JEV: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (res.status === 401 || res.status === 403) throw new AiProviderError(`O JEV recusou a API key (HTTP ${res.status})`)
        if (res.status === 400 || res.status === 422) throw new AiProviderError(`O JEV recusou a requisição (HTTP ${res.status}): confira o modelo e as perguntas`)
        if (!res.ok) throw new AiProviderError(`O JEV respondeu HTTP ${res.status}`)
        body = (await res.json()) as JevResponse
        if (!body?.answers) throw new AiProviderError("O JEV não devolveu respostas")
        return body
    } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
        throw error
    } finally {
        await recordJevUsage({
            ...input.tracking,
            model: body?.model || input.model,
            ok: failure === null,
            error: failure,
            durationMs: Date.now() - startedAt,
            usage: body?.usage,
            apiKeyId,
        })
    }
}
