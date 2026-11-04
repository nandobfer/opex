/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Mesa no refinamento (OPE-137) montada pelo pai `WorkbenchView`: em "Refinando" e "Especificação pronta"
 * a visão é a do Agente Refinador (abas, passo "Refinamento", perguntas abaixo da saída e a barra própria);
 * nas demais etapas, a mesa de sempre.
 */

const mocks = vi.hoisted(() => ({ refinementAction: vi.fn(), workbenchAction: vi.fn(), refinementStream: vi.fn(), workbenchStream: vi.fn(), refinement: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/lib/api', () => ({ apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskDetail: () => ({ data: { id: 't1', description: 'Texto da descrição', technicalSpec: 'Critérios da spec' }, isLoading: false, isError: false, error: null, refetch: vi.fn() }) }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  usePrWatchSchedule: () => ({ data: undefined }),
  useWorkbenchAction: () => ({ mutate: mocks.workbenchAction, isPending: false }),
  useSetWorkbenchPlanAfterRefinement: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchModel: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [], isLoading: false, isError: false, error: null }) }))
vi.mock('@/features/agentic/hooks/useForks', () => ({ useWorkbenchForks: () => ({ data: [] }) }))
vi.mock('@/features/agentic/hooks/useBuilds', () => ({ useWorkbenchBuilds: () => ({ data: [] }) }))
vi.mock('@/features/agentic/hooks/useWorkbenchStream', () => ({ useWorkbenchStream: mocks.workbenchStream }))
vi.mock('@/features/agentic/components/workbench/WorkbenchHeader', () => ({ WorkbenchHeader: () => null }))
vi.mock('@/features/agentic/components/workbench/Timeline', () => ({ Timeline: () => <p data-testid="timeline">saída ao vivo</p> }))
vi.mock('@/features/agentic/components/workbench/PendingRequests', () => ({ PendingRequests: () => null }))
vi.mock('@/features/agentic/components/workbench/ForksDonePrompt', () => ({ ForksDonePrompt: () => null }))
vi.mock('@/features/agentic/components/workbench/ActionBar', () => ({ ActionBar: () => <p>barra da mesa</p> }))
vi.mock('@/features/adversarial-agent/components/workbench/AdversarialRoundsView', () => ({
  useAdversarialTab: () => ({ visible: false, count: 0 }),
  AdversarialTabNavProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AdversarialRoundsView: () => null,
}))
vi.mock('@/features/architect-agent/components/workbench/ArchitectTab', () => ({ useArchitectTab: () => ({ visible: false, count: 0 }), ArchitectTab: () => null }))
vi.mock('@/features/refinement/hooks/useRefinement', () => ({
  useRefinementRealtime: vi.fn(),
  useTaskRefinement: mocks.refinement,
  useRefinementAction: () => ({ mutate: mocks.refinementAction, isPending: false }),
  useRefinementReconnect: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendRefinementMessage: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/refinement/hooks/useRefinementStream', () => ({ useRefinementStream: mocks.refinementStream }))
vi.mock('@/features/refinement/components/RefinementRequests', () => ({ RefinementRequests: () => <div data-testid="refinement-requests">perguntas do refinamento</div> }))

import { WorkbenchView } from '@/features/agentic/components/workbench/WorkbenchView'
import type { CentralDto, WorkbenchDto } from '@/features/agentic/types'

const workbench = (patch: Partial<WorkbenchDto> = {}) =>
  ({ id: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'OPE-1', taskTitle: 'Tarefa', stage: 'refining', runState: 'running', plans: [], agenticFlow: 'preview', refinementPhase: true, planAfterRefinement: false, slotQueue: null, models: null, adversarial: false, ...patch }) as unknown as WorkbenchDto
const central = { id: 'c1' } as unknown as CentralDto

const refinementState = (patch: Record<string, unknown> = {}) => ({
  data: {
    refinement: { id: 'r1', runState: 'running', resolved: false, closed: false, concluded: false, queued: false, finalizing: false, sessionId: 's1', error: null, pendingForms: [{ id: 'f1' }], pendingPermissions: [], liveChat: false, stoppedByUser: false, turnStartedAt: null, ...patch },
    availability: { available: true, reason: null, centralId: 'c1', sessionDirectory: '/repo' },
    workbench: { id: 'w1', stage: 'refining' },
    refinerModel: null,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.refinement.mockReturnValue(refinementState())
  mocks.refinementStream.mockReturnValue({ timeline: { items: [] }, connected: true })
  mocks.workbenchStream.mockReturnValue({ timeline: { items: [] }, connected: true })
})

describe('WorkbenchView · mesa em Refinando', () => {
  it('mostra o passo Refinamento, as abas Descrição/Especificação/Saída da IA e a saída do refinamento', () => {
    render(<WorkbenchView workbench={workbench()} central={central} />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Descrição', 'Especificação', 'Saída da IA'])
    const steps = screen.getByRole('list', { name: 'Etapas da mesa' })
    expect(steps.textContent).toContain('Refinamento')
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toContain('Refinamento')
    expect(mocks.refinementStream).toHaveBeenCalledWith('t1')
    expect(mocks.workbenchStream).not.toHaveBeenCalled()
    expect(screen.queryByText('barra da mesa')).toBeNull()
  })

  it('as perguntas do agente ficam abaixo da saída e a barra traz Encerrar refinamento', () => {
    render(<WorkbenchView workbench={workbench()} central={central} />)
    const timeline = screen.getByTestId('timeline')
    const requests = screen.getByTestId('refinement-requests')
    expect(timeline.compareDocumentPosition(requests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }))
    expect(mocks.refinementAction).toHaveBeenCalledWith('interrupt')
    expect(screen.getByRole('button', { name: /Encerrar refinamento/ })).toBeTruthy()
    expect(screen.getByLabelText('Gerar plano após refinar')).toBeTruthy()
  })

  it('a aba Especificação mostra a especificação técnica da tarefa', () => {
    render(<WorkbenchView workbench={workbench()} central={central} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Especificação' }))
    expect(screen.getByText('Critérios da spec')).toBeTruthy()
  })
})

describe('WorkbenchView · mesa em Especificação pronta', () => {
  it('abre na Especificação, sem perguntas, com Gerar plano e Continuar refinamento', () => {
    mocks.refinement.mockReturnValue(refinementState({ runState: 'idle', resolved: true, concluded: true, pendingForms: [] }))
    render(<WorkbenchView workbench={workbench({ stage: 'spec_ready', runState: 'idle' })} central={central} />)
    expect(screen.getByRole('tab', { name: 'Especificação', selected: true })).toBeTruthy()
    expect(screen.getByText('Critérios da spec')).toBeTruthy()
    expect(screen.queryByTestId('refinement-requests')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Continuar refinamento/ }))
    expect(mocks.workbenchAction).toHaveBeenCalledWith({ action: 'continue-refinement' })
    fireEvent.click(screen.getByRole('button', { name: /Gerar plano/ }))
    expect(mocks.workbenchAction).toHaveBeenCalledWith({ action: 'generate-plan', text: undefined }, expect.anything())
  })

  it('ao concluir em Refinando, a visão troca sozinha para a Especificação', () => {
    const { rerender } = render(<WorkbenchView workbench={workbench()} central={central} />)
    expect(screen.getByRole('tab', { name: 'Saída da IA', selected: true })).toBeTruthy()
    mocks.refinement.mockReturnValue(refinementState({ runState: 'idle', resolved: true, concluded: true, pendingForms: [] }))
    rerender(<WorkbenchView workbench={workbench({ stage: 'spec_ready', runState: 'idle' })} central={central} />)
    expect(screen.getByRole('tab', { name: 'Especificação', selected: true })).toBeTruthy()
  })
})

describe('WorkbenchView · depois do refinamento', () => {
  it('no planejamento volta à mesa de sempre (saída da mesa e a barra da mesa)', () => {
    render(<WorkbenchView workbench={workbench({ stage: 'planning' })} central={central} />)
    expect(mocks.workbenchStream).toHaveBeenCalledWith('w1')
    expect(mocks.refinementStream).not.toHaveBeenCalled()
    expect(screen.getByText('barra da mesa')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Encerrar refinamento/ })).toBeNull()
  })
})
