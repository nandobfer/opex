/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import { modelFavoritesMock } from '../../helpers/model-favorites'

/** Telas dos agentes rotineiros (OPE-130): editor, lista da aba Rotineiros, Entradas e o toast de atenção. */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  status: vi.fn(),
  provisioning: vi.fn(),
  addEntry: vi.fn(),
  listFilter: [] as string[],
  agents: [] as unknown[],
  loaded: undefined as unknown,
  providers: [] as { id: string; connected: boolean }[],
  opencode: {
    available: true,
    reason: null as string | null,
    mcps: [{ name: 'playwright', status: 'connected', browser: true }, { name: 'github', status: 'connected', browser: false }],
    skills: [{ name: 'revisar-pr', description: 'Revisa PRs', native: false }, { name: 'customize-opencode', description: 'Ajusta o OpenCode', native: true }],
    browserAvailable: true,
  },
  refetchOpencode: vi.fn(),
  opexSkills: [
    { id: 's1', name: 'resumir', description: 'Resume textos', enabled: true },
    { id: 's2', name: 'traduzir', description: 'Traduz textos', enabled: false },
  ],
}))
vi.mock('@/features/opex-agent/hooks/useOpexSkills', () => ({
  useOpexSkills: () => ({ data: mocks.opexSkills, isLoading: false, isError: false, refetch: vi.fn() }),
  useOpexSkillsRealtime: () => {},
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAiModelFavorites', () => modelFavoritesMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/' }))
vi.mock('@/features/routine-agents/hooks/useRoutineAgents', () => ({
  useRoutineAgent: () => ({ data: mocks.loaded, isLoading: false }),
  useSaveRoutineAgent: () => ({ mutate: mocks.save, isPending: false }),
  useRoutineOpencodeOptions: () => ({ data: mocks.opencode, isLoading: false, refetch: mocks.refetchOpencode }),
  useRoutineProvisioning: () => ({ mutate: mocks.provisioning, isPending: false }),
  useRoutineAgentStatus: () => ({ mutate: mocks.status, isPending: false }),
  useRoutineAgents: (filter: string) => {
    mocks.listFilter.push(filter)
    return { data: mocks.agents, isLoading: false, isError: false, refetch: vi.fn() }
  },
}))
vi.mock('@/features/routine-agents/hooks/useRoutineRuns', () => ({
  useRoutineEntries: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useAddRoutineEntry: () => ({ mutate: mocks.addEntry, isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({
  useAiProviderStatuses: () => ({ providers: mocks.providers }),
  useAiModels: () => ({ data: [], isLoading: false, isError: false }),
  useAiAgents: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/opex-agent/hooks/useOpexSettings', () => ({ useOpexSettings: () => ({ data: { tools: [] }, isLoading: false, isError: false }) }))
vi.mock('@/features/opex-agent/hooks/useOpexMcpServers', () => ({ useOpexMcpServers: () => ({ data: [], isLoading: false, isError: false }), useOpexMcpRealtime: () => {} }))

import { RoutineAgentEditor } from '@/features/routine-agents/components/editor/RoutineAgentEditor'
import { RoutineAgentsSection } from '@/features/routine-agents/components/settings/RoutineAgentsSection'
import { RoutineEntriesTab } from '@/features/routine-agents/components/page/RoutineEntriesTab'
import { attentionToast } from '@/features/routine-agents/hooks/useRoutineRealtime'
import { runDisabledReason } from '@/features/routine-agents/components/page/RoutineAgentPage'
import type { RoutineAgentDto } from '@/features/routine-agents/types'
import { DEFAULT_ROUTINE_AGENT_INPUT, EMPTY_ROUTINE_LIMITS, ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE, routineAgentInputSchema } from '@/features/routine-agents/schemas'

const AGENT: RoutineAgentDto = {
  id: 'a'.repeat(24),
  name: 'Vagas',
  title: 'Agente Vagas',
  generated: { name: false, objective: false },
  slug: 'vagas',
  objective: 'Candidatar-se',
  instructions: '',
  engine: 'opex',
  opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: [], enabledMcpServers: [] },
  opencode: { model: '', variant: null, agent: null, enabledMcps: [] },
  confirmIrreversible: true,
  limits: EMPTY_ROUTINE_LIMITS,
  triggers: [],
  schedule: [],
  status: 'active',
  provisioning: { status: 'ok', error: null, at: null, channels: [], extras: [], blocked: [], warnings: [], steps: { agent: true, token: true, channels: true, extras: true, workdir: true } },
  webhookEnabled: false,
  workdir: null,
  engramindAgent: 'opex/rotineiro-vagas',
  channel: 'agentes/rotineiros/vagas',
  lastRun: null,
  nextFireAt: null,
  activeRuns: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listFilter = []
  mocks.agents = [AGENT]
})
afterEach(() => cleanup())

describe('editor do agente rotineiro', () => {
  it('valida em pt-BR com o mesmo schema da API e não salva', async () => {
    render(<RoutineAgentEditor open agentId={null} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar agente' }))
    // Critério aprovado (OPE-130, D8): nome e objetivo são opcionais, mas o objetivo ou as instruções são obrigatórios.
    await waitFor(() => expect(screen.getByText('Preencha o objetivo ou as instruções: o provisionamento gera o resto a partir deles')).toBeTruthy())
    expect(screen.queryByText(/Informe o nome/)).toBeNull()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('critério aprovado (OPE-130, D8): nome e objetivo opcionais; o selo "Gerado" aparece no campo gerado', async () => {
    mocks.loaded = { ...AGENT, name: 'Recrutador', title: 'Agente Recrutador', generated: { name: true, objective: false } }
    render(<RoutineAgentEditor open agentId={AGENT.id} onClose={() => {}} />)
    await waitFor(() => expect(screen.getAllByTestId('routine-generated-badge')).toHaveLength(1))
    expect(screen.getAllByText('Opcional: gerado pelo provisionamento se ficar vazio.')).toHaveLength(2)
    expect(screen.getByText('Editar Agente Recrutador')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Caçador' } })
    await waitFor(() => expect(screen.queryByTestId('routine-generated-badge')).toBeNull())
    mocks.loaded = undefined
  })

  it('as ferramentas internas aparecem sempre; no OpenCode, os MCPs do host com o navegador', async () => {
    render(<RoutineAgentEditor open agentId={null} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Ferramentas' }))
    expect(screen.getByText('Sempre liberadas')).toBeTruthy()
    for (const label of ['Gravar memória', 'Espera viva', 'Hibernar', 'Pedir confirmação', 'Concluir']) expect(screen.getByText(label)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Motor' }))
    fireEvent.click(screen.getByRole('radio', { name: 'OpenCode no host' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ferramentas' }))
    expect(screen.getByText('MCPs do host')).toBeTruthy()
    expect(screen.getByLabelText('Liberar playwright')).toBeTruthy()
    expect(screen.getByLabelText('Navegador')).toBeTruthy()
  })

  it('OPE-153: motor Opex lista todas as skills do Agente Opex (D2), com a situação só informativa, e nenhuma liberada (D3)', () => {
    render(<RoutineAgentEditor open agentId={null} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Ferramentas' }))
    const traduzir = screen.getByLabelText('Liberar traduzir')
    expect((traduzir as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('Desligada no Agente Opex')).toBeTruthy()
    expect(screen.getByText('Ligada no Agente Opex')).toBeTruthy()
    fireEvent.click(traduzir)
    expect((screen.getByLabelText('Liberar traduzir') as HTMLInputElement).checked).toBe(true)
  })

  it('OPE-153: motor OpenCode lista globais e nativas (selo "Nativa"); skill salva que sumiu aparece "(não encontrada)"', () => {
    mocks.loaded = {
      id: 'a1', name: 'Rec', title: 'Agente Rec', generated: { name: false, objective: false }, slug: 'rec', objective: 'x', instructions: '', engine: 'opencode',
      opex: { provider: null, model: '', variant: null, enabledTools: [], enabledMcpServers: [], enabledSkills: [] },
      opencode: { model: 'a/b', variant: null, agent: null, enabledMcps: [], enabledSkills: ['customize-opencode', 'apagada'] },
      confirmIrreversible: true, limits: { concurrency: 1, maxActiveMinutes: null, maxWaitingMinutes: null, maxTokens: null, maxLiveWaitMinutes: null }, triggers: [], schedule: [], status: 'active',
      provisioning: { status: 'ok', error: null, at: null, steps: {}, channels: [], extras: [], warnings: [] },
    }
    render(<RoutineAgentEditor open agentId="a1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Ferramentas' }))
    expect(screen.getByText('Nativa')).toBeTruthy()
    expect((screen.getByLabelText('Liberar customize-opencode') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Liberar revisar-pr') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('(não encontrada)')).toBeTruthy()
    mocks.loaded = undefined
  })

  it('OPE-153: OpenCode desligado no editor avisa com "Tentar novamente" e mantém a seleção salva visível', () => {
    const previous = mocks.opencode
    mocks.opencode = { ...previous, available: false, reason: 'Serviço OpenCode indisponível: ECONNREFUSED', mcps: [], skills: [], browserAvailable: false }
    mocks.loaded = {
      id: 'a1', name: 'Rec', title: 'Agente Rec', generated: { name: false, objective: false }, slug: 'rec', objective: 'x', instructions: '', engine: 'opencode',
      opex: { provider: null, model: '', variant: null, enabledTools: [], enabledMcpServers: [], enabledSkills: [] },
      opencode: { model: 'a/b', variant: null, agent: null, enabledMcps: [], enabledSkills: ['revisar-pr'] },
      confirmIrreversible: true, limits: { concurrency: 1, maxActiveMinutes: null, maxWaitingMinutes: null, maxTokens: null, maxLiveWaitMinutes: null }, triggers: [], schedule: [], status: 'active',
      provisioning: { status: 'ok', error: null, at: null, steps: {}, channels: [], extras: [], warnings: [] },
    }
    render(<RoutineAgentEditor open agentId="a1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Ferramentas' }))
    expect(screen.getByText('Não foi possível listar as skills do host')).toBeTruthy()
    expect((screen.getByLabelText('Liberar revisar-pr') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('(salva; OpenCode indisponível)')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Tentar novamente/ })[0]!)
    expect(mocks.refetchOpencode).toHaveBeenCalled()
    mocks.opencode = previous
    mocks.loaded = undefined
  })

  it('critério aprovado (OPE-130, D9): o motor Opex não oferece o OpenCode; o motor OpenCode continua com o seletor fixo', () => {
    mocks.providers = ['opencode', 'gemini', 'anthropic', 'openai', 'deepseek'].map((id) => ({ id, connected: true }))
    render(<RoutineAgentEditor open agentId={null} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Motor' }))
    expect(screen.getByRole('radio', { name: 'Anthropic' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'OpenCode' })).toBeNull()
    expect(screen.getByText(/O OpenCode não aparece: ele não aceita as ferramentas do app/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'OpenCode no host' }))
    expect(screen.queryByRole('radio', { name: 'Anthropic' })).toBeNull()
    mocks.providers = []
  })

  it('critério aprovado (OPE-130, limite por tokens): o limite de custo deu lugar ao máximo de tokens', () => {
    render(<RoutineAgentEditor open agentId={null} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Limites' }))
    expect(screen.getByLabelText('Máximo de tokens por execução')).toBeTruthy()
    expect(screen.queryByText(/Custo máximo/)).toBeNull()
    expect((screen.getByLabelText('Espera viva máxima (min)') as HTMLInputElement).placeholder).toBe('10 (padrão)')
  })
})

describe('aba Rotineiros', () => {
  it('o filtro padrão esconde os arquivados; arquivar pede confirmação', async () => {
    const view = render(<RoutineAgentsSection onEdit={() => {}} onNew={() => {}} />)
    expect(mocks.listFilter[0]).toBe('current')
    fireEvent.click(screen.getByRole('radio', { name: 'Arquivados' }))
    expect(mocks.listFilter.at(-1)).toBe('archived')
    view.unmount()
    render(<RoutineAgentsSection onEdit={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Arquivar$/ }))
    expect(screen.getByText('Arquivar "Agente Vagas"?')).toBeTruthy()
    expect(mocks.status).not.toHaveBeenCalled()
  })

  it('critério aprovado (OPE-130, D21): o nome do agente é um link para a página dele', () => {
    mocks.agents = [AGENT]
    render(<RoutineAgentsSection onEdit={vi.fn()} onNew={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Agente Vagas' }).getAttribute('href')).toBe(`/agentes-rotineiros/${AGENT.id}`)
  })

  it('pausar e reprovisionar chamam as ações', () => {
    render(<RoutineAgentsSection onEdit={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Pausar/ }))
    expect(mocks.status).toHaveBeenCalledWith({ id: AGENT.id, action: 'pause' })
    fireEvent.click(screen.getByRole('button', { name: /Reprovisionar/ }))
    expect(mocks.provisioning).toHaveBeenCalledWith({ id: AGENT.id, mode: 'reprovision' })
  })
})

describe('entradas do dono', () => {
  it('entrada vazia é recusada; com erro, o texto continua no campo', async () => {
    render(<RoutineEntriesTab agentId={AGENT.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gravar entrada' }))
    await waitFor(() => expect(screen.getByText('Escreva a entrada')).toBeTruthy())
    expect(mocks.addEntry).not.toHaveBeenCalled()
    const field = screen.getByLabelText('Entrada') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'Sem vagas presenciais' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Todos os rotineiros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gravar entrada' }))
    await waitFor(() => expect(mocks.addEntry).toHaveBeenCalledWith({ text: 'Sem vagas presenciais', target: 'global' }, expect.anything()))
    expect(field.value).toBe('Sem vagas presenciais')
  })
})

describe('toast e ações', () => {
  it('confirmação pendente e fim viram toasts com o nome do agente', () => {
    expect(attentionToast({ id: 'r', agentId: 'a', kind: 'confirmation', status: 'awaiting_confirmation', agentName: 'Vagas' })).toEqual({ kind: 'warning', message: 'O agente "Vagas" aguarda sua confirmação' })
    expect(attentionToast({ id: 'r', agentId: 'a', kind: 'finished', status: 'completed', agentName: 'Vagas' }).kind).toBe('success')
    expect(attentionToast({ id: 'r', agentId: 'a', kind: 'finished', status: 'error' }).kind).toBe('error')
  })

  it('"Executar agora" fica desabilitado com o agente pausado ou sem provisionamento', () => {
    expect(runDisabledReason(AGENT)).toBeNull()
    expect(runDisabledReason({ ...AGENT, status: 'paused' })).toContain('Retome')
    expect(runDisabledReason({ ...AGENT, provisioning: { ...AGENT.provisioning, status: 'error' } })).toBe('Provisionamento com erro')
  })
})

describe('critério aprovado (OPE-130, D9): provedores do motor Opex', () => {
  const base = { ...DEFAULT_ROUTINE_AGENT_INPUT, instructions: 'Procurar vagas' }
  it('o schema recusa o OpenCode no motor Opex e aceita os quatro provedores diretos', () => {
    expect(routineAgentInputSchema.safeParse({ ...base, opex: { ...base.opex, provider: 'opencode', model: 'x' } }).success).toBe(false)
    for (const provider of ['gemini', 'anthropic', 'openai', 'deepseek']) expect(routineAgentInputSchema.safeParse({ ...base, opex: { ...base.opex, provider, model: 'x' } }).success).toBe(true)
    expect(routineAgentInputSchema.safeParse({ ...base, engine: 'opencode', opencode: { ...base.opencode, model: 'a/b' } }).success).toBe(true)
  })

  it('"Executar agora" fica desativado com o motivo quando o provedor gravado não vale', () => {
    expect(runDisabledReason({ status: 'active', provisioning: { status: 'ok' }, engine: 'opex', opex: { provider: null } })).toBe(ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE)
    expect(runDisabledReason({ status: 'active', provisioning: { status: 'ok' }, engine: 'opex', opex: { provider: 'anthropic' } })).toBeNull()
  })
})
