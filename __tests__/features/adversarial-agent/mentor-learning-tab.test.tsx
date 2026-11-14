/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-165: aba "Aprendizado" da mesa — execuções do Agente Mentor, casos, operações e Tentar novamente. */

const mocks = vi.hoisted(() => ({ query: null as unknown, retry: vi.fn(), refetch: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/lib/api', () => ({ apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('@/features/adversarial-agent/hooks/useMentor', () => ({
  useWorkbenchMentorRuns: () => mocks.query,
  useMentorRealtime: vi.fn(),
  useRetryMentorRun: () => ({ mutate: mocks.retry, isPending: false }),
}))

import { MentorLearningTab, useMentorLearningTab } from '@/features/adversarial-agent/components/workbench/MentorLearningTab'
import type { MentorLearningRunDto } from '@/features/adversarial-agent/mentor/types'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const learning = (overrides: Partial<MentorLearningRunDto> = {}): MentorLearningRunDto => ({
  id: 'r1', kind: 'learning', completedAt: '2026-11-13T15:00:00.000Z', attempt: 1, completionKind: 'manual',
  transcript: { originalChars: 52000, sentChars: 52000, compacted: false, level: 0, aboveThreshold: false, eventCount: 310, forkCount: 0 },
  digestModel: 'gemini/flash', caseCount: 1, digestDiscarded: 2, operationCounts: { update: 1, archive: 1 }, budgetUsd: 0.3, abortReason: null, canRetry: false,
  workbenchId: 'w1', centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'Tarefa', sources: ['done'], trigger: null, userMessage: null, lessonCount: 1,
  status: 'learned', level: 'balanced', score: null, threshold: 0.65, deciderReason: null, target: null, routerConfidence: null, routerReason: null, routerProbabilities: null,
  writerAction: null, writerReason: null, writerSkipKind: null, writerCoveredBy: null, skipRejection: null, splitRejection: null, sanitizerReason: null, proposal: null, extraProposal: null,
  memoryId: null, extraMemoryId: null, error: null, costUsd: 0.12, durationMs: 42000, createdAt: '2026-11-13T15:00:01.000Z', finishedAt: '2026-11-13T15:00:43.000Z',
  cases: [
    {
      id: 'k1', index: 0, lesson: 'O comportamento do filtro mudou: a busca agora ignora acentos', evidence: ['busca sem acento'], nature: 'positive', scope: 'this_project', detection: null,
      status: 'applied', score: 0.8, deciderReason: null, target: 'developer-central', routerReason: null, writerReason: null, skipKind: null, coveredBy: null, rejection: null, error: null,
      operations: [
        { op: 'update', target: 'developer-central', centralId: 'c1', memoryId: 'm_busca', absorbed: [], text: 'Busca', reason: 'comportamento novo', status: 'applied', error: null },
        { op: 'archive', target: 'developer-central', centralId: 'c1', memoryId: 'm_velha', absorbed: [], text: null, reason: 'obsoleta', status: 'applied', error: null },
      ],
    },
  ],
  ...overrides,
})

const ok = (data: MentorLearningRunDto[]) => ({ data, isLoading: false, isError: false, error: null, refetch: mocks.refetch })

function Tab() {
  const tab = useMentorLearningTab('w1')
  return <p>{`visível: ${tab.visible} (${tab.count})`}</p>
}

describe('aba Aprendizado da mesa', () => {
  it('mostra a situação, o tamanho da transcrição, se compactou, o modelo, o custo e as operações com o link da memória', () => {
    mocks.query = ok([learning()])
    render(<MentorLearningTab workbenchId="w1" />)
    expect(screen.getByText('Aprendizado aplicado')).toBeTruthy()
    expect(screen.getByText('52.000 caracteres')).toBeTruthy()
    expect(screen.getByText('enviada inteira')).toBeTruthy()
    expect(screen.getByText('gemini/flash')).toBeTruthy()
    expect(screen.getByText('2 casos descartados')).toBeTruthy()
    expect(screen.getByText('Conclusão manual')).toBeTruthy()
    expect(screen.getByText('O comportamento do filtro mudou: a busca agora ignora acentos')).toBeTruthy()
    expect(screen.getByText('Atualizada')).toBeTruthy()
    expect(screen.getByText('Arquivada')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Memória m_busca: ver detalhes/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Tentar novamente/ })).toBeNull()
  })

  it('falha: mostra o erro e Tentar novamente (com confirmação)', () => {
    mocks.query = ok([learning({ status: 'failed', error: 'Transcrição vazia: a mesa não tem mensagens', canRetry: true, cases: [], transcript: null, caseCount: null, operationCounts: null })])
    render(<MentorLearningTab workbenchId="w1" />)
    expect(screen.getByText(/Transcrição vazia/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.retry).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: /Tentar novamente/ }).at(-1)!)
    expect(mocks.retry).toHaveBeenCalledWith('r1')
  })

  it('carregando mostra o skeleton; erro permite tentar de novo', () => {
    mocks.query = { data: undefined, isLoading: true, isError: false, error: null, refetch: mocks.refetch }
    const { rerender } = render(<MentorLearningTab workbenchId="w1" />)
    expect(screen.getByLabelText('Carregando o aprendizado')).toBeTruthy()
    mocks.query = { data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch: mocks.refetch }
    rerender(<MentorLearningTab workbenchId="w1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('a aba só aparece com execuções na mesa', () => {
    mocks.query = ok([])
    const { rerender } = render(<Tab />)
    expect(screen.getByText('visível: false (0)')).toBeTruthy()
    mocks.query = ok([learning(), learning({ id: 'r2' })])
    rerender(<Tab />)
    expect(screen.getByText('visível: true (2)')).toBeTruthy()
  })
})
