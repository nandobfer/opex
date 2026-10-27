/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ useTaskDetail: vi.fn(), forks: [] as { id: string }[], refetch: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/lib/api', () => ({ apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('@/components/agent-reply/ReplyTargetProvider', () => ({ ReplyTargetProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskDetail: mocks.useTaskDetail }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ usePrWatchSchedule: () => ({ data: undefined }) }))
vi.mock('@/features/agentic/hooks/useForks', () => ({ useWorkbenchForks: () => ({ data: mocks.forks }) }))
vi.mock('@/features/agentic/hooks/useWorkbenchStream', () => ({ useWorkbenchStream: () => ({ timeline: { items: [] }, connected: true }) }))
vi.mock('@/features/agentic/components/workbench/WorkbenchHeader', () => ({ WorkbenchHeader: () => null }))
vi.mock('@/features/agentic/components/workbench/StageSteps', () => ({ StageSteps: () => null }))
vi.mock('@/features/agentic/components/workbench/Timeline', () => ({ Timeline: () => <p>saída ao vivo</p> }))
vi.mock('@/features/agentic/components/workbench/PlanView', () => ({ PlanView: () => <p>plano</p> }))
vi.mock('@/features/agentic/components/workbench/ForkView', () => ({ ForkView: () => <p>forks</p> }))
vi.mock('@/features/agentic/components/workbench/PendingRequests', () => ({ PendingRequests: () => null }))
vi.mock('@/features/agentic/components/workbench/ForksDonePrompt', () => ({ ForksDonePrompt: () => null }))
vi.mock('@/features/agentic/components/workbench/ActionBar', () => ({ ActionBar: () => null }))

import { WorkbenchView } from '@/features/agentic/components/workbench/WorkbenchView'
import type { CentralDto, WorkbenchDto } from '@/features/agentic/types'

const workbench = (patch: Partial<WorkbenchDto> = {}) =>
  ({ id: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'MT-5', taskTitle: 'Abas', stage: 'planning', runState: 'idle', plans: [], agenticFlow: 'preview', ...patch }) as unknown as WorkbenchDto
const central = { id: 'c1' } as unknown as CentralDto

const taskQuery = (patch: Record<string, unknown> = {}) => ({
  data: { id: 't1', description: 'Texto da **descrição**', technicalSpec: 'Critérios da spec' },
  isLoading: false,
  isError: false,
  error: null,
  refetch: mocks.refetch,
  ...patch,
})

const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent)
const tab = (name: string) => screen.getByRole('tab', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.forks = []
  mocks.useTaskDetail.mockReturnValue(taskQuery())
})

describe('WorkbenchView — abas Descrição e Spec.', () => {
  it('mostra Descrição e Spec. antes da Saída da IA e abre na saída', () => {
    render(<WorkbenchView workbench={workbench()} central={central} />)
    expect(tabNames()).toEqual(['Descrição', 'Spec.', 'Saída da IA', 'Plano'])
    expect(tab('Saída da IA').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('saída ao vivo')).toBeTruthy()
    expect(mocks.useTaskDetail).toHaveBeenCalledWith('t1')
  })

  it('a aba Descrição exibe a descrição da tarefa', () => {
    render(<WorkbenchView workbench={workbench()} central={central} />)
    fireEvent.click(tab('Descrição'))
    expect(tab('Descrição').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('descrição')).toBeTruthy()
    expect(screen.queryByText('Critérios da spec')).toBeNull()
  })

  it('a aba Spec. exibe a especificação técnica', () => {
    render(<WorkbenchView workbench={workbench()} central={central} />)
    fireEvent.click(tab('Spec.'))
    expect(screen.getByText('Critérios da spec')).toBeTruthy()
  })

  it('sem especificação mostra o estado vazio com o atalho para a tarefa', () => {
    mocks.useTaskDetail.mockReturnValue(taskQuery({ data: { id: 't1', description: 'x', technicalSpec: null } }))
    render(<WorkbenchView workbench={workbench()} central={central} />)
    fireEvent.click(tab('Spec.'))
    expect(screen.getByText('Sem especificação técnica.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Abrir a tarefa' }).getAttribute('href')).toBe('/tarefas/t1')
  })

  it('erro ao carregar a tarefa permite tentar novamente', () => {
    mocks.useTaskDetail.mockReturnValue(taskQuery({ data: undefined, isError: true }))
    render(<WorkbenchView workbench={workbench()} central={central} />)
    fireEvent.click(tab('Descrição'))
    expect(screen.getByText('Não foi possível carregar a tarefa')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('mantém as abas existentes: Plano desabilitado sem planos e Forks só com forks', () => {
    mocks.forks = [{ id: 'f1' }]
    render(<WorkbenchView workbench={workbench({ plans: [{ version: 1, text: 'p', feedback: null, createdAt: '2026-01-01T00:00:00.000Z' }] as WorkbenchDto['plans'] })} central={central} />)
    expect(tabNames()).toEqual(['Descrição', 'Spec.', 'Saída da IA', 'Plano v1', 'Forks (1)'])
    fireEvent.click(tab('Plano v1'))
    expect(screen.getByText('plano')).toBeTruthy()
    fireEvent.click(tab('Forks (1)'))
    expect(screen.getByText('forks')).toBeTruthy()
  })
})
