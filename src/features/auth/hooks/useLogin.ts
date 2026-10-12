"use client"

import { useMutation } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { LoginInput } from "../schemas"

export interface LoginResult {
    authenticated: boolean
    /** Destino após entrar (dono → `/dashboard`; usuário de cliente → `/cliente`). */
    redirectTo?: string
}

/** Mutation do login: `POST /auth/login` (endpoint sem o prefixo `/api`). */
export function useLogin() {
    return useMutation({
        mutationFn: async (input: LoginInput) => {
            const response = await api.post<ApiResponse<LoginResult>>("/auth/login", input)
            return unwrapApi(response.data)
        },
    })
}
