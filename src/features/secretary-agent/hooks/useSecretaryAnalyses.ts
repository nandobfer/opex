"use client"

import { useEvolution } from "@/features/evolution-api/hooks/useEvolution"
import { ANALYSIS_DONE_STATES, type AnalysisChatState, type AnalysisPhase, type AnalysisStatus } from "../constants"

export type AnalysisDto = { _id: string; status: AnalysisStatus; phase: AnalysisPhase; at: string; chats: { jid: string; state: AnalysisChatState; error?: string }[]; current?: string; messages: number; cost: number; discoveries: string[]; error?: string }

/** Conversas que contam como lidas no progresso. */
export const analysisReadCount = (run: Pick<AnalysisDto, "chats">) => run.chats.filter((item) => ANALYSIS_DONE_STATES.includes(item.state)).length

/** Rótulo da sub-aba Personalidade: mostra a análise em andamento ao navegar pelas outras abas do agente. */
export const personalityTabLabel = (active: Pick<AnalysisDto, "chats"> | null) =>
    active ? `Personalidade · Analisando ${analysisReadCount(active)}/${active.chats.length}` : "Personalidade"

/**
 * Análises gravadas no servidor (a execução continua em segundo plano). Ao voltar à tela, o progresso vem desta
 * consulta; o evento `secretary-analysis-updated` invalida a chave e o polling de 15 s fica de reserva. A em andamento
 * vem primeiro.
 */
export function useSecretaryAnalyses() {
    const query = useEvolution<AnalysisDto[]>("/secretary/analyses", true, 15_000)
    const runs = [...(query.data ?? [])].sort((a, b) => Number(b.status === "running") - Number(a.status === "running"))
    return { query, runs, active: runs.find((run) => run.status === "running") ?? null }
}
