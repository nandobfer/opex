/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { RoutineCostDto, RoutineRunDto } from '@/features/routine-agents/types'

/**
 * OPE-213: cada execução da aba Execuções é um card — situação com ícone, origem, tempos, pedido, início do relato,
 * avisos (erro, confirmação com "Responder", hibernação), consumo, motor e modelo; destaque das execuções em curso
 * (Executando e Esperando) e Cancelar só nos status não finais, com a confirmação vigente.
 */

const mocks = vi.hoisted(() => ({ runs: [] as unknown[], cancel: vi.fn(), reduced: true }))

vi.mock('framer-motion', () => ({ ...framerMotionMock(), useReducedMotion: () => mocks.reduced }))
vi.mock('@/features/routine-agents/hooks/useRoutineRuns', () => ({
  useRoutineRuns: () => ({ data: mocks.runs, isLoading: false, isError: false, refetch: vi.fn() }),
  useCancelRoutineRun: () => ({ mutate: mocks.cancel, isPending: false }),
}))

import { RoutineRunCard } from '@/features/routine-agents/components/runs/RoutineRunCard'
import { RoutineRunsTab } from '@/features/routine-agents/components/runs/RoutineRunsTab'
import { isLiveRun, reportExcerpt, runCardTimes } from '@/features/routine-agents/components/runs/run-card'
import { ROUTINE_RUN_STATUSES, ROUTINE_RUN_STATUS_LABELS, isFinalRunStatus } from '@/features/routine-agents/status'

const cost = (): RoutineCostDto => ({ listUsd: 4, listBrl: 20, effectiveUsd: 1, effectiveBrl: 5, savingsUsd: 3, savingsBrl: 15, partial: false, brlPartial: false, missingPrices: [], estimated: false, notices: [] })
const run = (extra: Partial<RoutineRunDto> = {}): RoutineRunDto => ({
  id: 'r1', agentId: 'a1', agentName: 'A', seq: 3, status: 'completed', origin: 'schedule', request: null, hasPayload: false, engine: 'opex', model: 'deepseek-flash',
  queuedAt: '2026-11-04T15:00:00.000Z', startedAt: '2026-11-04T15:01:00.000Z', finishedAt: '2026-11-04T15:11:00.000Z', activeMs: 600_000, waitingMs: 0, tokens: 1500, costUsd: null, costPartial: false,
  cost: cost(), hibernation: null, pendingAction: null, report: null, error: null, warnings: [], delayMs: null, ...extra,
})

beforeEach(() => {
  mocks.reduced = true
  mocks.runs = []
  mocks.cancel.mockReset()
})
afterEach(cleanup)

describe('card da execução (OPE-213)', () => {
  it('situação com rótulo e ícone em todos os status', () => {
    for (const status of ROUTINE_RUN_STATUSES) {
      const { container, unmount } = render(<RoutineRunCard run={run({ status })} />)
      expect(container.textContent).toContain(ROUTINE_RUN_STATUS_LABELS[status])
      expect(container.querySelector(`[data-status-icon="${status}"]`)).toBeTruthy()
      unmount()
    }
  })

  it('o ícone de Executando gira pelo Framer Motion (sem animação CSS) e fica parado com movimento reduzido', () => {
    mocks.reduced = false
    const { container, unmount } = render(<RoutineRunCard run={run({ status: 'running', finishedAt: null })} />)
    const icon = container.querySelector('[data-status-icon="running"]')!
    expect(icon.getAttribute('class')).not.toContain('animate-spin')
    expect(icon.closest('[data-spinning]')!.getAttribute('data-spinning')).toBe('true')
    unmount()
    mocks.reduced = true
    const reduced = render(<RoutineRunCard run={run({ status: 'running', finishedAt: null })} />)
    expect(reduced.container.querySelector('[data-status-icon="running"]')!.closest('[data-spinning]')!.getAttribute('data-spinning')).toBe('false')
    expect(reduced.container.querySelector('[data-status-icon="completed"]')).toBeNull()
  })

  it('origem, início, término, duração, motor e modelo', () => {
    const { container } = render(<RoutineRunCard run={run()} />)
    expect(screen.getByTestId('run-card-origin').textContent).toBe('Agendado recorrente')
    const times = screen.getByTestId('run-card-times').textContent!
    expect(times).toMatch(/Início 04\/11\/2026/)
    expect(times).toContain('Término')
    expect(times).toContain('Duração 10 min')
    expect(container.textContent).toContain('Motor Opex · deepseek-flash')
    expect(container.textContent).toContain('1,5k tokens')
  })

  it('pedido quando houver; início do relato em texto simples com corte de 3 linhas; sem relato, sem bloco', () => {
    const { unmount } = render(<RoutineRunCard run={run({ request: 'Verifique as vagas', report: '# Resumo\n**Três** vagas novas em `vagas.csv`.\n- item' })} />)
    expect(screen.getByTestId('run-card-request').textContent).toContain('Verifique as vagas')
    const report = screen.getByTestId('run-card-report')
    expect(report.classList.contains('line-clamp-3')).toBe(true)
    expect(report.textContent).toBe('Resumo\nTrês vagas novas em vagas.csv.\nitem')
    unmount()
    render(<RoutineRunCard run={run()} />)
    expect(screen.queryByTestId('run-card-report')).toBeNull()
    expect(screen.queryByTestId('run-card-request')).toBeNull()
  })

  it('Erro mostra o motivo no próprio card', () => {
    render(<RoutineRunCard run={run({ status: 'error', error: 'O turno da execução foi perdido' })} />)
    expect(screen.getByTestId('run-card-error').textContent).toContain('O turno da execução foi perdido')
  })

  it('Aguardando confirmação: o pendente com o link Responder para a página da execução, sem Confirmar/Recusar', () => {
    render(<RoutineRunCard run={run({ status: 'awaiting_confirmation', finishedAt: null, pendingAction: { id: 'p1', summary: 'Apagar 3 arquivos', kind: 'tool', toolLabel: null, input: null, requestedAt: '2026-11-04T15:05:00.000Z', resolvedAt: null, resolution: null } })} />)
    const pending = screen.getByTestId('run-card-pending')
    expect(pending.textContent).toContain('Apagar 3 arquivos')
    expect(screen.getByRole('link', { name: 'Responder' }).getAttribute('href')).toBe('/agentes-rotineiros/a1/execucoes/r1')
    expect(screen.queryByRole('button', { name: /Confirmar|Recusar/ })).toBeNull()
  })

  it('Hibernada mostra a próxima verificação', () => {
    render(<RoutineRunCard run={run({ status: 'hibernating', finishedAt: null, hibernation: { at: '2026-11-04T18:30:00.000Z', reason: 'aguardando o deploy' } })} />)
    const notice = screen.getByTestId('run-card-hibernation').textContent!
    expect(notice).toMatch(/Próxima verificação em 04\/11\/2026/)
    expect(notice).toContain('aguardando o deploy')
  })

  it('destaque só em Executando e Esperando', () => {
    for (const status of ROUTINE_RUN_STATUSES) {
      const { container, unmount } = render(<RoutineRunCard run={run({ status })} />)
      const live = status === 'running' || status === 'waiting'
      expect(container.querySelector('article')!.getAttribute('data-live')).toBe(live ? 'true' : 'false')
      expect(Boolean(screen.queryByTestId('run-card-live'))).toBe(live)
      expect(isLiveRun({ status })).toBe(live)
      unmount()
    }
  })

  it('sem botão "Abrir": o título é o link; Cancelar só nos status não finais', () => {
    for (const status of ROUTINE_RUN_STATUSES) {
      const { unmount } = render(<RoutineRunCard run={run({ status })} onCancel={() => {}} />)
      expect(screen.queryByRole('button', { name: /Abrir/ })).toBeNull()
      expect(Boolean(screen.queryByRole('button', { name: 'Cancelar' }))).toBe(!isFinalRunStatus(status))
      unmount()
    }
  })
})

describe('aba Execuções com cards (OPE-213)', () => {
  it('um card por execução, na ordem recebida (mais recentes primeiro)', () => {
    mocks.runs = [run({ id: 'r2', seq: 4 }), run({ id: 'r1', seq: 3 })]
    render(<RoutineRunsTab agentId="a1" />)
    expect(screen.getAllByTestId(/routine-run-card-/).map((node) => node.dataset.testid)).toEqual(['routine-run-card-r2', 'routine-run-card-r1'])
  })

  it('Cancelar abre a confirmação vigente e só cancela ao confirmar', () => {
    mocks.runs = [run({ status: 'running', finishedAt: null })]
    render(<RoutineRunsTab agentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Cancelar esta execução?')).toBeTruthy()
    expect(mocks.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar execução' }))
    expect(mocks.cancel).toHaveBeenCalledWith('r1', expect.anything())
  })
})

describe('regras puras do card (OPE-213)', () => {
  it('reportExcerpt tira a marcação do Markdown e devolve null sem relato', () => {
    expect(reportExcerpt('## Título\n\n> citação com [link](http://x) e ~~riscado~~')).toBe('Título\ncitação com link e riscado')
    expect(reportExcerpt('```\ncódigo\n```')).toBeNull()
    expect(reportExcerpt(null)).toBeNull()
  })

  it('runCardTimes: sem término, sem término nem duração', () => {
    const times = runCardTimes({ startedAt: null, queuedAt: '2026-11-04T15:00:00.000Z', finishedAt: null, activeMs: 5000 })
    expect(times.end).toBeNull()
    expect(times.duration).toBeNull()
    expect(times.start).toMatch(/04\/11\/2026/)
  })
})
