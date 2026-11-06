"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, apiErrorCode, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { memoryDetailPath, type NoticeMemoryRef } from "../memory-notice"
import type { MemoryDto } from "../types"

/** Releitura enquanto o Engramind gera o título, limitada ao tempo de cada abertura do painel. */
export const MEMORY_DETAIL_POLL_MS = 5_000
export const MEMORY_DETAIL_POLL_MAX_MS = 120_000

/** Códigos de "não existe mais" (memória excluída/movida, central ou execução apagada): sem nova tentativa. */
const GONE_CODES = new Set(["NOT_FOUND", "CENTRAL_NOT_FOUND", "CLIENT_NOT_FOUND", "MENTOR_RUN_NOT_FOUND"])

export const isGoneError = (error: unknown): boolean => GONE_CODES.has(apiErrorCode(error) ?? "")

/**
 * Memória citada por um aviso da mesa (OPE-139), lida do Engramind só quando o painel abre (`enabled`):
 * nada do conteúdo fica no evento. `gone`: a memória não está mais no Engramind (404, sem repetir).
 */
export function useMemoryDetail(ref: NoticeMemoryRef | null, enabled: boolean) {
    const path = ref && ref.action !== "deleted" ? memoryDetailPath(ref) : null
    const [openedAt] = useState(() => Date.now())
    const query = useQuery({
        queryKey: ["ai", "memory-detail", path],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoryDto>>(path!)).data),
        enabled: enabled && path !== null,
        staleTime: 15_000,
        retry: (count, error) => !isGoneError(error) && count < 2,
        refetchInterval: (current) => (current.state.data?.resumoPendente && Date.now() - openedAt < MEMORY_DETAIL_POLL_MAX_MS ? MEMORY_DETAIL_POLL_MS : false),
    })
    return { ...query, gone: ref?.action === "deleted" || (query.isError && isGoneError(query.error)) }
}
