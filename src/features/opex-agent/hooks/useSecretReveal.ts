"use client"

import { useMutation } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"

/** "Ver token" do card de ferramenta: lê UMA vez o segredo guardado no servidor (410 = já exibido ou vencido). */
export const useSecretReveal = () =>
    useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<{ secret: string; title: string }>>(`/opex/reveals/${encodeURIComponent(id)}`)).data),
    })
