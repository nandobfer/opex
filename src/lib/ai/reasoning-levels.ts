/**
 * Esforços de raciocínio que a opção `reasoning` da AI SDK aceita (módulo PURO). Os provedores por gateway
 * (OpenCode Go, Command Code) informam no catálogo quais cada modelo usa.
 */
export const AI_SDK_REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const
export type AiSdkReasoningLevel = (typeof AI_SDK_REASONING_LEVELS)[number]

export function isAiSdkReasoningLevel(value: string): value is AiSdkReasoningLevel {
    return (AI_SDK_REASONING_LEVELS as readonly string[]).includes(value)
}
