/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), discard: vi.fn(), openFork: vi.fn(), timeline: { items: [] as unknown[], reasoning: false, loaded: true } }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useForks', () => ({
  useForkAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useDiscardFork: () => ({ mutate: mocks.discard, isPending: false }),
  useOpenFork: () => ({ mutate: mocks.openFork, isPending: false }),
  useForkStream: () => ({ timeline: mocks.timeline }),
  useReplyForkPermission: () => ({ mutate: vi.fn(), isPending: false }),
  useReplyForkForm: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { ForkActionBar } from '@/features/agentic/components/workbench/ForkActionBar'
import { ForkPanel } from '@/features/agentic/components/workbench/ForkPanel'
import { ForkStatusBadge } from '@/features/agentic/components/workbench/ForkStatusBadge'
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

const forkPanel = (forkPatch: Partial<ForkDto>, options: { workbench?: Partial<WorkbenchDto>; parent?: { id: string | null; number: number; status: ForkDto['status'] | null } } = {}) =>
  render(<ForkPanel workbench={workbench(options.workbench)} fork={fork(forkPatch)} parent={options.parent ?? null} onSelectFork={vi.fn()} />)

/** Área rolável única do fork (a saída da IA). */
const scrollArea = () => document.querySelector('[aria-live="polite"]') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.timeline = { items: [{ kind: 'notice', key: 'n1', level: 'info', message: 'Conversa do fork' }], reasoning: false, loaded: true }
})

describe('ForkActionBar', () => {
  it('ativo: envia a mensagem e pausa a conversa', () => {
    render(<ForkActionBar workbenchId="w1" fork={fork()} />)
    fireEvent.change(screen.getByLabelText('Mensagem para o fork'), { target: { value: 'e o Y?' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'send', text: 'e o Y?' }, expect.anything())
    expect(screen.queryByRole('button', { name: /Encerrar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Pausar conversa/ }))
    expect(mocks.mutate).toHaveBeenLastCalledWith({ action: 'close' })
  })

  it('pausado: retomar, integrar e descartar (com confirmação)', () => {
    render(<ForkActionBar workbenchId="w1" fork={fork({ status: 'closed' })} />)
    expect(screen.getByText(/^Conversa pausada: retome a conversa/)).toBeTruthy()
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

describe('ForkStatusBadge', () => {
  it('conversa pausada aparece como Pausado', () => {
    render(<ForkStatusBadge status="closed" runState="idle" />)
    expect(screen.getByText('Pausado')).toBeTruthy()
    expect(screen.queryByText('Encerrado')).toBeNull()
  })
})

describe('ForkPanel', () => {
  it('integrando: resumo e destinos no fim da conversa, na mesma área rolável; botões na barra do fork', () => {
    forkPanel({ status: 'integrating', summary: '# Decisões\n\n' + 'Um resumo extenso.\n\n'.repeat(100) + '```ts\nconst x = 1\n```\n\n| Campo | Valor |\n| --- | --- |\n| A | B |' })
    const area = scrollArea()
    const summary = screen.getByRole('region', { name: 'Resumo da integração' })
    expect(area.contains(screen.getByText('Conversa do fork'))).toBe(true)
    expect(area.contains(summary)).toBe(true)
    expect(area.contains(screen.getByRole('radiogroup', { name: 'Integrar em' }))).toBe(true)
    // O resumo não tem rolagem própria: a área da conversa é a única.
    expect(summary.classList.contains('overflow-auto')).toBe(false)
    expect(summary.querySelector('table')).toBeTruthy()
    expect(summary.querySelector('pre')).toBeTruthy()
    const integrate = screen.getByRole('button', { name: /^Integrar$/ })
    expect(area.contains(integrate)).toBe(false)
    // Na barra inferior, ao lado do Abrir fork.
    expect(integrate.parentElement!.contains(screen.getByRole('button', { name: /Abrir fork/ }))).toBe(true)
    expect(screen.getByText(/Reabrir a mesa: Disponível só/)).toBeTruthy()
  })

  it('integrando: adiciona ao destino escolhido', () => {
    forkPanel({ status: 'integrating', summary: 'Usar o serviço X' })
    expect(screen.getByText('Usar o serviço X')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Enviar ao planejador/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Integrar$/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'apply', target: 'planner' })
  })

  it('modificar abre o ajuste no fim da conversa e Enviar ajuste vai na barra', () => {
    forkPanel({ status: 'integrating', summary: 'Usar o serviço X' })
    fireEvent.click(screen.getByRole('button', { name: /Modificar resumo/ }))
    const field = screen.getByLabelText('O que mudar no resumo?')
    expect(scrollArea().contains(field)).toBe(true)
    fireEvent.change(field, { target: { value: 'Inclua o Y' } })
    const send = screen.getByRole('button', { name: /Enviar ajuste/ })
    expect(scrollArea().contains(send)).toBe(false)
    fireEvent.click(send)
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'revise-summary', text: 'Inclua o Y' }, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.queryByLabelText('O que mudar no resumo?')).toBeNull()
  })

  it('cancelar integração pela barra do fork', () => {
    forkPanel({ status: 'integrating', summary: 'Usar o serviço X' })
    fireEvent.click(screen.getByRole('button', { name: /Cancelar integração/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'cancel-integration' })
  })

  it('mesa concluída: só reabrir, com confirmação', () => {
    forkPanel({ status: 'integrating', summary: 'Usar o serviço X' }, { workbench: { stage: 'done', sessionId: null } })
    expect(screen.getByRole('radio', { name: /Enviar ao planejador/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^Integrar$/ }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Reabrir e planejar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'apply', target: 'reopen' })
  })

  it('consolidando: aguarda o resumo do agente', () => {
    forkPanel({ status: 'integrating', runState: 'running' })
    expect(scrollArea().contains(screen.getByText(/consolidando o resumo/))).toBe(true)
    expect(screen.queryByRole('button', { name: /^Integrar$/ })).toBeNull()
  })

  it('fork de fork: destino "Fork pai" primeiro e selecionado por padrão', () => {
    forkPanel({ status: 'integrating', summary: 'R', parentForkId: 'f0', parentNumber: 3 }, { parent: { id: 'f0', number: 3, status: 'active' } })
    expect(screen.getByRole('radio', { name: /Fork pai \(Fork 3\)/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^Integrar$/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'apply', target: 'parent' })
  })

  it('integrado: o resumo aplicado é o último bloco da conversa', () => {
    forkPanel({ status: 'integrated', integration: { summary: 'Resumo aplicado', target: 'planner', appliedAt: '2026-10-16T13:00:00.000Z' } as ForkDto['integration'] })
    const integrated = screen.getByRole('region', { name: 'Resumo integrado' })
    expect(scrollArea().contains(integrated)).toBe(true)
    expect(integrated.textContent).toContain('Resumo aplicado')
  })

  it('concluído: aviso no fim da conversa', () => {
    forkPanel({ status: 'concluded', closedAt: '2026-10-16T13:00:00.000Z' })
    expect(scrollArea().contains(screen.getByText(/Fork concluído junto com a mesa/))).toBe(true)
  })
})
