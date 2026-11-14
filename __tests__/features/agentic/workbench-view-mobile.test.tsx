/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Mesa montada inteira (WorkbenchView + ActionBar + pedidos reais) no celular (OPE-166, opção B do dono,
 * tudo abaixo de `lg`): garante a ligação entre as peças — a faixa de pedidos some no celular, a folha
 * "Pedidos do agente" abre com pedido novo e o "Excluir mesa" da folha recebe a central e confirma.
 */

const mocks = vi.hoisted(() => ({ remove: vi.fn(), replyPermission: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskDetail: () => ({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }) }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  usePrWatchSchedule: () => ({ data: undefined }),
  useWorkbenchAction: () => ({ mutate: vi.fn(), isPending: false }),
  useWorkbenchReconnect: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetWorkbenchModel: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchPreview: () => ({ mutate: vi.fn(), isPending: false }),
  useSendWorkbenchLiveMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useReplyPermission: () => ({ mutate: mocks.replyPermission, isPending: false }),
  useReplyForm: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkbenchStage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWorkbench: () => ({ mutate: mocks.remove, isPending: false }),
}))
vi.mock('@/features/agentic/hooks/useForks', () => ({ useWorkbenchForks: () => ({ data: [] }), useOpenFork: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/agentic/hooks/useBuilds', () => ({ useWorkbenchBuilds: () => ({ data: [] }) }))
vi.mock('@/features/agentic/hooks/useWorkbenchStream', () => ({ useWorkbenchStream: () => ({ timeline: { items: [] }, connected: true }) }))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [], isLoading: false, isError: false, error: null }) }))
vi.mock('@/features/agentic/components/workbench/WorkbenchHeader', () => ({ WorkbenchHeader: () => null }))
vi.mock('@/features/agentic/components/workbench/StageSteps', () => ({ StageSteps: () => null }))
vi.mock('@/features/agentic/components/workbench/Timeline', () => ({ Timeline: () => <p>saída ao vivo</p> }))
vi.mock('@/features/agentic/components/workbench/ForksDonePrompt', () => ({ ForksDonePrompt: () => null }))
vi.mock('@/features/adversarial-agent/components/workbench/AdversarialActions', () => ({ AdversarialActions: () => null }))
vi.mock('@/features/adversarial-agent/components/workbench/AdversarialRoundsView', () => ({
  useAdversarialTab: () => ({ visible: false, count: 0 }),
  AdversarialTabNavProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AdversarialRoundsView: () => null,
}))
vi.mock('@/features/architect-agent/components/workbench/ArchitectTab', () => ({ useArchitectTab: () => ({ visible: false, count: 0 }), ArchitectTab: () => null }))
vi.mock('@/features/adversarial-agent/components/workbench/MentorLearningTab', () => ({ useMentorLearningTab: () => ({ visible: false, count: 0 }), MentorLearningTab: () => null }))

import { WorkbenchView } from '@/features/agentic/components/workbench/WorkbenchView'
import { WorkbenchUploadsProvider } from '@/features/agentic/hooks/useWorkbenchFiles'
import { COMPACT_WORKBENCH_QUERY } from '@/features/agentic/hooks/useCompactWorkbench'
import type { CentralDto, WorkbenchDto } from '@/features/agentic/types'

const workbench = (patch: Partial<WorkbenchDto> = {}) =>
  ({
    id: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'OPE-166', taskTitle: 'Mesa no celular', stage: 'implementing', runState: 'running', error: null, sessionId: 's1',
    plans: [], agenticFlow: 'preview', previewUrl: null, pr: null, slotQueue: null, pendingPermissions: [], pendingForms: [], liveChat: false, deletionRequestedAt: null,
    turnStartedAt: null, startedAt: '2026-11-14T12:00:00.000Z', stoppedByUser: false, models: null, ...patch,
  }) as unknown as WorkbenchDto
const central = { id: 'c1', projectName: 'opex' } as unknown as CentralDto
const permission = { id: 'p1', action: 'bash', resources: ['pnpm test'], message: null }

function mockCompact(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({ matches: matches && query === COMPACT_WORKBENCH_QUERY, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
}

const view = (value: WorkbenchDto) => (
  <WorkbenchUploadsProvider>
    <WorkbenchView workbench={value} central={central} />
  </WorkbenchUploadsProvider>
)

beforeEach(() => vi.clearAllMocks())
afterEach(() => mockCompact(false))

describe('WorkbenchView no celular (OPE-166)', () => {
  it('sem faixa de pedidos abaixo da saída: pedido novo abre a folha "Pedidos do agente" (um cartão só)', () => {
    mockCompact(true)
    const { rerender } = render(view(workbench()))
    act(() => rerender(view(workbench({ pendingPermissions: [permission] }))))
    // O cartão existe uma vez só (na folha), não também na faixa abaixo da saída.
    expect(screen.getAllByRole('alertdialog', { name: 'Pedido de permissão do agente', hidden: true })).toHaveLength(1)
    const requests = within(screen.getByRole('dialog', { name: 'Pedidos do agente' }))
    fireEvent.click(requests.getByRole('button', { name: 'Aprovar uma vez' }))
    expect(mocks.replyPermission).toHaveBeenCalledWith({ requestId: 'p1', decision: 'once' })
  })

  it('"Excluir mesa" da folha "Mais ações" abre a confirmação com a central da mesa', () => {
    mockCompact(true)
    render(view(workbench({ stage: 'plan_review', runState: 'idle' })))
    fireEvent.click(within(screen.getByTestId('mobile-action-dock')).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Mais ações' })).getByRole('button', { name: 'Excluir mesa' }))
    expect(screen.getByText(/conforme as configurações da central de opex/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir mesa' }))
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })

  it('desktop: os pedidos continuam na faixa abaixo da saída, sem dock nem folha', () => {
    mockCompact(false)
    render(view(workbench({ pendingPermissions: [permission] })))
    expect(screen.getByRole('alertdialog', { name: 'Pedido de permissão do agente' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Pedidos do agente' })).toBeNull()
    expect(screen.queryByTestId('mobile-action-dock')).toBeNull()
  })
})
