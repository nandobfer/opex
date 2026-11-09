"use client"

import { useCallback, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { AI_MODEL_FAVORITES_QUERY_KEY, AI_MODEL_FAVORITES_UPDATED_EVENT } from "../model-favorites/constants"
import type { ModelFavoriteDto, ModelFavoritesDto } from "../model-favorites/schemas"

const EMPTY: readonly ModelFavoriteDto[] = []

type Toggle = ModelFavoriteDto & { favorite: boolean }
type Context = { previous?: ModelFavoritesDto }

export interface AiModelFavorites {
    favorites: readonly ModelFavoriteDto[]
    isFavorite: (provider: string, model: string) => boolean
    /** Favorita (`favorite: true`) ou desfavorita o modelo (otimista; reverte com aviso se o servidor recusar). */
    setFavorite: (input: Toggle) => void
}

/** Mantém o cache dos favoritos atualizado quando outra aba ou máquina muda a lista. */
export function useAiModelFavoritesRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: AI_MODEL_FAVORITES_QUERY_KEY })
        channel.bind(AI_MODEL_FAVORITES_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(AI_MODEL_FAVORITES_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

const sameFavorite = (a: ModelFavoriteDto, b: ModelFavoriteDto) => a.provider === b.provider && a.model === b.model

/**
 * Modelos de IA favoritos, compartilhados por todas as buscas de modelo do app (fonte única: o
 * servidor). Favoritar num seletor reflete em todos os outros.
 */
export function useAiModelFavorites(): AiModelFavorites {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: AI_MODEL_FAVORITES_QUERY_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ModelFavoritesDto>>("/ai/model-favorites")).data),
        staleTime: 5 * 60_000,
    })
    useAiModelFavoritesRealtime()

    const mutation = useMutation<ModelFavoritesDto, unknown, Toggle, Context>({
        mutationFn: async ({ provider, model, favorite }) => {
            const body = { provider, model }
            const response = favorite ? await api.post<ApiResponse<ModelFavoritesDto>>("/ai/model-favorites", body) : await api.delete<ApiResponse<ModelFavoritesDto>>("/ai/model-favorites", { data: body })
            return unwrapApi(response.data)
        },
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: AI_MODEL_FAVORITES_QUERY_KEY })
            const previous = queryClient.getQueryData<ModelFavoritesDto>(AI_MODEL_FAVORITES_QUERY_KEY)
            const list = (previous?.favorites ?? []).filter((item) => !sameFavorite(item, input))
            const next = input.favorite ? [...list, { provider: input.provider, model: input.model }] : list
            queryClient.setQueryData<ModelFavoritesDto>(AI_MODEL_FAVORITES_QUERY_KEY, { favorites: next })
            return { previous }
        },
        onError: (error, input, context) => {
            queryClient.setQueryData(AI_MODEL_FAVORITES_QUERY_KEY, context?.previous)
            toast.error(apiErrorMessage(error, input.favorite ? "Não foi possível favoritar o modelo" : "Não foi possível remover o modelo dos favoritos"))
        },
        onSuccess: (data) => queryClient.setQueryData(AI_MODEL_FAVORITES_QUERY_KEY, data),
    })

    const favorites = query.data?.favorites ?? EMPTY
    const { mutate } = mutation
    const isFavorite = useCallback((provider: string, model: string) => favorites.some((item) => item.provider === provider && item.model === model), [favorites])
    return { favorites, isFavorite, setFavorite: mutate }
}

