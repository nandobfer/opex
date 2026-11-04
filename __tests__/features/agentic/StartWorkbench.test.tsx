/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refine: vi.fn(), useTaskDetail: vi.fn(), updateTask: vi.fn(), refinement: vi.fn() }))

/** Modelos do catálogo do OpenCode (o popover usa a busca e a variante). */
const MODELS = [
  { id: 'anthropic/opus', name: 'Claude Opus', group: 'Anthropic', variants: ['low', 'high'] },
  { id: 'openai/gpt-5', name: 'GPT-5', group: 'OpenAI', variants: [] },
]

/** Configuração geral com modelo no Planejamento (origem "do padrão global"). */
const AGENTIC_SETTINGS = {
  ...DEFAULT_AGENTIC_SETTINGS,
  agents: { ...DEFAULT_AGENTIC_SETTINGS.agents, planning: { agent: 'plan', model: 'anthropic/opus', variant: 'high' } },
}

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/lib/api', () => ({ apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: MODELS, isLoading: false, isError: false, error: null }) }))
/** Busca simplificada: um botão por modelo (o popover da busca não interessa aqui). */
vi.mock('@/features/ai/components/model-picker/ModelSearchPicker', () => ({
  ModelSearchPicker: ({ trigger, models, onPick }: { trigger: React.ReactElement; models: { data: typeof MODELS }; onPick: (model: (typeof MODELS)[number]) => void }) => (
    <div>
      {trigger}
      {models.data.map((model) => (
        <button key={model.id} type="button" onClick={() => onPick(model)}>
          escolher {model.name}
        </button>
      ))}
    </div>
  ),
}))
/** Select simplificado: um botão por opção (o portal do Radix Select não abre no DOM de teste). */
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  const Ctx = React.createContext<(value: string) => void>(() => undefined)
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: React.ReactNode }) => <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const change = React.useContext(Ctx)
      return (
        <button type="button" onClick={() => change(value)}>
          variante {children}
        </button>
      )
    },
  }
})
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useStartWorkbench: () => ({ mutate: mocks.mutate, isPending: false }),
  useRefineWorkbench: () => ({ mutate: mocks.refine, isPending: false }),
  useAgenticSettings: () => ({ data: { settings: AGENTIC_SETTINGS, availability: { available: true, reason: null } } }),
  useCentralQueue: () => ({ data: [] }),
}))
// Agente Refinador (OPE-137): disponível e sem refinamento, salvo quando o caso define outro estado.
vi.mock('@/features/refinement/hooks/useRefinement', () => ({ useTaskRefinement: mocks.refinement, useRefinementRealtime: vi.fn() }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskDetail: mocks.useTaskDetail, useUpdateTask: () => ({ mutate: mocks.updateTask, isPending: false }) }))

import { StartWorkbench } from '@/features/agentic/components/workbench/StartWorkbench'
import type { CentralDto } from '@/features/agentic/types'
import type { TaskDetailDto } from '@/features/tasks/types'

const central = (patch: Partial<CentralDto> = {}): CentralDto => ({
  id: 'c1',
  projectId: 'p1',
  projectName: 'Portal',
  sigla: 'APP',
  config: defaultCentralConfig('/home/u/app'),
  repo: 'org/app',
  repoUrl: null,
  lastTest: null,
  activeWorkbenches: 0,
  runningWorkbenches: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch,
})

const task = (patch: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: 't1',
  code: 'OPE-10',
  columnId: 'col',
  order: 0,
  title: 'Mesa de trabalho — estado inicial',
  taskType: null,
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'org/app', sigla: 'OPX' },
  createdAt: null,
  updatedAt: null,
  description: 'Mostrar título e descrição da tarefa na abertura da mesa.',
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  agenticFlow: 'preview',
  ...patch,
})

const renderStart = (patch: Partial<CentralDto> = {}, taskPatch: Partial<TaskDetailDto> = {}) => {
  mocks.useTaskDetail.mockReturnValue({ data: task(taskPatch), isLoading: false, error: null })
  return render(<StartWorkbench central={central(patch)} taskId="t1" />)
}

const REFINER = { agent: 'plan', model: 'openai/gpt-5', variant: null }
const refinementState = (refinement: Record<string, unknown> | null = null, availability = { available: true, reason: null as string | null }) => ({
  data: { refinement, availability: { ...availability, centralId: 'c1', sessionDirectory: '/home/u/app' }, workbench: null, refinerModel: REFINER },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.refinement.mockReturnValue(refinementState())
})

describe('StartWorkbench', () => {
  it('mostra a descrição da tarefa e envia as informações adicionais ao abrir', () => {
    renderStart()
    expect(screen.getByText('Mesa de trabalho — estado inicial')).toBeTruthy()
    expect(screen.getByText('Mostrar título e descrição da tarefa na abertura da mesa.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Informações adicionais (opcional)'), { target: { value: 'Use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: 'Use o componente X' }, expect.anything())
  })

  it('sem informações adicionais envia o texto indefinido', () => {
    renderStart()
    expect(screen.queryByLabelText('Informações adicionais (opcional)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: undefined }, expect.anything())
  })

  it('central desativada desabilita o botão com o motivo', () => {
    renderStart({ config: { ...defaultCentralConfig('/home/u/app'), enabled: false } })
    const button = screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('A central está desativada')).toBeTruthy()
  })

  it('tarefa de outro projeto desabilita o botão com o motivo', () => {
    renderStart({}, { project: { id: 'p9', name: 'Outro', repo: 'org/x', sigla: 'OUT' } })
    const button = screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/A tarefa não é do projeto Portal/)).toBeTruthy()
  })
})

describe('StartWorkbench · Gerar prévia', () => {
  const flow = () => document.getElementById('workbench-flow') as HTMLButtonElement

  it('chave "Gerar prévia" começa ligada (Publicar prévia, o padrão)', () => {
    renderStart()
    expect(screen.getByText('Gerar prévia')).toBeTruthy()
    expect(flow().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Ligada')
  })

  it('tarefa salva com PR automático mostra a chave desligada', () => {
    renderStart({}, { agenticFlow: 'auto_pr' })
    expect(flow().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Desligada')
  })

  it('desligar grava o fluxo PR automático na tarefa, otimista e imediatamente', () => {
    renderStart()
    fireEvent.click(flow())
    expect(mocks.updateTask).toHaveBeenCalledWith({
      task: { id: 't1', code: 'OPE-10' },
      body: { agenticFlow: 'auto_pr' },
      patch: { agenticFlow: 'auto_pr' },
    })
  })

  it('religar volta ao padrão Publicar prévia', () => {
    renderStart({}, { agenticFlow: 'auto_pr' })
    fireEvent.click(flow())
    expect(mocks.updateTask).toHaveBeenCalledWith({
      task: { id: 't1', code: 'OPE-10' },
      body: { agenticFlow: 'preview' },
      patch: { agenticFlow: 'preview' },
    })
  })

  it('tarefa sem escolha segue o padrão da central (Publicar prévia) e oferece personalizar', () => {
    renderStart({}, { agenticFlow: null })
    expect(flow().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Ligada')
    expect(screen.getAllByText(/Seguindo o padrão da central/)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Usar padrão da central' })).toBeNull()
  })

  it('central configurada em PR automático é o padrão herdado pela tarefa', () => {
    const base = defaultCentralConfig('/home/u/app')
    renderStart({ config: { ...base, environment: { ...base.environment, publishPreview: false } } }, { agenticFlow: null })
    expect(flow().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('workbench-flow-status').textContent).toBe('Desligada')
    expect(screen.getAllByText(/Seguindo o padrão da central/).length).toBeGreaterThan(0)
  })

  it('a escolha da tarefa vence o padrão da central e pode voltar a herdar', () => {
    const base = defaultCentralConfig('/home/u/app')
    renderStart({ config: { ...base, environment: { ...base.environment, publishPreview: false } } }, { agenticFlow: 'preview' })
    expect(flow().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Escolhido só para esta tarefa/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Usar padrão da central' }))
    expect(mocks.updateTask).toHaveBeenCalledWith({
      task: { id: 't1', code: 'OPE-10' },
      body: { agenticFlow: null },
      patch: { agenticFlow: null },
    })
  })
})

describe('StartWorkbench · modelos (OPE-134)', () => {
  const startButton = () => screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ })
  const openModels = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Configurar modelos por etapa' }))
    return screen.getByRole('dialog', { name: 'Modelos por etapa' })
  }
  const section = (dialog: HTMLElement, title: string) => within(dialog).getByRole('region', { name: title })

  it('mostra o controle à esquerda do botão, com o modelo do Plano e a origem', () => {
    renderStart()
    const control = screen.getByTestId('start-workbench-model-settings')
    const button = startButton()

    expect(within(control).getByRole('status', { name: 'Modelo do Plano: Claude Opus (high), do padrão global' })).toBeTruthy()
    expect(within(control).getByRole('button', { name: 'Configurar modelos por etapa' })).toBeTruthy()
    // Mesma posição relativa da mesa em andamento: controle no início da linha, botão alinhado à direita.
    expect(control.closest('.mr-auto')).toBeTruthy()
    expect(button.closest('.ml-auto')).toBeTruthy()
    expect(control.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('popover lista as seis etapas (com o Refinamento — OPE-137), marca o Planejamento como atual e mostra o padrão herdado', () => {
    renderStart()
    const dialog = openModels()
    const titles = within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(['Refinamento', 'Planejamento', 'Implementação', 'Build e ambiente', 'Pull Request', 'Fork da conversa'])
    expect(within(section(dialog, 'Planejamento')).getByText('Etapa atual')).toBeTruthy()
    expect(within(dialog).getAllByText('Etapa atual')).toHaveLength(1)
    expect(within(section(dialog, 'Planejamento')).getByText('Claude Opus (high) · do padrão global')).toBeTruthy()
  })

  it('a troca feita no controle vai junto do clique em abrir a mesa', () => {
    renderStart()
    const dialog = openModels()
    const implementation = section(dialog, 'Implementação')
    fireEvent.click(within(implementation).getByRole('radio', { name: 'Personalizar nesta mesa' }))
    fireEvent.click(within(implementation).getByRole('button', { name: 'escolher GPT-5' }))

    fireEvent.click(startButton())
    expect(mocks.mutate).toHaveBeenCalledWith(
      { centralId: 'c1', taskId: 't1', text: undefined, modelOverrides: { implementation: { model: 'openai/gpt-5', variant: null } } },
      expect.anything(),
    )
  })

  it('sem troca, abrir não envia modelOverrides', () => {
    renderStart()
    fireEvent.click(startButton())
    expect(mocks.mutate).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: undefined }, expect.anything())
  })

  it('voltar uma etapa ao padrão da central tira a troca do envio', () => {
    renderStart()
    const planning = section(openModels(), 'Planejamento')
    fireEvent.click(within(planning).getByRole('radio', { name: 'Personalizar nesta mesa' }))
    fireEvent.click(within(planning).getByRole('button', { name: 'escolher GPT-5' }))
    expect(screen.getByRole('status', { name: 'Modelo do Plano: GPT-5, definido nesta mesa' })).toBeTruthy()

    fireEvent.click(within(planning).getByRole('radio', { name: 'Padrão da central' }))
    expect(screen.getByRole('status', { name: 'Modelo do Plano: Claude Opus (high), do padrão global' })).toBeTruthy()

    fireEvent.click(startButton())
    expect(mocks.mutate).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: undefined }, expect.anything())
  })

  it('a escolha é só desta tela: trocar o modelo não grava nada na tarefa', () => {
    renderStart()
    const implementation = section(openModels(), 'Implementação')
    fireEvent.click(within(implementation).getByRole('radio', { name: 'Personalizar nesta mesa' }))
    fireEvent.click(within(implementation).getByRole('button', { name: 'escolher GPT-5' }))
    expect(mocks.updateTask).not.toHaveBeenCalled()
  })
})

describe('StartWorkbench · Refinar tarefa (OPE-137)', () => {
  const refineButton = () => screen.getByRole('button', { name: /Refinar tarefa/ })
  const openButton = () => screen.getByRole('button', { name: /Abrir mesa e gerar o plano/ })

  it('abas Descrição e Especificação: a especificação salva ou o estado vazio', () => {
    renderStart({}, { technicalSpec: null })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Descrição', 'Especificação'])
    fireEvent.click(screen.getByRole('tab', { name: 'Especificação' }))
    expect(screen.getByText('Sem especificação técnica.')).toBeTruthy()
  })

  it('a aba Especificação mostra a especificação técnica salva', () => {
    renderStart({}, { technicalSpec: '- critério de aceite salvo' })
    fireEvent.click(screen.getByRole('tab', { name: 'Especificação' }))
    expect(screen.getByText('critério de aceite salvo')).toBeTruthy()
  })

  it('"Refinar tarefa" fica à esquerda de "Abrir mesa e gerar o plano", na mesma linha, e o Ctrl+Enter segue no Abrir mesa', () => {
    renderStart()
    const refine = refineButton()
    const open = openButton()
    expect(refine.parentElement).toBe(open.parentElement)
    expect(refine.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(open.hasAttribute('data-ctrl-enter-submit')).toBe(true)
    expect(refine.hasAttribute('data-ctrl-enter-submit')).toBe(false)
  })

  it('refinar envia o texto e os modelos da tela (e não abre o planejamento)', () => {
    renderStart()
    fireEvent.change(screen.getByLabelText('Informações adicionais (opcional)'), { target: { value: 'Regra X' } })
    fireEvent.click(refineButton())
    expect(mocks.refine).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1', text: 'Regra X' }, expect.anything())
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('refinamento já concluído: abre sem enviar o texto (ele vai para o Gerar plano)', () => {
    mocks.refinement.mockReturnValue(refinementState({ concluded: true, runState: 'idle', liveChat: false }))
    renderStart()
    fireEvent.change(screen.getByLabelText('Informações adicionais (opcional)'), { target: { value: 'Para o planejador' } })
    fireEvent.click(refineButton())
    expect(mocks.refine).toHaveBeenCalledWith({ centralId: 'c1', taskId: 't1' }, expect.anything())
  })

  it('refinamento em andamento bloqueia "Abrir mesa e gerar o plano" com o motivo e libera o Refinar', () => {
    mocks.refinement.mockReturnValue(refinementState({ concluded: false, runState: 'interrupted', liveChat: false }))
    renderStart()
    expect(openButton().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(openButton())
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(refineButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('Agente Refinador indisponível bloqueia só o Refinar', () => {
    mocks.refinement.mockReturnValue(refinementState(null, { available: false, reason: 'Ative o Agente Refinador em Integrações › Inteligência Artificial' }))
    renderStart()
    expect(refineButton().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(refineButton())
    expect(mocks.refine).not.toHaveBeenCalled()
    expect(openButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('tarefa de outro projeto também bloqueia o Refinar', () => {
    renderStart({}, { project: { id: 'p9', name: 'Outro', repo: 'org/x', sigla: 'OUT' } })
    expect(refineButton().getAttribute('aria-disabled')).toBe('true')
  })

  it('"Gerar plano após refinar" segue o padrão da central e aceita ajuste só desta tarefa', () => {
    renderStart({}, { planAfterRefinement: null })
    const toggle = document.getElementById('workbench-plan-after-refinement') as HTMLButtonElement
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(mocks.updateTask).toHaveBeenCalledWith({ task: { id: 't1', code: 'OPE-10' }, body: { planAfterRefinement: true }, patch: { planAfterRefinement: true } })
  })

  it('a escolha da tarefa mostra o texto da escolha própria e volta a herdar', () => {
    renderStart({}, { planAfterRefinement: true, agenticFlow: null })
    expect(screen.getByText(/Escolhido só para esta tarefa \(a central está em Desligado\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Usar padrão da central' }))
    expect(mocks.updateTask).toHaveBeenCalledWith({ task: { id: 't1', code: 'OPE-10' }, body: { planAfterRefinement: null }, patch: { planAfterRefinement: null } })
  })
})
