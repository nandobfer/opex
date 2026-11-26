/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { OpexWatchDto } from '@/features/opex-agent/watches'
import type { OpexMessageDto } from '@/features/opex-agent/types'

/**
 * Interface da observação de eventos (OPE-194): a pílula da notificação que acordou o agente, a faixa
 * "Observando…" do chat e a aba Observações de Integrações › Crons. Hooks mockados (sem rede).
 */

const mocks = vi.hoisted(() => ({
  session: { isPending: false, data: [] as unknown[] },
  list: { isPending: false, isError: false, data: [] as unknown[], refetch: vi.fn() },
  queries: [] as unknown[],
  cancel: vi.fn(),
  openSession: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/opex-agent/hooks/useOpexWatches', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/opex-agent/hooks/useOpexWatches')>()
  return {
    activeWatches: actual.activeWatches,
    useOpexSessionWatches: () => mocks.session,
    useOpexWatches: (query: unknown) => {
      mocks.queries.push(query)
      return mocks.list
    },
    useCancelOpexWatch: () => ({ mutate: mocks.cancel }),
    useOpexWatchesRealtime: () => {},
  }
})
vi.mock('@/features/opex-agent/hooks/useOpexSessions', () => ({
  useOpexSessions: () => ({ data: [{ id: 's1', title: 'Conversa da OPE-12', archived: false }] }),
  useOpexRealtime: () => {},
}))
vi.mock('@/features/orcamentos/hooks/useOrcamentos', () => ({ useOrcamentoClients: () => ({ data: [{ id: 'c1', name: 'ACME' }] }) }))
vi.mock('@/features/opex-agent/open-session', () => ({ requestOpenOpexSession: mocks.openSession }))

import { OpexSessionWatches } from '@/features/opex-agent/components/chat/OpexSessionWatches'
import { OpexWatchesTab } from '@/features/opex-agent/components/watches/OpexWatchesTab'
import { UserMessage } from '@/features/opex-agent/components/chat/OpexMessageItem'

const watch = (overrides: Partial<OpexWatchDto> = {}): OpexWatchDto => ({
  id: 'w1',
  sessionId: 's1',
  target: { kind: 'task', id: 't1', label: 'OPE-12' },
  condition: { event: 'done', values: [], labels: [] },
  conditionText: 'chegar na coluna de conclusão',
  pillText: 'Observando tarefa OPE-12 · chegar na coluna de conclusão',
  note: 'Avise o dono',
  status: 'watching',
  outcome: null,
  event: null,
  expiresAt: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  triggeredAt: null,
  wokenAt: null,
  error: null,
  createdAt: '2026-11-25T14:40:00.000Z',
  origin: { kind: 'owner' },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = { isPending: false, data: [] }
  mocks.list = { isPending: false, isError: false, data: [], refetch: vi.fn() }
  mocks.queries = []
})
afterEach(cleanup)

describe('pílula da notificação de sistema', () => {
  it('a mensagem "event" aparece como pílula central, no padrão de notice/confirmation', () => {
    const message = { id: 'm1', role: 'user', kind: 'event', job: null, watch: { ids: ['w1'], label: 'tarefa OPE-12' }, text: 'Evento · OPE-12 foi para Concluído', files: [], parts: [], status: 'complete', error: null, usage: null, durationMs: null, model: null, createdAt: 'x' } as OpexMessageDto
    render(<UserMessage message={message} />)
    const pill = screen.getByTestId('opex-event-pill')
    expect(pill.textContent).toContain('Evento · OPE-12 foi para Concluído')
    expect(pill.classList.contains('rounded-full')).toBe(true)
  })
})

describe('faixa "Observando…" do chat', () => {
  it('sem observação ativa não ocupa espaço', () => {
    render(<OpexSessionWatches sessionId="s1" />)
    expect(screen.queryByTestId('opex-session-watches')).toBeNull()
  })

  it('mostra as ativas com o prazo; o X pede confirmação antes de cancelar', () => {
    mocks.session = { isPending: false, data: [watch(), watch({ id: 'w2', status: 'woken', pillText: 'Encerrada' })] }
    render(<OpexSessionWatches sessionId="s1" />)
    const pills = screen.getAllByTestId('opex-watch-pill')
    expect(pills).toHaveLength(1)
    expect(pills[0]!.textContent).toContain('Observando tarefa OPE-12')
    expect(pills[0]!.textContent).toContain('expira em 23 h')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar: Observando tarefa OPE-12 · chegar na coluna de conclusão' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar observação' }))
    expect(mocks.cancel).toHaveBeenCalledWith('w1')
  })

  it('disparada: mostra "acordando o agente…" sem o cancelar', () => {
    mocks.session = { isPending: false, data: [watch({ status: 'delivering' })] }
    render(<OpexSessionWatches sessionId="s1" />)
    expect(screen.getByTestId('opex-watch-pill').textContent).toContain('acordando o agente…')
    expect(screen.queryByRole('button', { name: /Cancelar:/ })).toBeNull()
  })
})

describe('aba Observações', () => {
  it('vazio, filtros e origem', () => {
    render(<OpexWatchesTab />)
    expect(screen.getByText('Nenhuma observação ativa')).toBeTruthy()
    fireEvent.click(screen.getByText('Encerradas'))
    expect(mocks.queries.at(-1)).toMatchObject({ filter: 'finished' })
  })

  it('erro com tentar novamente', () => {
    mocks.list = { isPending: false, isError: true, data: [], refetch: vi.fn() }
    render(<OpexWatchesTab />)
    expect(screen.getByText('Não foi possível carregar as observações')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.list.refetch).toHaveBeenCalled()
  })

  it('linha: alvo, situação, o que foi combinado, abrir a sessão e cancelar com confirmação', () => {
    mocks.list = { isPending: false, isError: false, data: [watch()], refetch: vi.fn() }
    render(<OpexWatchesTab />)
    expect(screen.getByText('Tarefa OPE-12')).toBeTruthy()
    expect(screen.getByText('Observando')).toBeTruthy()
    expect(screen.getByText('Ao acordar: Avise o dono')).toBeTruthy()
    expect(screen.getByText('Sessão: Conversa da OPE-12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Abrir sessão/ }))
    expect(mocks.openSession).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar: / }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar observação' }))
    expect(mocks.cancel).toHaveBeenCalledWith('w1')
  })

  it('observação do portal mostra o cliente e não abre a sessão do usuário; encerrada mostra o evento', () => {
    mocks.list = {
      isPending: false,
      isError: false,
      data: [watch({ status: 'woken', origin: { kind: 'client', clientId: 'c1', clientName: 'ACME', userId: 'u1', userName: 'ana' }, event: { summary: 'A tarefa OPE-12 mudou de coluna.', at: 'x' }, wokenAt: '2026-11-25T15:02:00.000Z' })],
      refetch: vi.fn(),
    }
    render(<OpexWatchesTab />)
    expect(screen.getByText(/ACME · ana/)).toBeTruthy()
    expect(screen.getByText('A tarefa OPE-12 mudou de coluna.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Abrir sessão/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Cancelar: / })).toBeNull()
  })
})
