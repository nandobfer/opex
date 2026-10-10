"use client"

import { useCallback, useState } from "react"
import { withBasePath } from "@/lib/base-path"
import type { DraftEstimateDto, DraftPreviewDto, OrcamentoDraftDto } from "../types"
import { useClientePortal } from "./ClientePortalContext"

export interface BudgetReviewState {
    /** Fase 1 (prévia) em andamento. */
    generatingPreview: boolean
    preview: DraftPreviewDto | null
    /** Fase 2 (estimativa de horas/custo) em andamento. */
    estimating: boolean
    estimate: DraftEstimateDto | null
    /** Progresso corrente (ex.: ferramenta do agente em execução) — prévia ou estimativa. */
    notice: string | null
    error: string | null
}

const INITIAL: BudgetReviewState = { generatingPreview: false, preview: null, estimating: false, estimate: null, notice: null, error: null }

/** O que a tela de revisão exibe: enquanto a IA regenera (prévia ou estimativa, ou correção enviada),
 * ignora o cache do rascunho e mostra só o que esta geração já produziu (skeleton até chegar). */
export interface ReviewView {
    running: boolean
    preview: DraftPreviewDto | null
    estimate: DraftEstimateDto | null
}

export function selectReviewView(state: BudgetReviewState, data: OrcamentoDraftDto | undefined, correcting: boolean): ReviewView {
    const running = state.generatingPreview || state.estimating || correcting
    return {
        running,
        preview: running ? state.preview : (state.preview ?? data?.preview ?? null),
        estimate: running ? state.estimate : (state.estimate ?? data?.estimate ?? null),
    }
}

interface StreamEvent {
    type: string
    message?: string
    name?: string
    state?: string
    preview?: DraftPreviewDto
    estimate?: DraftEstimateDto
}

/** Lê o NDJSON de um endpoint do portal e chama `onEvent` linha a linha. */
async function readNdjson(path: string, token: string, onEvent: (event: StreamEvent) => void): Promise<void> {
    const res = await fetch(withBasePath(path), { method: "POST", headers: { "Content-Type": "application/json", "x-client-token": token }, body: "{}" })
    if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Não foi possível concluir a requisição")
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
            if (!line.trim()) continue
            try {
                onEvent(JSON.parse(line) as StreamEvent)
            } catch {
                // Linha parcial/inválida: ignora.
            }
        }
    }
}

/**
 * Revisão da tarefa em DUAS fases: gera a prévia (com skeleton, sem expor o JSON cru) e, ao
 * concluí-la, dispara automaticamente a estimativa (agente do OpenCode, que consulta o banco).
 */
export function useBudgetReview(draftId: string) {
    const { token } = useClientePortal()
    const [state, setState] = useState<BudgetReviewState>(INITIAL)

    const runEstimate = useCallback(async () => {
        const outcome = { error: null as string | null }
        setState((prev) => ({ ...prev, estimating: true, notice: null, error: null }))
        try {
            await readNdjson(`/api/cliente/drafts/${draftId}/estimate`, token, (event) => {
                if (event.type === "notice") setState((prev) => ({ ...prev, notice: event.message ?? null }))
                else if (event.type === "tool") setState((prev) => ({ ...prev, notice: event.state === "running" ? `Consultando (${event.name ?? "ferramenta"})…` : prev.notice }))
                else if (event.type === "done") setState((prev) => ({ ...prev, estimating: false, estimate: event.estimate ?? null, notice: null }))
                else if (event.type === "error") {
                    outcome.error = event.message ?? "Falha na estimativa"
                    setState((prev) => ({ ...prev, estimating: false, error: outcome.error }))
                }
            })
        } catch (err) {
            outcome.error = err instanceof Error ? err.message : "Falha na conexão com o servidor"
        }
        if (outcome.error) setState((prev) => (prev.estimating ? { ...prev, estimating: false, error: outcome.error } : prev))
        return outcome.error === null
    }, [draftId, token])

    const start = useCallback(async () => {
        const outcome = { error: null as string | null }
        setState({ ...INITIAL, generatingPreview: true })
        try {
            // Os deltas (JSON cru) não são exibidos: a tela mostra skeleton até o `done`.
            await readNdjson(`/api/cliente/drafts/${draftId}/preview`, token, (event) => {
                if (event.type === "notice") setState((prev) => ({ ...prev, notice: event.message ?? null }))
                else if (event.type === "done") setState((prev) => ({ ...prev, generatingPreview: false, preview: event.preview ?? null, notice: null, estimating: true }))
                else if (event.type === "error") {
                    outcome.error = event.message ?? "Falha na prévia"
                    setState((prev) => ({ ...prev, generatingPreview: false, error: outcome.error }))
                }
            })
        } catch (err) {
            outcome.error = err instanceof Error ? err.message : "Falha na conexão com o servidor"
        }
        if (outcome.error) {
            setState((prev) => (prev.generatingPreview ? { ...prev, generatingPreview: false, error: outcome.error } : prev))
            return
        }
        await runEstimate()
    }, [draftId, token, runEstimate])

    return { state, start, retryEstimate: runEstimate }
}
