/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useWorkbenchAction: () => ({ mutate: mocks.mutate, isPending: false }) }))

import { ActionBar } from '@/features/agentic/components/workbench/ActionBar'
import type { WorkbenchDto } from '@/features/agentic/types'

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
  plans: [],
  pr: null,
  pendingPermissions: [],
  pendingForms: [],
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  lastStage: null,
  startedAt: '2026-10-09T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-10-09T12:00:00.000Z',
  ...patch,
})

beforeEach(() => vi.clearAllMocks())

describe('ActionBar', () => {
  it('plano pronto: implementar ou pedir correção (texto vai ao planejador)', () => {
    render(<ActionBar workbench={workbench({})} />)
    fireEvent.click(screen.getByRole('button', { name: /Implementar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'implement', text: undefined }, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: /Solicitar correção do plano/ }))
    const field = screen.getByLabelText('O que precisa mudar no plano?')
    fireEvent.change(field, { target: { value: 'Use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar ao planejador/ }))
    expect(mocks.mutate).toHaveBeenLastCalledWith({ action: 'revise-plan', text: 'Use o componente X' }, expect.anything())
  })

  it('informações adicionais ao aprovar o plano vão no texto da ação implementar', () => {
    render(<ActionBar workbench={workbench({})} />)
    const field = screen.getByLabelText('Informações adicionais (opcional)')
    fireEvent.change(field, { target: { value: 'Use o componente X' } })
    fireEvent.click(screen.getByRole('button', { name: /Implementar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'implement', text: 'Use o componente X' }, expect.anything())
  })

  it('campo de informações adicionais só aparece na revisão do plano', () => {
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    expect(screen.queryByLabelText('Informações adicionais (opcional)')).toBeNull()
  })

  it('prévia pronta: abrir em nova guia, solicitar correção e aprovar', () => {
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    expect(screen.getByRole('link', { name: /Abrir em nova guia/ }).getAttribute('href')).toBe('http://localhost:4001')
    expect(screen.getByRole('button', { name: /Solicitar correção/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Aprovar e abrir PR/ })).toBeTruthy()
  })

  it('executando: só Parar; falha mostra o erro e Tentar novamente', () => {
    const { unmount } = render(<ActionBar workbench={workbench({ stage: 'implementing', runState: 'running' })} />)
    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Parar'])
    unmount()
    render(<ActionBar workbench={workbench({ stage: 'building', runState: 'failed', error: 'A prévia não respondeu' })} />)
    expect(screen.getByRole('alert').textContent).toContain('A prévia não respondeu')
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'retry', text: undefined }, expect.anything())
    expect(screen.getByRole('button', { name: /Voltar ao planejamento/ })).toBeTruthy()
  })

  it('PR com mudanças sem motivo já abre o campo de texto', () => {
    render(<ActionBar workbench={workbench({ stage: 'changes_requested' })} />)
    expect(screen.getByLabelText('O que o PR pediu?')).toBeTruthy()
  })
})
