import type { LanguageModelUsage, ModelMessage, ToolSet } from "ai"
import { z } from "zod"
import { prepareModel } from "@/lib/ai/stream"
import { recordAiConsumption } from "@/lib/ai/consumption"
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
        const input = { model: prepared.model, providerOptions: prepared.providerOptions, abortSignal: signal, maxRetries: 0,
            instructions: options.instructions, messages: options.messages, output: ai.Output.object({ schema: options.schema }),
            onStepFinish: async (part: { usage: LanguageModelUsage; providerMetadata?: Parameters<typeof prepared.takeStepCost>[0] }) => usage(part.usage, part.providerMetadata),
        }
        if (!options.tools) return (await ai.generateText(input)).output
        const run = ai.streamText({ ...input, tools: options.tools, stopWhen: ai.stepCountIs(8) })
        await run.consumeStream()
        return await run.output
    } finally {
        await prepared.dispose()
    }
}
