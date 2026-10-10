"use client"

import { useCallback, useState } from "react"
import { withBasePath } from "@/lib/base-path"
import type { DraftPreviewDto } from "../types"
import { useClientePortal } from "./ClientePortalContext"

export interface BudgetPreviewState {
    running: boolean
    text: string
    preview: DraftPreviewDto | null
    error: string | null
    notice: string | null
}

const INITIAL: BudgetPreviewState = { running: false, text: "", preview: null, error: null, notice: null }

interface PreviewEvent {
    type: string
    text?: string
    preview?: DraftPreviewDto
    message?: string
}

/** Consome o NDJSON da prévia (`POST /cliente/drafts/[id]/preview`) e expõe o estado. */
export function useBudgetPreviewStream(draftId: string) {
    const { token } = useClientePortal()
    const [state, setState] = useState<BudgetPreviewState>(INITIAL)

    const start = useCallback(async () => {
        setState({ ...INITIAL, running: true })
        try {
            const res = await fetch(withBasePath(`/api/cliente/drafts/${draftId}/preview`), {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-client-token": token },
                body: "{}",
            })
            if (!res.ok || !res.body) {
                const payload = (await res.json().catch(() => null)) as { error?: string } | null
                setState({ ...INITIAL, error: payload?.error ?? "Não foi possível gerar a prévia" })
                return
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            const handle = (event: PreviewEvent) => {
                if (event.type === "delta") setState((prev) => ({ ...prev, text: prev.text + (event.text ?? "") }))
                else if (event.type === "notice") setState((prev) => ({ ...prev, notice: event.message ?? null }))
                else if (event.type === "done") setState((prev) => ({ ...prev, running: false, preview: event.preview ?? null, notice: null }))
                else if (event.type === "error") setState((prev) => ({ ...prev, running: false, error: event.message ?? "Falha na prévia" }))
            }
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() ?? ""
                for (const line of lines) {
                    if (!line.trim()) continue
                    try {
                        handle(JSON.parse(line) as PreviewEvent)
                    } catch {
                        // Linha parcial/inválida: ignora.
                    }
                }
            }
            setState((prev) => (prev.running ? { ...prev, running: false } : prev))
        } catch {
            setState({ ...INITIAL, error: "Falha na conexão com o servidor" })
        }
    }, [draftId, token])

    return { state, start }
}
