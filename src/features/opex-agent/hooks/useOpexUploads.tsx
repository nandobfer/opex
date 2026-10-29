"use client"

import { useMemo, type ReactNode } from "react"
import { unwrapApi } from "@/lib/api"
import { checkFiles, createChatUploads, type ChatUploadEndpoints, type ChatUploadItem, type ChatUploadStatus } from "@/hooks/useChatUploads"
import type { ApiResponse } from "@/lib/types/api"
import type { OpexFileDto, OpexFileReservationDto } from "../types"
import { useOpexScope } from "../components/OpexScopeProvider"

/**
 * Fila de envio dos arquivos do chat, por sessão (fila genérica de `@/hooks/useChatUploads`). Fica
 * acima do popover (no item da barra lateral): fechar o chat ou trocar de aba não perde os envios.
 * As rotas seguem o escopo do agente (dono: `/opex`, portal: `/cliente/opex`).
 */

export { checkFiles }
export type OpexUploadStatus = ChatUploadStatus
export type OpexUploadItem = ChatUploadItem

const opexUploads = createChatUploads(null, "Opex")

export function OpexUploadsProvider({ children }: { children: ReactNode }) {
    const { http, apiBase } = useOpexScope()
    const endpoints = useMemo<ChatUploadEndpoints>(
        () => ({
            reserve: async (sessionId, input, signal) => unwrapApi((await http.post<ApiResponse<OpexFileReservationDto>>(`${apiBase}/sessions/${sessionId}/files`, input, { signal })).data),
            complete: async (id, signal) => unwrapApi((await http.post<ApiResponse<OpexFileDto>>(`${apiBase}/files/${id}/complete`, {}, { signal })).data),
            remove: (id) => http.delete(`${apiBase}/files/${id}`),
        }),
        [http, apiBase],
    )
    return <opexUploads.Provider endpoints={endpoints}>{children}</opexUploads.Provider>
}

/** Fila da sessão: itens, situação para o envio e ações. */
export const useOpexUploads = (sessionId: string | null) => opexUploads.useScope(sessionId)
