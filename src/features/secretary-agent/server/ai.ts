import type { LanguageModelUsage, ModelMessage, ToolSet } from "ai"
import { z } from "zod"
import { prepareModel } from "@/lib/ai/stream"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { SecretaryDeliveryError } from "../ai-errors"
import { SECRETARY_CONSUMPTION_ORIGIN } from "../constants"
import { priceKey, stepCostUsd } from "../cost"
import type { SecretaryMainModel, SecretarySettings } from "../schemas"

export async function secretaryInference<T>(options: {
    settings: SecretarySettings; model: Pick<SecretaryMainModel, "provider" | "model" | "variant">; id: string; instructions: string;
    messages: ModelMessage[]; schema: z.ZodType<T>; signal?: AbortSignal; origin?: string; subject?: string; tools?: ToolSet;
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
            costUsd: cost.costUsd, billing: reported?.billing, apiKeyId: prepared.apiKeyId })
    }
    try {
        let streamError: unknown
        const run = ai.streamText({ model: prepared.model, providerOptions: prepared.providerOptions, abortSignal: signal, maxRetries: 0,
            instructions: `${options.instructions}\nTermine sempre chamando a ferramenta entregar.`, messages: options.messages,
            tools: { ...options.tools, entregar: ai.tool({ description: "Entrega o resultado final.", inputSchema: options.schema }) },
            toolChoice: "required", stopWhen: [ai.hasToolCall("entregar"), ai.stepCountIs(8)],
            onError: ({ error }) => { streamError ??= error },
            onStepFinish: async (part: { usage: LanguageModelUsage; providerMetadata?: Parameters<typeof prepared.takeStepCost>[0] }) => usage(part.usage, part.providerMetadata),
        })
        try {
            await run.consumeStream()
            const steps = await run.steps
            if (streamError !== undefined) throw streamError
            signal.throwIfAborted()
            const delivery = steps.at(-1)?.toolCalls.find((call) => call.toolName === "entregar")
            if (!delivery) throw new SecretaryDeliveryError("missing")
            const parsed = await options.schema.safeParseAsync(delivery.input)
            if (!parsed.success || delivery.invalid) throw new SecretaryDeliveryError("invalid")
            return parsed.data
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
