import { vi } from 'vitest'
import type { AiApiKeyDto } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/api-keys"

/**
 * Mock de `useAiApiKeys` (chaveiro dos provedores de IA, OPE-155) para telas sem QueryClient nem rede,
 * como os painéis de consumo com o filtro "Chave de API":
 * `vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAiApiKeys', () => aiApiKeysMock(keys))`.
 */
export function aiApiKeysMock(keys: AiApiKeyDto[] = []) {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => keys), isPending: false })
  return {
    aiApiKeysKey: (provider: string) => ['ai', 'api-keys', provider],
    useAiApiKeys: (provider: string | null) => ({ data: provider === null ? undefined : keys, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useAiApiKeysRealtime: () => undefined,
    useCreateAiApiKey: mutation,
    useUpdateAiApiKey: mutation,
    useRemoveAiApiKey: mutation,
    useToggleAiApiKey: mutation,
    useMakePrimaryAiApiKey: mutation,
  }
}

/** `active` = em uso (rodízio); `primary` (OPE-179) segue `active` por padrão (uma chave em uso = a principal). */
export const apiKeyDto = (id: string, name: string, active = false, primary = active, extra: Partial<AiApiKeyDto> = {}): AiApiKeyDto => ({ id, name, active, primary, billing: { mode: 'usage' }, billingNotices: [], ...extra, createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z' })
