"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { getAiProvider } from "@/lib/ai/providers"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { OPEX_FEATURE } from "../constants"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { useOpexScope } from "../components/OpexScopeProvider"
import type { OpexAgentSettings } from "../schemas"
import type { OpexAgentSettingsDto, OpexClientStatusDto } from "../types"
import type { OpexFilesSettings } from "../schemas"
import type { ColumnColor } from "@/features/tasks/board"
import { useMaddoxSettings } from "@/features/maddox-agent/hooks/useMaddoxSettings"
import type { MaddoxClientStatusDto } from "@/features/maddox-agent/types"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const OPEX_SETTINGS_KEY = [AI_QUERY_KEY, "feature", OPEX_FEATURE] as const

export const useOpexSettings = (enabled = true) =>
    useQuery({
        queryKey: OPEX_SETTINGS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`)).data),
        enabled,
    })

/** Situação do agente no **portal** (configuração do cliente, disponibilidade e limites). */
export const useOpexStatus = (enabled = true) => {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: [queryPrefix, "status"],
        // O Maddox devolve também a cor e o modelo padrão (`MaddoxClientStatusDto`).
        queryFn: async () => unwrapApi((await http.get<ApiResponse<OpexClientStatusDto & Partial<MaddoxClientStatusDto>>>(`${apiBase}/status`)).data),
        enabled,
        staleTime: 30_000,
    })
}

/** O que o painel precisa saber do agente, no escopo atual (dono ou portal). */
export interface OpexView {
    availability: AiFeatureAvailability
    files: OpexFilesSettings
    modelLabel: string | null
    /** Cor do agente (Maddox; `null` = primária). */
    color: ColumnColor | null
    /** Modelo padrão do agente (Maddox: as sessões novas começam nele). */
    defaultModel: { model: string; variant: string | null } | null
}

const maddoxLabel = (model: string | null | undefined, variant: string | null | undefined) => (model ? `OpenCode · ${model}${variant ? ` (${variant})` : ""}` : null)

export function useOpexView(): { data: OpexView | undefined; isLoading: boolean } {
    const { kind, agent } = useOpexScope()
    const maddox = agent.id === "maddox"
    const settings = useOpexSettings(kind === "owner" && !maddox)
    const maddoxSettings = useMaddoxSettings(kind === "owner" && maddox)
    const status = useOpexStatus(kind === "client")
    if (kind === "owner" && maddox) {
        const data = maddoxSettings.data
        return {
            data: data
                ? {
                      availability: data.availability,
                      files: data.settings.files,
                      modelLabel: maddoxLabel(data.settings.main.model, data.settings.main.variant),
                      color: data.settings.color,
                      defaultModel: data.settings.main.model ? { model: data.settings.main.model, variant: data.settings.main.variant } : null,
                  }
                : undefined,
            isLoading: maddoxSettings.isLoading,
        }
    }
    if (kind === "owner") {
        const data = settings.data
        return {
            data: data
                ? {
                      availability: data.availability,
                      files: data.settings.files,
                      modelLabel: data.settings.main.provider && data.settings.main.model ? `${getAiProvider(data.settings.main.provider).name} · ${data.settings.main.model}` : null,
                      color: null,
                      defaultModel: null,
                  }
                : undefined,
            isLoading: settings.isLoading,
        }
    }
    const data = status.data
    return {
        data: data
            ? {
                  availability: { available: data.available, reason: data.reason },
                  files: data.files,
                  modelLabel: data.modelLabel,
                  color: data.color ?? null,
                  defaultModel: maddox && data.model ? { model: data.model, variant: data.variant ?? null } : null,
              }
            : undefined,
        isLoading: status.isLoading,
    }
}

export function useSaveOpexSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: OpexAgentSettings) => unwrapApi((await api.put<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(OPEX_SETTINGS_KEY, saved)
            toast.success('Configuração do "Agente Opex" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
