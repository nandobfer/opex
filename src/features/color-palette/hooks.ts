"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { COLOR_PALETTE_QUERY_KEY, COLOR_PALETTE_UPDATED_EVENT } from "./constants"
import type { ColorPaletteDto, FavoriteColorDto } from "./schemas"

const EMPTY: readonly FavoriteColorDto[] = []

type Context = { previous?: ColorPaletteDto }

export interface ColorPalette {
    favorites: readonly FavoriteColorDto[]
    isLoading: boolean
    isError: boolean
    refetch: () => void
    /** Adiciona às favoritas (otimista; reverte com aviso se o servidor recusar). */
    addFavorite: (favorite: { color: string; name?: string | null }) => void
    /** Remove das favoritas (otimista; reverte com aviso se o servidor recusar). */
    removeFavorite: (color: string) => void
    /** Edita nome e cor mantendo a posição (otimista; reverte com aviso se o servidor recusar). */
    updateFavorite: (currentColor: string, favorite: { color: string; name?: string | null }) => void
    isFavorite: (color: string | null | undefined) => boolean
}

/** Mantém o cache das favoritas atualizado quando outra aba ou máquina muda a lista. */
export function useColorPaletteRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: COLOR_PALETTE_QUERY_KEY })
        channel.bind(COLOR_PALETTE_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(COLOR_PALETTE_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

/**
 * Cores favoritas compartilhadas por todos os seletores de cor do app (fonte única: o servidor).
 * Uma favorita adicionada em qualquer seletor aparece em todos os outros.
 */
export function useColorPalette(): ColorPalette {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: COLOR_PALETTE_QUERY_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ColorPaletteDto>>("/color-palette")).data),
        staleTime: 5 * 60_000,
    })
    useColorPaletteRealtime()

    const optimistic = async (update: (favorites: FavoriteColorDto[]) => FavoriteColorDto[]): Promise<Context> => {
        await queryClient.cancelQueries({ queryKey: COLOR_PALETTE_QUERY_KEY })
        const previous = queryClient.getQueryData<ColorPaletteDto>(COLOR_PALETTE_QUERY_KEY)
        queryClient.setQueryData<ColorPaletteDto>(COLOR_PALETTE_QUERY_KEY, { favorites: update([...(previous?.favorites ?? [])]) })
        return { previous }
    }
    const rollback = (context: Context | undefined, error: unknown, fallback: string) => {
        queryClient.setQueryData(COLOR_PALETTE_QUERY_KEY, context?.previous)
        toast.error(apiErrorMessage(error, fallback))
    }

    const add = useMutation<ColorPaletteDto, unknown, FavoriteColorDto, Context>({
        mutationFn: async (favorite) => unwrapApi((await api.post<ApiResponse<ColorPaletteDto>>("/color-palette/favorites", favorite)).data),
        onMutate: (favorite) => optimistic((list) => (list.some((item) => item.color === favorite.color) ? list : [...list, favorite])),
        onError: (error, _favorite, context) => rollback(context, error, "Não foi possível adicionar a cor às favoritas"),
        onSuccess: (data) => {
            queryClient.setQueryData(COLOR_PALETTE_QUERY_KEY, data)
            toast.success("Cor adicionada às favoritas")
        },
    })

    const remove = useMutation<ColorPaletteDto, unknown, string, Context>({
        mutationFn: async (color) => unwrapApi((await api.delete<ApiResponse<ColorPaletteDto>>(`/color-palette/favorites/${color.replace("#", "")}`)).data),
        onMutate: (color) => optimistic((list) => list.filter((item) => item.color !== color)),
        onError: (error, _color, context) => rollback(context, error, "Não foi possível remover a cor das favoritas"),
        onSuccess: (data) => {
            queryClient.setQueryData(COLOR_PALETTE_QUERY_KEY, data)
            toast.success("Cor removida das favoritas")
        },
    })

    const update = useMutation<ColorPaletteDto, unknown, { currentColor: string; favorite: FavoriteColorDto }, Context>({
        mutationFn: async ({ currentColor, favorite }) =>
            unwrapApi((await api.patch<ApiResponse<ColorPaletteDto>>(`/color-palette/favorites/${currentColor.replace("#", "")}`, favorite)).data),
        onMutate: ({ currentColor, favorite }) => optimistic((list) => list.map((item) => (item.color === currentColor ? favorite : item))),
        onError: (error, _input, context) => rollback(context, error, "Não foi possível atualizar a cor favorita"),
        onSuccess: (data) => {
            queryClient.setQueryData(COLOR_PALETTE_QUERY_KEY, data)
            toast.success("Cor favorita atualizada")
        },
    })

    const favorites = query.data?.favorites ?? EMPTY
    return {
        favorites,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => void query.refetch(),
        addFavorite: ({ color, name }) => add.mutate({ color, name: name?.trim() || null }),
        removeFavorite: (color) => remove.mutate(color),
        updateFavorite: (currentColor, { color, name }) => update.mutate({ currentColor, favorite: { color, name: name?.trim() || null } }),
        isFavorite: (color) => Boolean(color) && favorites.some((item) => item.color === color),
    }
}
