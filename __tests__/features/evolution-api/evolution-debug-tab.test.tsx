/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/**
 * Aba Debug da Evolution API (OPE-212): o debug é sempre ativo, então o console aparece sem ligar nada e o aviso
 * "Ative o modo debug" não existe mais. A aba Geral não tem ambiente nem switch de modo debug.
 */

const mocks = vi.hoisted(() => ({ tab: 'debug' as string }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@nandobfer/integracoes/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIntegrationTab: () => ({ tab: mocks.tab, requestTab: vi.fn(), pendingTab: null, confirmDiscard: vi.fn(), cancelDiscard: vi.fn() }),
  IntegrationTabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DetailHeader: () => <h1>Evolution API</h1>,
  IntegrationDebugConsole: ({ integrationId }: { integrationId: string }) => <div data-testid="debug-console" data-id={integrationId} />,
}))
vi.mock('@/features/evolution-api/hooks/useEvolution', () => ({
  PREFILL: 'prefill',
  useEvolution: () => ({ data: undefined, isError: false }),
  useEvolutionAction: () => ({ mutate: vi.fn(), isPending: false }),
  useEvolutionRealtime: () => undefined,
}))
vi.mock('@/features/evolution-api/components/InstanceTab', () => ({ InstanceTab: () => null }))
vi.mock('@/features/evolution-api/components/OperationsTabs', () => ({ OperationsTab: () => null, WebhookTab: () => null }))

import { EvolutionEditorForm } from '@/features/evolution-api/components/EvolutionEditorForm'
import { getIntegrationDef } from '@/features/integrations/registry/definitions'

afterEach(cleanup)

const props = () => ({
  def: getIntegrationDef('evolution-api'),
  data: { id: 'evolution-api', stored: true, publicValues: {}, secrets: {}, health: { status: 'ok' }, swaggerUrl: null } as never,
  draft: { swaggerUrl: '', publicValues: {}, secrets: {} },
  setDraft: vi.fn(),
  dirty: false,
  pending: false,
  onSave: async () => true,
  onUndo: vi.fn(),
})

describe('EvolutionEditorForm', () => {
  it('a aba Debug mostra o console sempre (debug sempre ativo)', () => {
    mocks.tab = 'debug'
    render(<EvolutionEditorForm {...props()} />)
    expect(screen.getByTestId('debug-console').getAttribute('data-id')).toBe('evolution-api')
    expect(screen.queryByText(/Ative o modo debug/)).toBeNull()
  })

  it('a aba Geral não tem ambiente nem modo debug', () => {
    mocks.tab = 'geral'
    render(<EvolutionEditorForm {...props()} />)
    expect(screen.queryByText('Ambiente')).toBeNull()
    expect(screen.queryByText(/Modo debug/)).toBeNull()
  })
})
