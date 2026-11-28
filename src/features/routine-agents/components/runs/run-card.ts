import { formatUsd } from "@/features/ai-billing/money"
import type { CostKind } from "@/features/ai-billing/cost-tone"
import { occupiesSlot } from "../../status"
import type { RoutineRunDto } from "../../types"
import { formatCostPair, formatDateTime, formatDuration, formatTime } from "../../format"

/**
 * Regras puras do card de execução (OPE-213): trecho do relato, tempos, destaque e células de custo.
 * Classes compartilhadas com o skeleton da aba Execuções.
 */

/** Altura estimada do card na lista virtualizada (acima de 50 execuções). */
export const ROUTINE_RUN_CARD_ESTIMATE = 184
export const ROUTINE_RUN_CARD_GAP = "space-y-3"
export const ROUTINE_RUN_CARD_CLASS = "rounded-xl border bg-card p-4 shadow-sm"

/**
 * Decisão do dono (27/11/2026): o card mostra o **início** do relato final em texto simples, cortado em 3 linhas
 * com reticências (line-clamp na tela). Tira a marcação do Markdown para o trecho não exibir `#`, `**` ou crases.
 */
export function reportExcerpt(report: string | null | undefined): string | null {
    if (!report) return null
    const text = report
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(\S(?:.*?\S)?)\1/g, "$2")
        .replace(/~~(.*?)~~/g, "$1")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\|/g, " ")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n")
    return text || null
}

/** Início, término e duração do card; término e duração só depois que a execução terminou. */
export function runCardTimes(run: Pick<RoutineRunDto, "startedAt" | "queuedAt" | "finishedAt" | "activeMs">): { start: string; end: string | null; duration: string | null } {
    return {
        start: formatDateTime(run.startedAt ?? run.queuedAt),
        end: run.finishedAt ? formatTime(run.finishedAt) : null,
        duration: run.finishedAt ? formatDuration(run.activeMs) : null,
    }
}

/** Decisão do dono (27/11/2026): fica destacado o card **em execução** — Executando e Esperando (turno vivo). */
export const isLiveRun = (run: Pick<RoutineRunDto, "status">) => occupiesSlot(run.status)

/** Motor e modelo da execução, como na página dela. */
export const runEngineLabel = (run: Pick<RoutineRunDto, "engine" | "model">) => [run.engine === "opex" ? "Motor Opex" : "OpenCode no host", run.model].filter(Boolean).join(" · ")

/** Célula de custo (OPE-203): valor em US$ (`*` = parcial) e a dica com o R$ e as marcações; sem custo, "—". */
export function runCostCell(run: Pick<RoutineRunDto, "cost" | "engine">, kind: CostKind): { text: string; title: string; known: boolean } {
    if (!run.cost) return { text: "—", known: false, title: run.engine === "opencode" ? "Motor OpenCode: custo de tabela e efetivo fora desta versão" : "Sem consumo registrado" }
    const usd = kind === "list" ? run.cost.listUsd : run.cost.effectiveUsd
    const brl = kind === "list" ? run.cost.listBrl : run.cost.effectiveBrl
    const label = kind === "list" ? "Custo de tabela" : "Custo efetivo"
    const marks = run.cost.partial ? "*" : ""
    return { text: usd === null ? `—${marks}` : `${formatUsd(usd)}${marks}`, known: usd !== null, title: `${label}: ${formatCostPair(usd, brl, { partial: run.cost.partial, estimated: run.cost.estimated })}` }
}
