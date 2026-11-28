/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { RoutineCostDto, RoutineRunDetailDto } from '@/features/routine-agents/types'

/**
 * Página de uma execução de agente rotineiro (OPE-208: substituiu a gaveta `?execucao=`): voltar para a aba
 * Execuções, dados, passos, Confirmar/Recusar, Cancelar com confirmação, carregar, erro, não encontrada e a
 * execução de outro agente.
 */

const mocks = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  cancel: vi.fn(),
  resolve: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/features/routine-agents/hooks/useRoutineRealtime', () => ({ useRoutineRealtime: () => {} }))
vi.mock('@/features/routine-agents/hooks/useRoutineRuns', () => ({
  useRoutineRun: () => mocks.query,
  useCancelRoutineRun: () => ({ mutate: mocks.cancel, isPending: false }),
  useResolveRoutineAction: () => ({ mutate: mocks.resolve, isPending: false }),
}))

import { RoutineRunPage } from '@/features/routine-agents/components/runs/RoutineRunPage'
import { routineRunPath, routineRunsHref } from '@/features/routine-agents/constants'

const cost: RoutineCostDto = { listUsd: 4, listBrl: 20, effectiveUsd: 1, effectiveBrl: 5, savingsUsd: 3, savingsBrl: 15, partial: false, brlPartial: false, missingPrices: [], estimated: false, notices: [] }

const run = (extra: Partial<RoutineRunDetailDto> = {}): RoutineRunDetailDto => ({
  id: 'r1', agentId: 'a1', agentName: 'Indexador', seq: 7, status: 'running', origin: 'manual', request: 'Reindexar tudo', hasPayload: false, engine: 'opex', model: 'deepseek-flash',
  queuedAt: '2026-11-27T15:00:00.000Z', startedAt: '2026-11-27T15:00:01.000Z', finishedAt: null, activeMs: 4000, waitingMs: 0, tokens: 1200, costUsd: null, costPartial: false,
  cost, hibernation: null, pendingAction: null, report: '## Feito\nTudo certo.', error: null, warnings: ['Um aviso'], delayMs: null,
  steps: [{ id: 's1', kind: 'tool', label: 'Buscou as vagas', detail: null, toolName: 'http_request', durationMs: 300, error: false, at: '2026-11-27T15:00:02.000Z' }],
  tools: [{ name: 'http_request', count: 2 }],
  costByModel: [],
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = { data: run(), isLoading: false, isError: false, error: null, refetch: vi.fn() }
})
afterEach(cleanup)

describe('página da execução', () => {
  it('caminhos: a página e o voltar para a aba Execuções', () => {
    expect(routineRunPath('a1', 'r1')).toBe('/agentes-rotineiros/a1/execucoes/r1')
    expect(routineRunsHref('a1')).toBe('/agentes-rotineiros/a1?aba=execucoes')
  })

  it('cabeçalho com voltar, título, status e descrição; conteúdo e resumo nas duas colunas', () => {
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    expect(screen.getByRole('heading', { name: 'Execução #7' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar para as execuções' }).getAttribute('href')).toBe('/agentes-rotineiros/a1?aba=execucoes')
    expect(screen.getByText('Indexador · Manual · motor Opex · deepseek-flash', { exact: false })).toBeTruthy()
    const main = screen.getByTestId('routine-run-main')
    expect(main.textContent).toContain('Reindexar tudo')
    expect(main.textContent).toContain('Tudo certo.')
    expect(main.textContent).toContain('Buscou as vagas')
    const aside = screen.getByTestId('routine-run-aside')
    for (const label of ['Início', 'Duração ativa', 'Tokens', 'Custo de tabela', 'Custo efetivo', 'Economia', 'Ferramentas usadas']) expect(aside.textContent).toContain(label)
    expect(aside.textContent).toContain('Um aviso')
    expect(aside.textContent).toContain('http_request × 2')
  })

  it('ação pendente: Confirmar e Recusar respondem a execução', () => {
    mocks.query.data = run({ status: 'awaiting_confirmation', pendingAction: { id: 'p1', summary: 'Apagar a planilha', kind: 'tool', toolLabel: 'Apagar', input: null, requestedAt: '2026-11-27T15:01:00.000Z', resolvedAt: null, resolution: null } })
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    expect(mocks.resolve).toHaveBeenCalledWith({ runId: 'r1', decision: 'confirm' })
    fireEvent.click(screen.getByRole('button', { name: /Recusar/ }))
    expect(mocks.resolve).toHaveBeenCalledWith({ runId: 'r1', decision: 'reject' })
  })

  it('Cancelar pede confirmação antes de cancelar; execução encerrada n\u00e3o mostra o bot\u00e3o', () => {
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar execução' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(screen.getByText('Cancelar esta execução?')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: 'Cancelar execução' })
    fireEvent.click(buttons[buttons.length - 1]!)
    expect(mocks.cancel).toHaveBeenCalledWith('r1', expect.anything())
    cleanup()
    mocks.query.data = run({ status: 'completed' })
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    expect(screen.queryByRole('button', { name: 'Cancelar execução' })).toBeNull()
  })

  it('carregando: skeleton com a grade da página', () => {
    mocks.query = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    expect(screen.getByTestId('routine-run-page-skeleton')).toBeTruthy()
  })

  it('erro: Tentar novamente refaz a consulta', () => {
    const refetch = vi.fn()
    mocks.query = { data: undefined, isLoading: false, isError: true, error: new Error('falhou'), refetch }
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    expect(screen.getByText('Não foi possível carregar a execução')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(refetch).toHaveBeenCalled()
  })

  it('execução inexistente: estado vazio com o caminho de volta para as execuções', () => {
    const error = new AxiosError('404', '404', undefined, undefined, { status: 404, statusText: 'Not Found', headers: {}, config: { headers: new AxiosHeaders() }, data: { success: false, error: 'Execução não encontrada', code: 'ROUTINE_RUN_NOT_FOUND' } })
    mocks.query = { data: undefined, isLoading: false, isError: true, error, refetch: vi.fn() }
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    expect(screen.getByText('Execução não encontrada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver as execuções do agente' }))
    expect(mocks.push).toHaveBeenCalledWith('/agentes-rotineiros/a1?aba=execucoes')
  })

  it('execução de outro agente: troca o endereço para o agente dela', () => {
    mocks.query.data = run({ agentId: 'a2' })
    render(<RoutineRunPage agentId="a1" runId="r1" />)
    expect(mocks.replace).toHaveBeenCalledWith('/agentes-rotineiros/a2/execucoes/r1')
  })
})
