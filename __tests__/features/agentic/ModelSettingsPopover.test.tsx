/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * OPE-126: modelo da mesa = texto do modelo/variante em uso + um único botão de configuração que abre
 * "Modelos por etapa" (padrão da aba Agentes da central). Cada etapa grava na hora o próprio papel.
 */

const mocks = vi.hoisted(() => ({ setWorkbenchModel: vi.fn(), setForkModel: vi.fn(), pending: { isPending: false, variables: undefined as { role: string } | undefined } }))

const MODELS = [
  { id: 'anthropic/opus', name: 'Claude Opus', group: 'Anthropic', variants: ['low', 'high'] },
  { id: 'openai/gpt-5', name: 'GPT-5', group: 'OpenAI', variants: [] },
]

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: MODELS, isLoading: false, isError: false, error: null }) }))
/** Busca simplificada: o gatilho e um botão por modelo (o popover da busca não interessa aqui). */
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
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useSetWorkbenchModel: () => ({ mutate: mocks.setWorkbenchModel, ...mocks.pending }) }))
vi.mock('@/features/agentic/hooks/useForks', () => ({ useSetForkModel: () => ({ mutate: mocks.setForkModel, isPending: false }) }))

import { WorkbenchModelSettings } from '@/features/agentic/components/workbench/WorkbenchModelSettings'
import { ForkModelSettings } from '@/features/agentic/components/workbench/ForkModelSettings'
import type { ForkDto, ModelChoiceDto, WorkbenchDto } from '@/features/agentic/types'

const choice = (patch: Partial<ModelChoiceDto> = {}): ModelChoiceDto => ({ model: null, variant: null, overridden: false, inherited: { model: null, variant: null }, source: 'global', inheritedSource: 'global', ...patch })

const models = {
  planning: choice({ model: 'anthropic/opus', variant: 'high', inherited: { model: 'anthropic/opus', variant: 'high' }, source: 'central', inheritedSource: 'central' }),
  implementation: choice({ model: 'openai/gpt-5', overridden: true, inherited: { model: 'anthropic/opus', variant: null }, source: 'workbench', inheritedSource: 'central' }),
  build: choice(),
  pr: choice(),
  fork: choice(),
}

const workbench = (patch: Partial<WorkbenchDto> = {}) => ({ id: 'w1', taskId: 't1', stage: 'plan_review', runState: 'idle', models, adversarialModel: null, ...patch }) as WorkbenchDto

const open = (name = 'Configurar modelos por etapa') => {
  fireEvent.click(screen.getByRole('button', { name }))
  return screen.getByRole('dialog', { name: 'Modelos por etapa' })
}
const section = (dialog: HTMLElement, title: string) => within(dialog).getByRole('region', { name: title })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pending.isPending = false
  mocks.pending.variables = undefined
})

describe('WorkbenchModelSettings', () => {
  it('mostra o modelo e a variante em uso na etapa atual e um único botão de configuração (sem o seletor de modelo e o de variante)', () => {
    render(<WorkbenchModelSettings workbench={workbench({ stage: 'changes_requested' })} />)
    const text = screen.getByRole('status', { name: 'Modelo do Plano: Claude Opus (high), da central' })
    expect(text.textContent).toBe('Claude Opushigh')
    expect(text.querySelectorAll('svg').length).toBe(2)
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Configurar modelos por etapa'])
  })

  it('modelo trocado na mesa fica destacado; com o agente respondendo o botão continua disponível', () => {
    render(<WorkbenchModelSettings workbench={workbench({ stage: 'implementing', runState: 'running' })} />)
    const text = screen.getByRole('status', { name: 'Modelo da Implementação: GPT-5, definido nesta mesa' })
    expect(text.classList.contains('text-primary')).toBe(true)
    expect(screen.getByRole('button', { name: 'Configurar modelos por etapa' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('popover lista as cinco etapas, marca a etapa atual e mostra o padrão herdado com a origem', () => {
    render(<WorkbenchModelSettings workbench={workbench({ stage: 'preview' })} />)
    const dialog = open()
    const titles = within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(['Planejamento', 'Implementação', 'Build e ambiente', 'Pull Request', 'Fork da conversa'])
    expect(within(section(dialog, 'Build e ambiente')).getByText('Etapa atual')).toBeTruthy()
    expect(within(dialog).getAllByText('Etapa atual')).toHaveLength(1)
    expect(within(section(dialog, 'Planejamento')).getByText('Claude Opus (high) · da central')).toBeTruthy()
    expect(within(section(dialog, 'Build e ambiente')).getByText('Padrão do agente · do padrão global')).toBeTruthy()
  })

  it('escolher o modelo de outra etapa grava o papel daquela etapa; a variante vai junto com o modelo', () => {
    render(<WorkbenchModelSettings workbench={workbench({ stage: 'plan_review' })} />)
    const dialog = open()
    const pr = section(dialog, 'Pull Request')
    fireEvent.click(within(pr).getByRole('radio', { name: 'Personalizar nesta mesa' }))
    // "Personalizar" só abre os campos: nada é gravado até escolher.
    expect(mocks.setWorkbenchModel).not.toHaveBeenCalled()
    fireEvent.click(within(pr).getByRole('button', { name: 'escolher GPT-5' }))
    expect(mocks.setWorkbenchModel).toHaveBeenCalledWith({ role: 'pr', model: 'openai/gpt-5', variant: null })

    const planning = section(dialog, 'Planejamento')
    fireEvent.click(within(planning).getByRole('radio', { name: 'Personalizar nesta mesa' }))
    fireEvent.click(within(planning).getByRole('button', { name: 'variante low' }))
    expect(mocks.setWorkbenchModel).toHaveBeenLastCalledWith({ role: 'planning', model: 'anthropic/opus', variant: 'low' })
  })

  it('"Padrão da central" numa etapa trocada volta ao padrão (model: null)', () => {
    render(<WorkbenchModelSettings workbench={workbench()} />)
    const implementation = section(open(), 'Implementação')
    expect(within(implementation).getByRole('radio', { name: 'Personalizar nesta mesa' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(implementation).getByRole('radio', { name: 'Padrão da central' }))
    expect(mocks.setWorkbenchModel).toHaveBeenCalledWith({ role: 'implementation', model: null, variant: null })
  })

  it('a etapa em gravação fica destacada com "Alterando" e o texto ao vivo nomeia a etapa', () => {
    mocks.pending.isPending = true
    mocks.pending.variables = { role: 'fork' }
    render(<WorkbenchModelSettings workbench={workbench()} />)
    const dialog = open()
    expect(within(section(dialog, 'Fork da conversa')).getByText('Alterando')).toBeTruthy()
    expect(within(section(dialog, 'Planejamento')).queryByText('Alterando')).toBeNull()
    expect(within(dialog).getByText('Alterando: Fork da conversa')).toBeTruthy()
  })

  it('revisão adversária mostra o modelo do Agente Adversário; Concluída e central ilegível ocultam tudo', () => {
    const { unmount } = render(<WorkbenchModelSettings workbench={workbench({ stage: 'adversarial_review', adversarialModel: { model: 'openai/gpt-5', variant: null } })} />)
    expect(screen.getByRole('status', { name: /Modelo do Agente Adversário: GPT-5/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Configurar modelos por etapa' })).toBeTruthy()
    unmount()
    const done = render(<WorkbenchModelSettings workbench={workbench({ stage: 'done' })} />)
    expect(done.container.innerHTML).toBe('')
    done.unmount()
    const unreadable = render(<WorkbenchModelSettings workbench={workbench({ models: null })} />)
    expect(unreadable.container.innerHTML).toBe('')
  })
})

describe('ForkModelSettings', () => {
  const fork = { id: 'f1', number: 2, model: choice({ model: 'anthropic/opus', inherited: { model: 'anthropic/opus', variant: null }, source: 'workbench', inheritedSource: 'workbench' }) } as unknown as ForkDto

  it('"Este fork" vem primeiro e troca só o fork; as etapas da mesa seguem no mesmo popover', () => {
    render(<ForkModelSettings workbench={workbench()} fork={fork} />)
    expect(screen.getByRole('status', { name: 'Modelo do fork: Claude Opus, definido nesta mesa' })).toBeTruthy()
    const dialog = open('Configurar modelos do fork e das etapas')
    const titles = within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(titles[0]).toBe('Este fork')
    expect(titles).toContain('Fork da conversa')
    const own = section(dialog, 'Este fork')
    expect(within(own).getByText('Claude Opus · definido nesta mesa')).toBeTruthy()
    fireEvent.click(within(own).getByRole('radio', { name: 'Personalizar neste fork' }))
    fireEvent.click(within(own).getByRole('button', { name: 'escolher GPT-5' }))
    expect(mocks.setForkModel).toHaveBeenCalledWith({ model: 'openai/gpt-5', variant: null })
    expect(mocks.setWorkbenchModel).not.toHaveBeenCalled()
    // Só "Este fork" é marcado como atual no popover do fork.
    expect(within(dialog).getAllByText('Etapa atual')).toHaveLength(1)
  })
})

describe('controles da mesa e do fork (estático)', () => {
  it('as barras da mesa e do fork não usam mais o seletor antigo (modelo + botão de variante) nem select nativo', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(process.cwd(), 'src/features/agentic/components/workbench')
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.tsx'))) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toContain('ModelOverridePicker')
      expect(source, file).not.toMatch(/<select[\s>]/)
    }
  })
})
