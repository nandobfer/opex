import type { AiModelDto } from "@/lib/ai/providers"
import type { ModelSourceDto } from "../../types"

/** Origem do modelo em uso (dica do texto e resumo do "padrão" no popover). */
export const MODEL_SOURCE_LABELS: Record<ModelSourceDto, string> = {
    fork: "trocado neste fork",
    workbench: "definido nesta mesa",
    central: "da central",
    global: "do padrão global",
}

/** Nome do modelo para a tela (catálogo do OpenCode) ou "Padrão do agente". */
export function modelName(model: string | null, models?: AiModelDto[]): string {
    if (!model) return "Padrão do agente"
    return models?.find((item) => item.id === model)?.name ?? model
}

/** "Claude Opus (high)" / "GPT-5" / "Padrão do agente". */
export function describeChoice(choice: { model: string | null; variant: string | null }, models?: AiModelDto[]): string {
    return `${modelName(choice.model, models)}${choice.model && choice.variant ? ` (${choice.variant})` : ""}`
}
