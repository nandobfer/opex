/**
 * @vitest-environment happy-dom
 */
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/**
 * Registro de cliente do Opex na central REAL da biblioteca (OPE-212): `OpexIntegrationsProvider` com
 * `OPEX_CLIENT_ADAPTERS`, e a resolução que a central faz (`useClientAdapter` e `IntegrationsCentral`). Cada
 * editor, card, página e aba própria do Opex vira um marcador: tirar um elo de `OPEX_CLIENT_ADAPTERS` deixa o
 * teste vermelho (a central cai no editor genérico ou em "Integração não encontrada").
 */

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

// Peças do Opex (marcadores).
vi.mock('@/features/github/components/GithubEditorForm', async () => ({ GithubEditorForm: (await import('../../helpers/marker-component')).marker('GithubEditorForm') }))
vi.mock('@/features/orcamentos/components/OrcamentosEditorForm', async () => ({ OrcamentosEditorForm: (await import('../../helpers/marker-component')).marker('OrcamentosEditorForm') }))
vi.mock('@/features/orcamentos/components/clients/ClienteConfigPage', async () => ({ ClienteConfigPage: (await import('../../helpers/marker-component')).marker('ClienteConfigPage') }))
vi.mock('@/features/local-docker/components/BuilderMachineEditorForm', async () => ({ BuilderMachineEditorForm: (await import('../../helpers/marker-component')).marker('BuilderMachineEditorForm') }))
vi.mock('@/features/engramind/components/integration/EngramindEditorForm', async () => ({ EngramindEditorForm: (await import('../../helpers/marker-component')).marker('EngramindEditorForm') }))
vi.mock('@/features/evolution-api/components/EvolutionEditorForm', async () => ({ EvolutionEditorForm: (await import('../../helpers/marker-component')).marker('EvolutionEditorForm') }))
vi.mock('@/features/integrations/components/internal-api/ApiTokensCard', async () => ({ ApiTokensCard: (await import('../../helpers/marker-component')).marker('ApiTokensCard') }))
vi.mock('@/features/agentic/components/central/CentralPage', async () => ({ CentralPage: (await import('../../helpers/marker-component')).marker('CentralPage') }))
vi.mock('@/features/opex-agent/components/jobs/OpexJobsTab', async () => ({ OpexJobsTab: (await import('../../helpers/marker-component')).marker('OpexJobsTab') }))
vi.mock('@/features/opex-agent/components/watches/OpexWatchesTab', async () => ({ OpexWatchesTab: (await import('../../helpers/marker-component')).marker('OpexWatchesTab') }))
vi.mock('@/components/feedback/PreviewSchedulerNotice', () => ({ PreviewSchedulerNotice: () => null }))
vi.mock('@/features/ai/components/orcamentista/OrcamentistaTab', async () => ({ OrcamentistaTab: (await import('../../helpers/marker-component')).marker('OrcamentistaTab') }))
vi.mock('@/features/ai/components/catalogador/CatalogadorTab', async () => ({ CatalogadorTab: (await import('../../helpers/marker-component')).marker('CatalogadorTab') }))
vi.mock('@/features/ai/components/task-refinement/TaskRefinementTab', async () => ({ TaskRefinementTab: (await import('../../helpers/marker-component')).marker('TaskRefinementTab') }))
vi.mock('@/features/secretary-agent/components/SecretaryAgentTab', async () => ({ SecretaryAgentTab: (await import('../../helpers/marker-component')).marker('SecretaryAgentTab') }))
vi.mock('@/features/agentic/components/settings/AgenticTab', async () => ({ AgenticTab: (await import('../../helpers/marker-component')).marker('AgenticTab') }))
vi.mock('@/features/pr-review/components/PrReviewTab', async () => ({ PrReviewTab: (await import('../../helpers/marker-component')).marker('PrReviewTab') }))
vi.mock('@/features/opex-agent/components/settings/OpexAgentTab', async () => ({ OpexAgentTab: (await import('../../helpers/marker-component')).marker('OpexAgentTab') }))
vi.mock('@/features/maddox-agent/components/settings/MaddoxAgentTab', async () => ({ MaddoxAgentTab: (await import('../../helpers/marker-component')).marker('MaddoxAgentTab') }))
vi.mock('@/features/adversarial-agent/components/settings/AdversarialAgentTab', async () => ({ AdversarialAgentTab: (await import('../../helpers/marker-component')).marker('AdversarialAgentTab') }))
vi.mock('@/features/adversarial-agent/components/mentor/MentorAgentTab', async () => ({ MentorAgentTab: (await import('../../helpers/marker-component')).marker('MentorAgentTab') }))
vi.mock('@/features/architect-agent/components/settings/ArchitectAgentTab', async () => ({ ArchitectAgentTab: (await import('../../helpers/marker-component')).marker('ArchitectAgentTab') }))
vi.mock('@/features/routine-agents/components/settings/RoutineAgentsTab', async () => ({ RoutineAgentsTab: (await import('../../helpers/marker-component')).marker('RoutineAgentsTab') }))
vi.mock('@/features/opencode-accounts/components/OpencodeAccountsCard', async () => ({ OpencodeAccountsCard: (await import('../../helpers/marker-component')).marker('OpencodeAccountsCard') }))
vi.mock('@/features/opencode-resources/components/OpencodeResourceTab', async () => ({ OpencodeResourceTab: (await import('../../helpers/marker-component')).marker('OpencodeResourceTab') }))
vi.mock('@/features/opencode-service/components/OpencodeControlsTab', async () => ({ OpencodeControlsTab: (await import('../../helpers/marker-component')).marker('OpencodeControlsTab') }))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiFeatureRealtime: () => undefined }))

// Editores da biblioteca que recebem as abas extras do Opex: o marcador mostra quais abas chegaram.
vi.mock('@nandobfer/integracoes/modules/react/central/detail/CronsEditorForm', async () => ({ CronsEditorForm: (await import('../../helpers/marker-component')).marker('CronsEditorForm') }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/components/AiEditorForm', async () => ({ AiEditorForm: (await import('../../helpers/marker-component')).marker('AiEditorForm') }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/components/AiProviderEditorForm', async () => ({ AiProviderEditorForm: (await import('../../helpers/marker-component')).marker('AiProviderEditorForm') }))

// Sem rede: a lista da central (usada nos subcaminhos) responde vazia.
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(async () => ({ data: { success: true, data: [] } })), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, apiErrorMessage: (_e: unknown, f: string) => f }))
vi.mock('@/lib/pusher/client', () => ({ acquireChannel: vi.fn(), releaseChannel: vi.fn(), isPusherClientAvailable: () => false }))
vi.mock('@/lib/pusher/useRealtimeConnection', () => ({ useRealtimeConnection: () => 'disabled' }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntegrationsCentral, useClientAdapter, useIntegrationsRegistry } from '@nandobfer/integracoes/react'
import { OpexIntegrationsProvider } from '@/features/integrations/registry/client'

afterEach(cleanup)

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpexIntegrationsProvider>{children}</OpexIntegrationsProvider>
    </QueryClientProvider>,
  )
}

/** O que a central usa para a integração: o editor e os cards do adaptador de cliente. */
function Resolved({ id }: { id: string }) {
  const def = useIntegrationsRegistry().get(id)
  const adapter = useClientAdapter(def)
  const Editor = adapter?.editor
  const Cards = adapter?.cards
  return (
    <div data-testid={`resolved-${id}`}>
      {Editor ? <Editor {...({ def, data: {} } as never)} /> : <span>genérico</span>}
      {Cards ? <Cards {...({ def, data: {} } as never)} /> : null}
    </div>
  )
}

describe('OPEX_CLIENT_ADAPTERS na central da biblioteca', () => {
  it.each([
    ['github', 'GithubEditorForm'],
    ['orcamentos', 'OrcamentosEditorForm'],
    ['builder_machine', 'BuilderMachineEditorForm'],
    ['engramind', 'EngramindEditorForm'],
    ['evolution-api', 'EvolutionEditorForm'],
  ])('%s abre o editor próprio do Opex', (id, testId) => {
    wrap(<Resolved id={id} />)
    expect(screen.getByTestId(`resolved-${id}`).querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
  })

  it('API interna ganha o card de Tokens de sistema', () => {
    wrap(<Resolved id="internal_api" />)
    expect(screen.queryByTestId('ApiTokensCard')).not.toBeNull()
  })

  it('Crons recebe as abas Jobs e Observações', () => {
    wrap(<Resolved id="crons" />)
    expect(screen.getByTestId('CronsEditorForm').getAttribute('data-tabs')).toBe('jobs,observacoes')
  })

  it('o hub de IA recebe as abas de agentes e o OpenCode as abas extras', () => {
    wrap(
      <>
        <Resolved id="ai" />
        <Resolved id="ai_opencode" />
      </>,
    )
    const hubTabs = screen.getByTestId('AiEditorForm').getAttribute('data-tabs')!.split(',')
    expect(hubTabs).toContain('agente-opex')
    expect(hubTabs).toContain('rotineiros')
    expect(screen.getByTestId('AiProviderEditorForm').getAttribute('data-provider-tabs')).toBe('opencode:controles|contas|skills|agentes|comandos|plugins|mcps')
  })

  it('página própria pela central: configuração de um cliente de Orçamentos', async () => {
    wrap(<IntegrationsCentral slug={['clientes', 'c1']} />)
    expect((await screen.findByTestId('ClienteConfigPage')).getAttribute('data-client-id')).toBe('c1')
  })

  it('página própria pela central: central de desenvolvimento do hub de IA', async () => {
    wrap(<IntegrationsCentral slug={['ia', 'centrais', 'x9']} />)
    expect((await screen.findByTestId('CentralPage')).getAttribute('data-client-id')).toBe('x9')
  })
})
