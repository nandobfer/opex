/**
 * Regras de orçamento do portal do cliente (módulo PURO, cliente e servidor).
 *
 * A IA estima as **horas reais** (H). O cliente vê `H × fator de lucro` e o **faturamento** é
 * `(H × fator) × custo por hora`. A tela interna mostra a estimativa **real** (H).
 */

import type { GithubRepoLabelData } from "@/features/github/types"
import type { ClienteRepoDto } from "./types"

export interface ClientEstimate {
    /** Horas reais estimadas pela IA (visão interna). */
    hours: number
    /** Horas exibidas ao cliente (H × fator). */
    clientHours: number
    /** Faturamento em reais (clientHours × custo por hora). */
    billingBrl: number
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Horas reais (H) normalizadas para exibição/gravação (nunca negativas, 2 casas). */
export const roundHours = (value: number) => round2(Math.max(0, value || 0))

/** Estimativa do cliente a partir das horas reais, do fator de lucro e do custo por hora. */
export function computeClientEstimate(estimatedHours: number, profitFactor: number, hourlyRate: number): ClientEstimate {
    const hours = roundHours(estimatedHours)
    const factor = Math.max(1, profitFactor || 1)
    const rate = Math.max(0, hourlyRate || 0)
    const clientHours = round2(hours * factor)
    return { hours, clientHours, billingBrl: round2(clientHours * rate) }
}

/** Formata horas em `H:mm` (ex.: `2` → `2:00`, `1.5` → `1:30`). */
export function formatHoursLabel(hours: number): string {
    const totalMinutes = Math.round(Math.max(0, hours || 0) * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}:${String(m).padStart(2, "0")}`
}

/** Formata o fator de lucro (ex.: `10` → `10x`). */
export function formatFactorLabel(factor: number): string {
    const value = Number.isInteger(factor) ? String(factor) : factor.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    return `${value}x`
}

/** Rótulo do GitHub a partir do repositório do cliente (usado pelo `GithubRepoLabel`). */
export function repoLabel(repo: ClienteRepoDto): GithubRepoLabelData {
    return { fullName: repo.repo, ownerAvatarUrl: repo.ownerAvatarUrl, description: repo.description, private: repo.private }
}

/** Índice `owner/repo` (minúsculo) → rótulo do GitHub, para os cards do portal. */
export function repoLabelIndex(projects: readonly ClienteRepoDto[]): ReadonlyMap<string, GithubRepoLabelData> {
    return new Map(projects.map((project) => [project.repo.toLowerCase(), repoLabel(project)]))
}

/** Rótulo de um repositório pelo índice; sem dado do GitHub, mantém a inicial. */
export function repoLabelFrom(repo: string, index?: ReadonlyMap<string, GithubRepoLabelData>): GithubRepoLabelData {
    return index?.get(repo.toLowerCase()) ?? { fullName: repo, ownerAvatarUrl: null, description: null, private: false }
}
