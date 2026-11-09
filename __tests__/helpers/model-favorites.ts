import { vi } from 'vitest'

/**
 * Mock de `useAiModelFavorites` para telas que montam buscas de modelo (`ModelPickerField`,
 * `ModelSearchPicker`) sem QueryClient nem rede. Com `favorites` e `setFavorite` próprios (ex.: de
 * `vi.hoisted`), o teste confere a estrela, a ordem e o provedor repassado ao favoritar:
 * `vi.mock('@/features/ai/hooks/useAiModelFavorites', () => modelFavoritesMock())`.
 */
export function modelFavoritesMock(favorites: { provider: string; model: string }[] = [], setFavorite = vi.fn()) {
  return {
    useAiModelFavorites: () => ({ favorites, setFavorite, isFavorite: (provider: string, model: string) => favorites.some((item) => item.provider === provider && item.model === model) }),
    useAiModelFavoritesRealtime: () => undefined,
  }
}
