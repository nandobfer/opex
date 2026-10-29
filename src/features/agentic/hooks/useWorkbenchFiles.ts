"use client"

import { useCallback, useMemo } from "react"
import { api, unwrapApi } from "@/lib/api"
import { createChatUploads, uploadsBlockReason, type ChatUploadItem } from "@/hooks/useChatUploads"
import type { ChatFileDto, ChatFileReservationDto } from "@/lib/chat-files/kind"
import type { ApiResponse } from "@/lib/types/api"
import { AGENTIC_FILES_LIMITS } from "../files"

/**
 * Anexos dos campos da mesa de trabalho: fila de envio (mesmo fluxo do chat do Agente Opex) separada
 * por campo (`scope`). O provider fica no painel da mesa, então trocar de aba ou de fork não perde os
 * envios. Fora do provider (ex.: testes de um campo isolado), anexar fica indisponível.
 */
const workbenchUploads = createChatUploads(
    {
        reserve: async (_scope, input, signal) => unwrapApi((await api.post<ApiResponse<ChatFileReservationDto>>("/agentic/files", input, { signal })).data),
        complete: async (id, signal) => unwrapApi((await api.post<ApiResponse<ChatFileDto>>(`/agentic/files/${id}/complete`, {}, { signal })).data),
        remove: (id) => api.delete(`/agentic/files/${id}`),
    },
    "Workbench",
    { optional: true },
)

export const WorkbenchUploadsProvider = workbenchUploads.Provider

export interface FieldAttachments {
    /** Anexar está disponível (há fila montada). */
    available: boolean
    items: ChatUploadItem[]
    onFiles: (files: File[]) => void
    onRetry: (localId: string) => void
    onRemove: (localId: string) => void
    /** Ids dos anexos prontos, para o corpo da ação. */
    fileIds: string[]
    /** Motivo para bloquear o envio (envio em andamento ou com erro) ou `null`. */
    blockReason: string | null
    /** Tira da fila os anexos que foram na mensagem (chamar no sucesso do envio). */
    clearSent: () => void
}

const noop = () => undefined

/** Campo sem anexos (anexar indisponível). */
export const NO_ATTACHMENTS: FieldAttachments = { available: false, items: [], onFiles: noop, onRetry: noop, onRemove: noop, fileIds: [], blockReason: null, clearSent: noop }

/** Fila de anexos de um campo da mesa (ex.: `feedback:<mesa>`, `fork:<fork>`). */
export function useFieldAttachments(scope: string): FieldAttachments {
    const uploads = workbenchUploads.useScope(scope)
    const { enqueue, clearSent, ready } = uploads
    const onFiles = useCallback((files: File[]) => enqueue(scope, files, AGENTIC_FILES_LIMITS), [enqueue, scope])
    const fileIds = useMemo(() => ready.flatMap((item) => (item.uploaded ? [item.uploaded.id] : [])), [ready])
    const clear = useCallback(() => clearSent(ready.map((item) => item.localId)), [clearSent, ready])
    return {
        available: uploads.available,
        items: uploads.items,
        onFiles,
        onRetry: uploads.retry,
        onRemove: uploads.remove,
        fileIds,
        blockReason: uploadsBlockReason(uploads),
        clearSent: clear,
    }
}
