import type { ModelFavoriteDto } from "./schemas"

/** Ids dos modelos favoritos de um provedor (favorito de outro provedor com o mesmo id não conta). */
export function favoriteSetFor(favorites: readonly ModelFavoriteDto[], provider: string | null | undefined): ReadonlySet<string> {
    if (!provider) return new Set()
    return new Set(favorites.filter((item) => item.provider === provider).map((item) => item.model))
}

