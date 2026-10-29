/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { OpexJobDto } from '@/features/opex-agent/jobs'

const mocks = vi.hoisted(() => ({
  jobs: [] as unknown[],
  queries: [] as unknown[],
  cancel: vi.fn(),
  rerun: vi.fn(),
  openSession: vi.fn(),
  dialog: null as unknown,
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/opex-agent/hooks/useOpexJobs', () => ({
  useOpexJobs: (query: unknown) => {
    mocks.queries.push(query)
    return { isPending: false, isError: false, data: mocks.jobs, refetch: vi.fn() }
  },
  useCancelOpexJob: () => ({ mutate: mocks.cancel }),
  useSaveOpexJob: () => ({ mutate: mocks.rerun, isPending: false, variables: undefined }),
  useOpexJobsRealtime: () => {},
}))
vi.mock('@/features/opex-agent/hooks/useOpexSessions', () => ({
  useOpexSessions: () => ({ data: [{ id: 's1', title: 'Conversa dos PRs', archived: false }] }),
  useOpexRealtime: () => {},
}))
vi.mock('@/features/opex-agent/hooks/useOpexSettings', () => ({ useOpexSettings: () => ({ data: { availability: { available: true, reason: null } } }) }))
vi.mock('@/features/orcamentos/hooks/useOrcamentos', () => ({ useOrcamentoClients: () => ({ data: [{ id: 'c1', name: 'ACME' }] }) }))
vi.mock('@/features/opex-agent/open-session', () => ({ requestOpenOpexSession: mocks.openSession }))
vi.mock('@/features/opex-agent/components/jobs/OpexJobDialog', () => ({
  OpexJobDialog: ({ mode }: { mode: unknown }) => {
    mocks.dialog = mode
    return null
  },
}))

import { OpexJobsTab } from '@/features/opex-agent/components/jobs/OpexJobsTab'

const job = (overrides: Partial<OpexJobDto> = {}): OpexJobDto => ({
  id: 'j1',
  title: 'Resumo dos PRs',
  prompt: 'Liste os PRs abertos',
  sessionId: null,
  resultSessionId: null,
  schedule: { when: 'in', amount: 30, unit: 'minutes', date: null, time: null },
  runAt: '2099-10-23T12:30:00.000Z',
  status: 'scheduled',
  startedAt: null,
  finishedAt: null,
  delayMs: null,
  error: null,
  createdBy: 'agent',
  originSessionId: 's1',
  sourceJobId: null,
  origin: { kind: 'owner' },
  createdAt: '2026-10-23T12:00:00.000Z',
  ...overrides,
})

const portal = { kind: 'client' as const, clientId: 'c1', clientName: 'ACME', userId: 'u1', userName: 'ana' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.jobs = []
  mocks.queries = []
  mocks.dialog = null
})
afterEach(cleanup)

describe('aba Jobs', () => {
  it('vazio: mostra o estado vazio com a ação; "Executar job" abre o formulário de criação', () => {
    render(<OpexJobsTab />)
    expect(screen.getByText('Nenhum job agendado')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Executar job/ })[0]!)
    expect(mocks.dialog).toEqual({ type: 'create' })
  })

  it('agendado: mostra situação e origem; cancelar pede confirmação antes', () => {
    mocks.jobs = [job()]
    render(<OpexJobsTab />)
    expect(screen.getByText('Agendado')).toBeTruthy()
    expect(screen.getByText(/pelo agente/)).toBeTruthy()
    expect(screen.getByText('Sessão: nova')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar: Resumo dos PRs' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar job' }))
    expect(mocks.cancel).toHaveBeenCalledWith('j1')
  })

  it('executado com erro: mostra o erro e o atraso, reexecuta como novo job e abre a sessão', () => {
    mocks.jobs = [job({ status: 'error', error: 'Credencial recusada', resultSessionId: 's1', delayMs: 15 * 60_000, finishedAt: '2026-10-23T12:46:00.000Z' })]
    render(<OpexJobsTab />)
    expect(screen.getByRole('alert').textContent).toContain('Credencial recusada')
    expect(screen.getByText('Atraso de 15 min')).toBeTruthy()
    expect(screen.getByText('Sessão: Conversa dos PRs')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reexecutar: Resumo dos PRs' }))
    expect(mocks.dialog).toMatchObject({ type: 'rerun', values: { title: 'Resumo dos PRs', when: 'now', sourceJobId: 'j1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir sessão: Resumo dos PRs' }))
    expect(mocks.openSession).toHaveBeenCalledWith('s1')
  })

  it('filtro "Executados" consulta o histórico', () => {
    render(<OpexJobsTab />)
    fireEvent.click(screen.getByRole('radio', { name: 'Executados' }))
    expect(mocks.queries.at(-1)).toMatchObject({ filter: 'finished' })
    expect(screen.getByText('Nenhum job executado nos últimos 30 dias')).toBeTruthy()
  })

  it('filtro de origem: "Do portal" consulta os jobs dos clientes e mostra a escolha do cliente', () => {
    render(<OpexJobsTab />)
    expect(screen.queryByRole('combobox', { name: 'Cliente dos jobs' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Do portal' }))
    expect(mocks.queries.at(-1)).toMatchObject({ origin: 'client', clientId: null })
    expect(screen.getByRole('combobox', { name: 'Cliente dos jobs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Do dono' }))
    expect(mocks.queries.at(-1)).toMatchObject({ origin: 'owner' })
  })

  it('job do portal: mostra cliente e usuário, sem Editar nem Abrir sessão; reexecuta direto, sem formulário', () => {
    mocks.jobs = [
      job({ id: 'j2', title: 'Lembrete', status: 'scheduled', origin: portal, createdBy: 'user', sessionId: 's9' }),
      job({ id: 'j3', title: 'Pronto', status: 'done', origin: portal, resultSessionId: 's1', finishedAt: '2026-10-23T12:46:00.000Z' }),
    ]
    render(<OpexJobsTab />)
    expect(screen.getAllByText('ACME · ana')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Editar: Lembrete' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancelar: Lembrete' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Abrir sessão: Pronto' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reexecutar: Pronto' }))
    expect(mocks.dialog).toBeNull()
    expect(mocks.rerun).toHaveBeenCalledWith({ input: expect.objectContaining({ title: 'Pronto', when: 'now', sourceJobId: 'j3' }) })
  })
})
