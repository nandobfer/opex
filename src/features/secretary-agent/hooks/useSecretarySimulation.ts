"use client"

import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import type { SimulateInput } from "../schemas"
import type { SimulateResult } from "../server/simulate"

/** Uma mensagem simulada (POST /secretary/simulate): nada é enviado nem gravado; falha vira toast. */
export function useSecretarySimulation() {
    return useMutation({
        mutationFn: async (input: SimulateInput) => (await api.post<{ data: SimulateResult }>("/secretary/simulate", input)).data.data,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível simular a mensagem")),
    })
}
