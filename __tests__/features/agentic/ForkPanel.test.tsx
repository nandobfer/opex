/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), discard: vi.fn(), openFork: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useForks', () => ({
  useForkAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useDiscardFork: () => ({ mutate: mocks.discard, isPending: false }),
  useOpenFork: () => ({ mutate: mocks.openFork, isPending: false }),
}))

import { ForkActionBar } from '@/features/agentic/components/workbench/ForkActionBar'
import { ForkIntegration } from '@/features/agentic/components/workbench/ForkIntegration'
import type { ForkDto, WorkbenchDto } from '@/features/agentic/types'

const fork = (patch: Partial<ForkDto> = {}): ForkDto => ({
  id: 'f1',
  workbenchId: 'w1',
  number: 1,
  parentForkId: null,
  parentNumber: null,
  status: 'active',
  runState: 'idle',
  error: null,
  origin: 'fork',
  forkedFromStage: 'plan_review',
  summary: null,
  integration: null,
  pendingPermissions: [],
  pendingForms: [],
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  createdAt: '2026-10-16T12:00:00.000Z',
  updatedAt: '2026-10-16T12:00:00.000Z',
  closedAt: null,
  ...patch,
})

const workbench = (patch: Partial<WorkbenchDto> = {}) => ({ id: 'w1', stage: 'plan_review', runState: 'idle', sessionId: 's1', slotQueue: null, ...patch }) as WorkbenchDto

beforeEach(() => vi.clearAllMocks())

describe('ForkActionBar', () => {
  it('ativo: envia a mensagem e encerra o fork', () => {
    render(<ForkActionBar workbenchId="w1" fork={fork()} />)
    fireEvent.change(screen.getByLabelText('Mensagem para o fork'), { target: { value: 'e o Y?' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'send', text: 'e o Y?' }, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /Encerrar fork/ }))
    expect(mocks.mutate).toHaveBeenLastCalledWith({ action: 'close' })
  })

  it('encerrado: retomar, integrar e descartar (com confirmação)', () => {
    render(<ForkActionBar workbenchId="w1" fork={fork({ status: 'closed' })} />)
    expect(screen.getByRole('button', { name: /Retomar conversa/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Integrar fork/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'integrate' })
    fireEvent.click(screen.getByRole('button', { name: /Descartar fork/ }))
    expect(mocks.discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Descartar$/ }))
    expect(mocks.discard).toHaveBeenCalled()
  })

  it('integrado: sem ações (histórico somente leitura, sem Abrir fork)', () => {
    const { container } = render(<ForkActionBar workbenchId="w1" fork={fork({ status: 'integrated' })} />)
    expect(container.innerHTML).toBe('')
  })

  it.each(['active', 'closed', 'integrating'] as const)('fork %s oferece Abrir fork', (status) => {
    render(<ForkActionBar workbenchId="w1" fork={fork({ status, summary: status === 'integrating' ? 'R' : null })} />)
    expect(screen.getByRole('button', { name: /Abrir fork/ })).toBeTruthy()
  })

  it('Abrir fork a partir do fork envia o fork pai e seleciona o filho', () => {
    const onForkOpened = vi.fn()
    mocks.openFork.mockImplementation((_input: unknown, options: { onSuccess: (fork: { id: string }) => void }) => options.onSuccess({ id: 'f2' }))
    render(<ForkActionBar workbenchId="w1" fork={fork({ status: 'closed' })} onForkOpened={onForkOpened} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir fork/ }))
    fireEvent.change(screen.getByLabelText(/O que você quer perguntar ou investigar no fork/), { target: { value: 'E o Y?' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Abrir fork/ }).at(-1)!)
    expect(mocks.openFork).toHaveBeenCalledWith({ text: 'E o Y?', parentForkId: 'f1' }, expect.anything())
    expect(onForkOpened).toHaveBeenCalledWith({ id: 'f2' })
  })
})

describe('ForkIntegration', () => {
  it('resumo longo rola separado dos destinos e das ações', () => {
    render(<ForkIntegration workbench={workbench()} fork={fork({ status: 'integrating', summary: '# Decisões\n\n' + 'Um resumo extenso.\n\n'.repeat(100) + '```ts\nconst x = 1\n```\n\n| Campo | Valor |\n| --- | --- |\n| A | B |' })} />)
    const summary = screen.getByRole('region', { name: 'Resumo da integração' })
    expect(summary.classList.contains('overflow-auto')).toBe(true)
    expect(summary.querySelector('table')).toBeTruthy()
    expect(summary.querySelector('pre')).toBeTruthy()
    expect(summary.contains(screen.getByRole('button', { name: /^Integrar$/ }))).toBe(false)
    expect(summary.contains(screen.getByRole('radiogroup', { name: 'Integrar em' }))).toBe(false)
    expect(screen.getByText(/Reabrir a mesa: Disponível só/)).toBeTruthy()
  })

  it('mostra o resumo e adiciona ao destino escolhido', () => {
    render(<ForkIntegration workbench={workbench()} fork={fork({ status: 'integrating', summary: 'Usar o serviço X' })} />)
    expect(screen.getByText('Usar o serviço X')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Enviar ao planejador/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Integrar$/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'apply', target: 'planner' })
  })

  it('modificar envia o ajuste ao agente', () => {
    render(<ForkIntegration workbench={workbench()} fork={fork({ status: 'integrating', summary: 'Usar o serviço X' })} />)
    fireEvent.click(screen.getByRole('button', { name: /Modificar/ }))
    fireEvent.change(screen.getByLabelText('O que mudar no resumo?'), { target: { value: 'Inclua o Y' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar ajuste/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'revise-summary', text: 'Inclua o Y' }, expect.anything())
  })

  it('mesa concluída: só reabrir, com confirmação', () => {
    render(<ForkIntegration workbench={workbench({ stage: 'done', sessionId: null })} fork={fork({ status: 'integrating', summary: 'Usar o serviço X' })} />)
    expect(screen.getByRole('radio', { name: /Enviar ao planejador/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^Integrar$/ }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Reabrir e planejar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'apply', target: 'reopen' })
  })

  it('consolidando: aguarda o resumo do agente', () => {
    render(<ForkIntegration workbench={workbench()} fork={fork({ status: 'integrating', runState: 'running' })} />)
    expect(screen.getByText(/consolidando o resumo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Integrar$/ })).toBeNull()
  })

  it('fork de fork: destino "Fork pai" primeiro e selecionado por padrão', () => {
    render(<ForkIntegration workbench={workbench()} fork={fork({ status: 'integrating', summary: 'R', parentForkId: 'f0', parentNumber: 3 })} parent={{ number: 3, status: 'active' }} />)
    expect(screen.getByRole('radio', { name: /Fork pai \(Fork 3\)/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^Integrar$/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'apply', target: 'parent' })
  })
})
