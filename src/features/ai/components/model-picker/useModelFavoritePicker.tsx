"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import type { AiModelDto } from "@/lib/ai/providers"
import { useAiModelFavorites } from "../../hooks/useAiModelFavorites"
import { favoriteSetFor } from "../../model-favorites/logic"
import { ModelFavoriteButton } from "./ModelFavoriteButton"

export interface ModelFavoritePickerProps {
    pinFirst?: (item: AiModelDto) => boolean
    renderItemAction?: (item: AiModelDto) => ReactNode
}

/**
 * Props do `SearchPicker` de modelos ligadas aos favoritos: estrela em cada opção e favoritos do
 * provedor no topo. Sem provedor (ex.: campo esperando a escolha do provedor), devolve vazio.
 * Compartilhado por `ModelPickerField` e `ModelSearchPicker`.
 */
export function useModelFavoritePicker(provider: string | null | undefined): ModelFavoritePickerProps {
    const { favorites, setFavorite } = useAiModelFavorites()
    const set = useMemo(() => favoriteSetFor(favorites, provider), [favorites, provider])
    const pinFirst = useCallback((item: AiModelDto) => set.has(item.id), [set])
    const renderItemAction = useCallback(
        (item: AiModelDto) => {
            if (!provider) return null
            const favorite = set.has(item.id)
            return <ModelFavoriteButton favorite={favorite} onToggle={() => setFavorite({ provider, model: item.id, favorite: !favorite })} />
        },
        [provider, set, setFavorite],
    )
    return useMemo(() => (provider ? { pinFirst, renderItemAction } : {}), [provider, pinFirst, renderItemAction])
}
