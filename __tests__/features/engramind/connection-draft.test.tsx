/** @vitest-environment happy-dom */

import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

/**
 * Salvar a conexão do Engramind não deixa o rascunho genérico da integração desatualizado: URL base e
 * URL pública são campos do card próprio (fora do detalhe e do PATCH genérico) e o detalhe/lista da
 * integração são invalidados.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  api: { put: vi.fn(async () => ({ data: { success: true, data: { connection: {}, steps: [] } } })), post: vi.fn(async () => ({ data: { success: true, data: { connection: {}, steps: [] } } })), get: vi.fn() },
}))

import { getIntegrationDef } from '@/lib/integrations/catalog'
import { buildIntegrationPatch, draftFrom } from '@/features/integrations/components/detail/draft'
import { buildIntegrationUpdateSchema } from '@/features/integrations/schemas/integration.schema'
import { integrationDetailKey, integrationsListKey } from '@/features/integrations/hooks/useIntegrations'
import { useRunEngramindBootstrap, useSaveEngramindConnection } from '@/features/engramind/hooks/useEngramindConnection'
import type { IntegrationDetailDto } from '@/features/integrations/types'

const detail = (debugMode: boolean) => ({ id: 'engramind', environment: 'externo', debugMode, swaggerUrl: null, swaggerUrlManaged: false, publicValues: {}, secrets: {} }) as unknown as IntegrationDetailDto

describe('conexão do Engramind x rascunho genérico', () => {
  it('URLs, Ambiente e segredos da conexão ficam fora do PATCH genérico', () => {
    const def = getIntegrationDef('engramind')
    for (const key of ['baseUrl', 'opexPublicUrl', 'environmentId']) expect(def.publicFields.find((field) => field.key === key)?.group).toBe('card')
    expect(buildIntegrationUpdateSchema(def).safeParse({ publicValues: { baseUrl: 'http://antiga:8000' } }).success).toBe(false)
  })

  it('o detalhe refeito depois de salvar a conexão não gera alteração pendente; só o debug vai no PATCH', () => {
    const def = getIntegrationDef('engramind')
    const draft = draftFrom(detail(false))
    expect(buildIntegrationPatch(def.publicFields, detail(false), draft)).toEqual({})
    expect(buildIntegrationPatch(def.publicFields, detail(false), { ...draft, debugMode: true })).toEqual({ debugMode: true })
  })

  it('salvar a conexão e repetir o bootstrap invalidam o detalhe e a lista da integração', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const spy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const save = renderHook(() => useSaveEngramindConnection(), { wrapper })
    await save.result.current.mutateAsync({ baseUrl: 'http://nova:8000', opexPublicUrl: 'http://opex:3100', environmentId: null, adminToken: undefined })
    await waitFor(() => expect(spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey))).toEqual(expect.arrayContaining([JSON.stringify(integrationDetailKey('engramind')), JSON.stringify(integrationsListKey)])))
    spy.mockClear()
    const bootstrap = renderHook(() => useRunEngramindBootstrap(), { wrapper })
    await bootstrap.result.current.mutateAsync(undefined)
    await waitFor(() => expect(spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey))).toContain(JSON.stringify(integrationDetailKey('engramind'))))
  })
})
