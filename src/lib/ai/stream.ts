import { streamText, type LanguageModel } from "ai"
import { loggerFor } from "@/lib/logger"
import { createGeminiProvider } from "./gemini"
import { createOpencodeProvider } from "./opencode"
import type { AiProviderId } from "./providers"
import { AiProviderError } from "./errors"

/**
 * Geração em streaming pela Vercel AI SDK — SOMENTE servidor. Ponto único das features: nenhuma
 * feature fala com OpenCode ou Gemini diretamente.
 */

export interface AiStreamRequest {
    provider: AiProviderId
    model: string
    instructions: string
    prompt: string
    /** OpenCode: variante do modelo; Gemini: nível de thinking. */
    variant?: string | null
    /** Só OpenCode. */
    agent?: string | null
    /** Só Gemini (o OpenCode ignora parâmetros de amostragem). */
    temperature?: number | null
    maxOutputTokens?: number | null
    /** Título da sessão criada no OpenCode. */
    title?: string
    signal?: AbortSignal
}

export interface AiUsage {
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    /** Custo em USD informado pelo provedor (OpenCode). */
    costUsd: number | null
}

/** Evento do stream entregue às features (e repassado ao navegador como NDJSON). */
export type AiStreamEvent =
    | { type: "delta"; text: string }
    | { type: "reasoning" }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; finishReason: string; usage: AiUsage; durationMs: number }
    | { type: "error"; message: string }

const log = loggerFor({ module: "ai" })

interface PreparedModel {
    model: LanguageModel
    providerOptions?: Parameters<typeof streamText>[0]["providerOptions"]
    dispose: () => Promise<void>
}

async function prepareModel(request: AiStreamRequest): Promise<PreparedModel> {
    if (request.provider === "opencode") {
        const { provider, directory } = await createOpencodeProvider()
        const model = provider(request.model, {
            agent: request.agent || undefined,
            variant: request.variant || undefined,
            sessionTitle: request.title ?? "Opex",
            location: directory ? { directory } : undefined,
            createNewSession: true,
            // Formulários (pergunta do agente) não têm quem responda: cancela e encerra o turno.
            formPolicy: "cancel",
            logger: false,
        })
        return { model, dispose: () => provider.dispose() }
    }
    const google = await createGeminiProvider()
    return {
        model: google(request.model),
        providerOptions: request.variant ? { google: { thinkingConfig: { thinkingLevel: request.variant, includeThoughts: false } } } : undefined,
        dispose: async () => {},
    }
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function describeAiError(error: unknown): string {
    if (error instanceof AiProviderError) return error.message
    const message = error instanceof Error ? error.message : String(error)
    if (/401|unauthori[sz]ed|api key/i.test(message)) return `Credencial recusada pelo provedor: ${message}`
    if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) return `Provedor inacessível: ${message}`
    return message || "Falha desconhecida do provedor de IA"
}

/** Gera em streaming; nunca lança — falhas viram um evento `error` final. */
export async function* streamAi(request: AiStreamRequest): AsyncGenerator<AiStreamEvent> {
    const startedAt = Date.now()
    let prepared: PreparedModel
    try {
        prepared = await prepareModel(request)
    } catch (error) {
        yield { type: "error", message: describeAiError(error) }
        return
    }
    let reasoningAnnounced = false
    let failed = false
    let costUsd: number | null = null
    // OpenCode informa falhas do modelo só nos metadados do passo (`outcome: failed`), sem parte `error`.
    let stepError: string | null = null
    try {
        const result = streamText({
            model: prepared.model,
            instructions: request.instructions,
            prompt: request.prompt,
            abortSignal: request.signal,
            providerOptions: prepared.providerOptions,
            ...(request.provider === "gemini" && request.temperature != null ? { temperature: request.temperature } : {}),
            ...(request.provider === "gemini" && request.maxOutputTokens != null ? { maxOutputTokens: request.maxOutputTokens } : {}),
        })
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta":
                    if (part.text) yield { type: "delta", text: part.text }
                    break
                case "reasoning-delta":
                    if (!reasoningAnnounced) {
                        reasoningAnnounced = true
                        yield { type: "reasoning" }
                    }
                    break
                case "tool-call":
                    yield { type: "tool", id: part.toolCallId, name: part.toolName, state: "running" }
                    break
                case "tool-result":
                    yield { type: "tool", id: part.toolCallId, name: part.toolName, state: "done" }
                    break
                case "tool-error":
                    yield { type: "tool", id: part.toolCallId, name: part.toolName, state: "error" }
                    break
                case "tool-approval-request":
                    yield { type: "notice", message: "O agente pediu aprovação para usar uma ferramenta; aprovações não são suportadas aqui. Ajuste as permissões do agente no OpenCode." }
                    break
                case "finish-step": {
                    const meta = part.providerMetadata?.opencode as { cost?: unknown; error?: { message?: unknown } } | undefined
                    const cost = numberOrNull(meta?.cost)
                    if (cost !== null) costUsd = (costUsd ?? 0) + cost
                    if (typeof meta?.error?.message === "string") stepError = meta.error.message
                    break
                }
                case "error":
                    failed = true
                    yield { type: "error", message: describeAiError(part.error) }
                    break
                case "abort":
                    failed = true
                    break
                case "finish":
                    if (!failed && part.finishReason === "error") {
                        failed = true
                        yield { type: "error", message: describeAiError(new Error(stepError ?? "O modelo terminou com erro")) }
                    } else if (!failed) {
                        yield {
                            type: "done",
                            finishReason: part.finishReason,
                            durationMs: Date.now() - startedAt,
                            usage: {
                                inputTokens: numberOrNull(part.totalUsage.inputTokens),
                                outputTokens: numberOrNull(part.totalUsage.outputTokens),
                                totalTokens: numberOrNull(part.totalUsage.totalTokens),
                                costUsd,
                            },
                        }
                    }
                    break
            }
        }
    } catch (error) {
        if (!request.signal?.aborted) {
            log.warn({ provider: request.provider, model: request.model, err: error instanceof Error ? error.message : error }, "[ai] falha na geração")
            yield { type: "error", message: describeAiError(error) }
        }
    } finally {
        await prepared.dispose().catch(() => undefined)
    }
}
