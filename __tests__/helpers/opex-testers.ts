import type { TesterContext, TesterResult } from '@nandobfer/integracoes/server'

type Tester = (context: Omit<TesterContext, 'id'> & { id?: string }) => Promise<TesterResult>

/**
 * Teste de conexão de cada integração como o Opex registra (adaptadores de servidor), por id.
 * Carregado na hora: os `vi.mock` do teste já valem.
 */
export async function opexTesters(): Promise<Record<string, Tester>> {
  const { OPEX_SERVER_ADAPTERS } = await import('@/features/integrations/registry/server')
  return Object.fromEntries(
    OPEX_SERVER_ADAPTERS.filter((adapter) => adapter.id && adapter.tester).map((adapter) => [adapter.id!, (context: Omit<TesterContext, 'id'> & { id?: string }) => adapter.tester!({ id: adapter.id!, ...context })]),
  )
}
