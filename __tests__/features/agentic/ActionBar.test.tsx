/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), reconnect: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useWorkbenchAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useWorkbenchReconnect: () => ({ mutateAsync: mocks.reconnect, isPending: false }),
}))

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
  turnStartedAt: null,
  stoppedByUser: false,
  reconnect: null,
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

  it('prévia pronta: ações numa única linha no celular, com abrir prévia só pelo ícone', () => {
    render(<ActionBar workbench={workbench({ stage: 'preview', previewUrl: 'http://localhost:4001' })} />)
    const link = screen.getByRole('link', { name: /Abrir em nova guia/ })
    // O texto do link some no celular (fica só o ícone), preservando o nome acessível.
    expect(link.querySelector('.max-md\\:hidden')).toBeTruthy()
    const row = link.closest('div')!
    expect(row.className).toContain('max-md:flex-nowrap')
    expect(row.className).toContain('max-md:overflow-x-auto')
    // Rótulo completo (acessível) e compacto (celular) para o botão de aprovar o PR.
    const approve = screen.getByRole('button', { name: /Aprovar e abrir PR/ })
    expect(approve.textContent).toContain('Aprovar PR')
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

  it('mesa falha com sessão oferece Reconectar (sem reenviar) ao lado de Tentar novamente', () => {
    mocks.reconnect.mockResolvedValue({ runState: 'running', reconnect: { outcome: 'attached', message: null, at: '2026-10-09T12:00:00.000Z' } })
    render(<ActionBar workbench={workbench({ stage: 'planning', runState: 'interrupted', error: 'Conexão perdida' })} />)
    fireEvent.click(screen.getByRole('button', { name: /Reconect/ }))
    expect(mocks.reconnect).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy()
  })

  it('mesa falha sem sessão não oferece Reconectar', () => {
    render(<ActionBar workbench={workbench({ stage: 'planning', runState: 'interrupted', sessionId: null })} />)
    expect(screen.queryByRole('button', { name: /Reconectar ao agente/ })).toBeNull()
  })
})
