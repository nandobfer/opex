import { formatCost } from "@/features/adversarial-agent/components/ReviewBadges"
import { formatTokens } from "@/features/time/format"
import { getAiProvider, isAiProviderId } from "@/lib/ai/providers"
import type { ArchitectDiagramDto } from "./types"

/** Custo da versão; quando o provedor não informa custo (provedores diretos), os tokens. */
export function diagramUsageLabel(diagram: Pick<ArchitectDiagramDto, "costUsd" | "tokens">): string {
    return diagram.costUsd === null ? `${formatTokens(diagram.tokens)} tokens` : formatCost(diagram.costUsd)
}

/** "Anthropic · claude-…" (versões antigas: OpenCode, modelo desconhecido). */
export function diagramProviderLabel(diagram: Pick<ArchitectDiagramDto, "provider" | "model">): string {
    const name = isAiProviderId(diagram.provider) ? getAiProvider(diagram.provider).name : diagram.provider
    return diagram.model ? `${name} · ${diagram.model}` : name
}
