/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Barra da mesa no refinamento (OPE-137): Refinando e Especificação pronta. */

const mocks = vi.hoisted(() => ({ refinementAction: vi.fn(), workbenchAction: vi.fn(), setPlan: vi.fn(), reconnect: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/refinement/hooks/useRefinement', () => ({
  useRefinementAction: () => ({ mutate: mocks.refinementAction, isPending: false }),
  useRefinementReconnect: () => ({ mutateAsync: mocks.reconnect, isPending: false }),
  useSendRefinementMessage: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useWorkbenchAction: () => ({ mutate: mocks.workbenchAction, isPending: false }),
  useSetWorkbenchPlanAfterRefinement: () => ({ mutate: mocks.setPlan, isPending: false }),
  useSetWorkbenchModel: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/ai/hooks/useAi', () => ({ useAiModels: () => ({ data: [], isLoading: false, isError: false, error: null }) }))

import { RefinementActionBar } from '@/features/agentic/components/workbench/RefinementActionBar'
import type { WorkbenchDto } from '@/features/agentic/types'
import type { TaskRefinementStateDto } from '@/features/refinement/types'

const workbench = (patch: Partial<WorkbenchDto>): WorkbenchDto => ({
  id: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'GO-DEV-1',
  taskTitle: 'Tarefa',
  stage: 'plan_review',
  runState: 'idle',
  error: null,
  sessionId: 's1',
  sessionDirectory: '/repo',
  branch: null,
  worktreePath: null,
  port: null,
  previewUrl: null,
  previewHealthy: null,
  agenticFlow: 'preview',
  buildQueuePosition: null,
  slotQueue: null,
  plans: [],
  pr: null,
  pendingPermissions: [],
  pendingForms: [],
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  lastStage: null,
  liveChat: false,
  adversarial: false,
  turnStartedAt: null,
  stoppedByUser: false,
  reconnect: null,
  startedAt: '2026-10-09T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-10-09T12:00:00.000Z',
    stage: 'refining',
  runState: 'running',
  refinementPhase: true,
  planAfterRefinement: false,
  ...patch,
} as WorkbenchDto)

const refinement = (patch: Record<string, unknown> = {}) => ({
  id: 'r1', taskId: 't1', taskCode: 'GO-DEV-1', taskTitle: 'Tarefa', projectId: 'p1', centralId: 'c1', sessionId: 's1', sessionDirectory: '/repo',
  runState: 'running', resolved: false, closed: false, concluded: false, queued: false, finalizing: false, error: null, spec: null,
  pendingForms: [], pendingPermissions: [], usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  turnStartedAt: null, stoppedByUser: false, reconnect: null, liveChat: false, startedAt: '', updatedAt: '', ...patch,
})

const state = (patch: Record<string, unknown> = {}, availability = { available: true, reason: null as string | null }): TaskRefinementStateDto =>
  ({ refinement: refinement(patch), availability: { ...availability, centralId: 'c1', sessionDirectory: '/repo' }, workbench: { id: 'w1', stage: 'refining' }, refinerModel: null }) as TaskRefinementStateDto

beforeEach(() => vi.clearAllMocks())

describe('RefinementActionBar · Refinando', () => {
  it('com o agente rodando: Parar, Recomeçar, Encerrar refinamento e o switch Gerar plano após refinar', () => {
    render(<RefinementActionBar workbench={workbench({})} state={state()} />)
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }))
    expect(mocks.refinementAction).toHaveBeenCalledWith('interrupt')
    expect(screen.getByRole('button', { name: /Encerrar refinamento/ })).toBeTruthy()
    expect(screen.getByLabelText('Gerar plano após refinar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Gerar plano$/ })).toBeNull()
  })

  it('parado: Continuar e Reconectar (com sessão)', () => {
    render(<RefinementActionBar workbench={workbench({ runState: 'interrupted' })} state={state({ runState: 'interrupted', stoppedByUser: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(mocks.refinementAction).toHaveBeenCalledWith('continue')
    expect(screen.getByRole('button', { name: /Reconectar/ })).toBeTruthy()
  })

  it('Encerrar refinamento pede a confirmação com o texto aprovado', () => {
    render(<RefinementActionBar workbench={workbench({})} state={state()} />)
    fireEvent.click(screen.getByRole('button', { name: /Encerrar refinamento/ }))
    expect(screen.getByText('Encerrar o refinamento? O agente para e a especificação já salva é mantida. Você pode refinar de novo depois.')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Encerrar refinamento' }).at(-1)!)
    expect(mocks.refinementAction).toHaveBeenCalledWith('close')
  })

  it('o switch Gerar plano após refinar grava na mesa', () => {
    render(<RefinementActionBar workbench={workbench({})} state={state()} />)
    fireEvent.click(screen.getByLabelText('Gerar plano após refinar'))
    expect(mocks.setPlan).toHaveBeenCalledWith(true)
  })
})

describe('RefinementActionBar · Especificação pronta', () => {
  const ready = () => workbench({ stage: 'spec_ready', runState: 'idle' })

  it('Gerar plano envia as informações adicionais ao planejador', () => {
    render(<RefinementActionBar workbench={ready()} state={state({ runState: 'idle', resolved: true, concluded: true })} />)
    fireEvent.change(screen.getByLabelText('Informações adicionais (opcional)'), { target: { value: 'use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Gerar plano/ }))
    expect(mocks.workbenchAction).toHaveBeenCalledWith({ action: 'generate-plan', text: 'use o componente X' }, expect.anything())
    expect(screen.queryByLabelText('Gerar plano após refinar')).toBeNull()
  })

  it('Continuar refinamento e Recomeçar passam pela mesa', () => {
    render(<RefinementActionBar workbench={ready()} state={state({ runState: 'idle', resolved: true, concluded: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar refinamento/ }))
    expect(mocks.workbenchAction).toHaveBeenCalledWith({ action: 'continue-refinement' })
    fireEvent.click(screen.getByRole('button', { name: /Recomeçar/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Recomeçar' }).at(-1)!)
    expect(mocks.workbenchAction).toHaveBeenCalledWith({ action: 'restart-refinement' })
  })

  it('Agente Refinador indisponível bloqueia Continuar e Recomeçar; Gerar plano continua disponível', () => {
    render(<RefinementActionBar workbench={ready()} state={state({ runState: 'idle', resolved: true, concluded: true }, { available: false, reason: 'OpenCode não está conectado' })} />)
    expect((screen.getByRole('button', { name: /Continuar refinamento/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Recomeçar/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Gerar plano/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('aguardando vaga: mostra a espera e só permite cancelar', () => {
    render(<RefinementActionBar workbench={workbench({ stage: 'spec_ready', runState: 'idle', slotQueue: { position: 1, action: 'continue-refinement' } })} state={state({ runState: 'idle', concluded: true })} />)
    expect(screen.getByText(/Aguardando vaga na central — posição #1: Continuar o refinamento/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Cancelar espera/ }))
    expect(mocks.workbenchAction).toHaveBeenCalledWith({ action: 'cancel-wait' })
    expect(screen.queryByRole('button', { name: /Gerar plano/ })).toBeNull()
  })
})
