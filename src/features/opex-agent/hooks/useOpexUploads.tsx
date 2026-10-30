"use client"

import { useMemo, type ReactNode } from "react"
import { unwrapApi } from "@/lib/api"
import { checkFiles, createChatUploads, type ChatUploadEndpoints, type ChatUploadItem, type ChatUploadStatus } from "@/hooks/useChatUploads"
import type { ApiResponse } from "@/lib/types/api"
import type { ChatAgentId } from "../agents"
import type { OpexFileDto, OpexFileReservationDto } from "../types"
import { useOpexScope, type OpexUiScope } from "../components/OpexScopeProvider"

/**
 * Fila de envio dos arquivos do chat, por sessão (fila genérica de `@/hooks/useChatUploads`). Fica
 * acima do popover (no item da barra lateral): fechar o chat, trocar de aba ou trocar de agente não
 * perde os envios. Cada agente tem a própria fila (contextos separados, os dois montados no item); as
 * rotas seguem o escopo do agente (dono: `/opex` ou `/maddox`, portal: `/cliente/...`).
 */

export { checkFiles }
export type OpexUploadStatus = ChatUploadStatus
export type OpexUploadItem = ChatUploadItem

const uploads: Record<ChatAgentId, ReturnType<typeof createChatUploads>> = {
    opex: createChatUploads(null, "Opex"),
    maddox: createChatUploads(null, "Maddox"),
}

/** `scope`: o escopo do agente da fila (padrão: o do contexto). */
export function OpexUploadsProvider({ scope, children }: { scope?: OpexUiScope; children: ReactNode }) {
    const current = useOpexScope()
    const { http, apiBase, agent } = scope ?? current
    const endpoints = useMemo<ChatUploadEndpoints>(
        () => ({
            reserve: async (sessionId, input, signal) => unwrapApi((await http.post<ApiResponse<OpexFileReservationDto>>(`${apiBase}/sessions/${sessionId}/files`, input, { signal })).data),
            complete: async (id, signal) => unwrapApi((await http.post<ApiResponse<OpexFileDto>>(`${apiBase}/files/${id}/complete`, {}, { signal })).data),
            remove: (id) => http.delete(`${apiBase}/files/${id}`),
        }),
        [http, apiBase],
    )
    const Provider = uploads[agent.id].Provider
    return <Provider endpoints={endpoints}>{children}</Provider>
}

/** Fila da sessão (do agente do escopo): itens, situação para o envio e ações. */
export function useOpexUploads(sessionId: string | null) {
    const { agent } = useOpexScope()
    return uploads[agent.id].useScope(sessionId)
}
