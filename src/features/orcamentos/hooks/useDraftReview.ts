"use client"

import { useCallback, useState } from "react"
import { INITIAL_REVIEW_STATE, readNdjson, type BudgetReviewState } from "../review"

/**
 * Orquestra a revisão da prévia em DUAS fases, agnóstica de autenticação: gera a prévia (skeleton, sem
 * expor o JSON cru) e, ao concluí-la, dispara a estimativa. O **portal** passa os endpoints com o token
 * do cliente; o **dono** passa os endpoints internos (sessão) e pode reestimar só o custo enviando
 * `{ clientId }` no corpo.
 */
export interface DraftReviewOptions {
    /** Endpoint da prévia (1ª fase), já com o prefixo `/api`. */
    previewPath: string
    /** Endpoint da estimativa (2ª fase), já com o prefixo `/api`. */
    estimatePath: string
    /** Cabeçalhos extras (portal: o token do cliente). */
    headers?: Record<string, string>
}

export interface DraftReview {
    state: BudgetReviewState
    /** Gera a prévia e, em seguida, a estimativa. */
    start: () => Promise<void>
    /** Reestima (opcionalmente definindo o cliente do custo); devolve `true` em caso de sucesso. */
    runEstimate: (body?: unknown) => Promise<boolean>
    /** Repete só a estimativa, sem corpo (mantém o cliente já escolhido). */
    retryEstimate: () => Promise<boolean>
}

export function useDraftReview({ previewPath, estimatePath, headers }: DraftReviewOptions): DraftReview {
    const [state, setState] = useState<BudgetReviewState>(INITIAL_REVIEW_STATE)

    const runEstimate = useCallback(
        async (body?: unknown) => {
            const outcome = { error: null as string | null }
            setState((prev) => ({ ...prev, estimating: true, notice: null, error: null }))
            try {
                await readNdjson(estimatePath, { headers, body }, (event) => {
                    if (event.type === "notice") setState((prev) => ({ ...prev, notice: event.message ?? null }))
                    else if (event.type === "tool") setState((prev) => ({ ...prev, notice: event.state === "running" ? `Consultando (${event.name ?? "ferramenta"})…` : prev.notice }))
                    else if (event.type === "done") setState((prev) => ({ ...prev, estimating: false, estimate: event.estimate ?? null, tags: event.tags ?? prev.tags, notice: null }))
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
        },
        [estimatePath, headers],
    )

    const start = useCallback(async () => {
        const outcome = { error: null as string | null }
        setState({ ...INITIAL_REVIEW_STATE, generatingPreview: true })
        try {
            // Os deltas (JSON cru) não são exibidos: a tela mostra skeleton até o `done`.
            await readNdjson(previewPath, { headers }, (event) => {
                if (event.type === "notice") setState((prev) => ({ ...prev, notice: event.message ?? null }))
                else if (event.type === "done") setState((prev) => ({ ...prev, generatingPreview: false, preview: event.preview ?? null, tags: [], notice: null, estimating: true }))
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
    }, [previewPath, headers, runEstimate])

    const retryEstimate = useCallback(() => runEstimate(), [runEstimate])

    return { state, start, runEstimate, retryEstimate }
}
