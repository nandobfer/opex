import type { LanguageModelUsage, ModelMessage, ToolSet } from "ai"
import { z } from "zod"
import { prepareModel } from "@/lib/ai/stream"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { tokenDetailsOf, tokensFromUsage } from "@/lib/ai/pricing/usage"
import { SecretaryDeliveryError } from "../ai-errors"
import { SECRETARY_CONSUMPTION_ORIGIN } from "../constants"
import { priceKey, stepCostUsd } from "../cost"
import type { SecretaryMainModel, SecretarySettings } from "../schemas"

/** Só os caminhos dos campos que falharam (nunca os valores). */
function issuePaths(error: z.ZodError): string[] {
    return [...new Set(error.issues.map((issue) => issue.path.map(String).join(".")).filter(Boolean))].slice(0, 8)
}

export async function secretaryInference<T>(options: {
    settings: SecretarySettings; model: Pick<SecretaryMainModel, "provider" | "model" | "variant">; id: string; instructions: string;
    messages: ModelMessage[]; schema: z.ZodType<T>; signal?: AbortSignal; origin?: string; subject?: string; tools?: ToolSet;
    /** Schema que o modelo vê na ferramenta `entregar` (mais tolerante); o resultado ainda passa por `normalize` e `schema`. */
    deliverySchema?: z.ZodType; normalize?: (raw: unknown) => unknown;
}): Promise<T> {
    const { provider, model, variant } = options.model
    if (!provider || !model) throw new Error("Configure o provedor e o modelo do Secretário.")
    const ai = await import("ai")
    const signal = options.signal ?? AbortSignal.timeout(90_000)
    const prepared = await prepareModel({ provider, model, variant, title: "Agente Secretário", session: options.id, signal })
    let step = 0
    const usage = async (tokens: LanguageModelUsage, metadata: Parameters<typeof prepared.takeStepCost>[0]) => {
        const reported = prepared.takeStepCost(metadata)
        const cost = stepCostUsd(reported?.costUsd, { inputTokens: tokens.inputTokens ?? 0, outputTokens: tokens.outputTokens ?? 0 }, options.settings.pricing[priceKey(provider, model)])
        await recordAiConsumption({ dedupKey: `secretary:${options.id}:${++step}`, provider, model, subject: options.subject, origin: options.origin ?? SECRETARY_CONSUMPTION_ORIGIN,
            inputTokens: tokens.inputTokens ?? null, outputTokens: tokens.outputTokens ?? null, totalTokens: tokens.totalTokens ?? null,
            costUsd: cost.costUsd, billing: reported?.billing, apiKeyId: prepared.apiKeyId, tokenDetails: tokenDetailsOf(tokensFromUsage(tokens)) })
    }
    const strict = async (raw: unknown) => options.schema.safeParseAsync(options.normalize ? options.normalize(raw) : raw)
    try {
        let streamError: unknown
        let delivered: { value: T } | undefined
        // A entrega só encerra o laço quando é válida: o erro de validação volta ao modelo como resultado da ferramenta e ele
        // corrige no passo seguinte, dentro do limite de passos.
        const entregar = ai.tool({
            description: "Entrega o resultado final.",
            inputSchema: options.deliverySchema ?? options.schema,
            execute: async (raw: unknown) => {
                const parsed = await strict(raw)
                if (!parsed.success) throw new Error(`Formato inválido nos campos: ${issuePaths(parsed.error).join(", ") || "(raiz)"}. Corrija e chame entregar de novo.`)
                delivered = { value: parsed.data }
                return { ok: true }
            },
        })
        const run = ai.streamText({ model: prepared.model, providerOptions: prepared.providerOptions, abortSignal: signal, maxRetries: 0,
            instructions: `${options.instructions}\nTermine sempre chamando a ferramenta entregar.`, messages: options.messages,
            tools: { ...options.tools, entregar },
            toolChoice: "required", stopWhen: [() => delivered !== undefined, ai.stepCountIs(8)],
            onError: ({ error }) => { streamError ??= error },
            onStepFinish: async (part: { usage: LanguageModelUsage; providerMetadata?: Parameters<typeof prepared.takeStepCost>[0] }) => usage(part.usage, part.providerMetadata),
        })
        try {
            await run.consumeStream()
            const steps = await run.steps
            if (streamError !== undefined) throw streamError
            signal.throwIfAborted()
            if (delivered) return delivered.value
            const attempt = [...steps].reverse().flatMap((item) => item.toolCalls).find((call) => call.toolName === "entregar")
            if (!attempt) throw new SecretaryDeliveryError("missing")
            const parsed = await strict(attempt.input)
            throw new SecretaryDeliveryError("invalid", parsed.success ? [] : issuePaths(parsed.error))
        } catch (error) {
            signal.throwIfAborted()
            const cause = streamError ?? error
            if (ai.ToolChoiceViolationError.isInstance(cause)) throw new SecretaryDeliveryError("missing")
            throw cause
        }
    } finally {
        await prepared.dispose()
    }
}
