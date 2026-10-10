"use client"

import { useMutation } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { LoginInput } from "../schemas"

/** Mutation do login: `POST /auth/login` (endpoint sem o prefixo `/api`). */
export function useLogin() {
    return useMutation({
        mutationFn: async (input: LoginInput) => {
            const response = await api.post<ApiResponse<{ authenticated: boolean }>>("/auth/login", input)
            return unwrapApi(response.data)
        },
    })
}
