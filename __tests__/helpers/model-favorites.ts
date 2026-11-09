import { vi } from 'vitest'

/**
 * Mock de `useAiModelFavorites` para telas que montam buscas de modelo (`ModelPickerField`,
 * `ModelSearchPicker`) sem QueryClient nem rede:
 * `vi.mock('@/features/ai/hooks/useAiModelFavorites', () => modelFavoritesMock())`.
 */
export function modelFavoritesMock(favorites: { provider: string; model: string }[] = []) {
  const setFavorite = vi.fn()
  return {
    useAiModelFavorites: () => ({ favorites, setFavorite, isFavorite: (provider: string, model: string) => favorites.some((item) => item.provider === provider && item.model === model) }),
    useAiModelFavoritesRealtime: () => undefined,
  }
}
