/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { MentorRunDto, MentorRunMemoryDto } from '@/features/adversarial-agent/mentor/types'

/** OPE-128: detalhe de uma execução do Mentor — hierarquia, seções, resumo da memória e rodapé. */

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  memory: { data: undefined as MentorRunMemoryDto | undefined, isLoading: false, isError: false, refetch: vi.fn() },
  memoryArg: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/adversarial-agent/hooks/useMentor', () => ({
  useMentorRunDecision: () => ({ mutate: mocks.mutate, isPending: false }),
  useMentorRunMemory: (run: unknown) => {
    mocks.memoryArg(run)
    return mocks.memory
  },
}))

import { formatCost, formatDuration } from '@/features/adversarial-agent/components/ReviewBadges'
import { MentorRunDialog } from '@/features/adversarial-agent/components/mentor/MentorRunDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.memory = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
})

const LONG = 'Ao revisar telas com provedores, confira se cada provider é montado acima do consumidor. '.repeat(12)

const run = (overrides: Partial<MentorRunDto> = {}): MentorRunDto => ({
  id: 'r1',
  workbenchId: 'w1',
  centralId: 'c1',
  taskId: 't1',
  taskCode: 'OPE-746',
  taskTitle: 'Modelos do catálogo',
  sources: ['user', 'ai'],
  trigger: 'preview_correction',
  userMessage: 'Salvar derrubou o app',
  lessonCount: 0,
  status: 'created',
  level: 'balanced',
  score: 0.82,
  threshold: 0.65,
  deciderReason: 'Erro genérico e recorrente',
  target: 'adversarial',
  routerConfidence: 0.7,
  routerReason: 'classe de erro de revisão',
  routerProbabilities: null,
  writerAction: 'create',
  writerReason: 'nenhuma parecida',
  sanitizerReason: null,
  proposal: { action: 'create', memoryId: null, text: LONG, target: 'adversarial', centralId: null },
  memoryId: 'm_abc',
  error: null,
  costUsd: 0.01,
  durationMs: 1200,
  createdAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  ...overrides,
})

const dialog = () => screen.getByRole('dialog')

describe('MentorRunDialog (OPE-128)', () => {
  it('cabeçalho: código + situação no título, título da tarefa como subtítulo e metadados separados', () => {
    render(<MentorRunDialog run={run()} onClose={vi.fn()} />)
    const title = screen.getByRole('heading', { name: /OPE-746/ })
    expect(within(title).getByText('Memória criada')).toBeTruthy()
    expect(title.textContent).not.toContain('Modelos do catálogo')
    expect(screen.getByText('Modelos do catálogo')).toBeTruthy()
    const meta = screen.getByLabelText('Metadados da execução')
    expect(meta.textContent).toContain(formatCost(0.01))
    expect(meta.textContent).toContain(formatDuration(1200))
  })

  it('etapas em seções com título (sem a coluna de rótulos) e motivos em parágrafos', () => {
    render(<MentorRunDialog run={run()} onClose={vi.fn()} />)
    for (const name of ['Gatilhos', 'Decisor', 'Triador', 'Redator', 'Memória']) expect(screen.getByRole('region', { name })).toBeTruthy()
    expect(dialog().querySelector('dl, dt')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Gatilhos' })).getByText('Salvar derrubou o app')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Decisor' })).getByText('Erro genérico e recorrente').classList.contains('whitespace-pre-wrap')).toBe(true)
    expect(screen.getByText(/Agente Adversário · confiança 70%/)).toBeTruthy()
  })

  it('memória gravada: o resumo do Engramind aparece em destaque antes do texto completo, que rola na própria área', () => {
    mocks.memory = { ...mocks.memory, data: { state: 'ok', resumo: 'Conferir a ordem dos providers', resumoPendente: false, atualizadaEm: new Date().toISOString() } }
    render(<MentorRunDialog run={run()} onClose={vi.fn()} />)
    expect(mocks.memoryArg).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', memoryId: 'm_abc' }))
    const summary = screen.getByLabelText('Resumo da memória')
    const full = screen.getByLabelText('Texto completo da memória')
    expect(within(summary).getByText('Conferir a ordem dos providers')).toBeTruthy()
    expect(summary.compareDocumentPosition(full) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(full.textContent).toBe(LONG)
    for (const cls of ['overflow-y-auto', 'max-w-prose', 'leading-relaxed', 'whitespace-pre-wrap']) expect(full.classList.contains(cls)).toBe(true)
  })

  it('resumo ainda sendo gerado: mostra o provisório com o aviso', () => {
    mocks.memory = { ...mocks.memory, data: { state: 'ok', resumo: 'Ao revisar telas', resumoPendente: true, atualizadaEm: null } }
    render(<MentorRunDialog run={run()} onClose={vi.fn()} />)
    expect(screen.getByText(/Resumo sendo gerado pelo Engramind/)).toBeTruthy()
  })

  it('sem memória gravada: estado vazio discreto do resumo; memória excluída: aviso', () => {
    const { rerender } = render(<MentorRunDialog run={run({ status: 'skipped', memoryId: null })} onClose={vi.fn()} />)
    expect(within(screen.getByLabelText('Resumo da memória')).getByText(/Sem resumo/)).toBeTruthy()
    mocks.memory = { ...mocks.memory, data: { state: 'missing', resumo: null, resumoPendente: false, atualizadaEm: null } }
    rerender(<MentorRunDialog run={run()} onClose={vi.fn()} />)
    expect(screen.getByText(/não está mais no Engramind/)).toBeTruthy()
  })

  it('erro ao carregar o resumo: Tentar novamente refaz a consulta', () => {
    mocks.memory = { ...mocks.memory, isError: true }
    render(<MentorRunDialog run={run()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.memory.refetch).toHaveBeenCalled()
  })

  it('execução que não é sugestão: rodapé com Fechar (fecha o dialog), sem Aprovar', () => {
    const onClose = vi.fn()
    render(<MentorRunDialog run={run()} onClose={onClose} />)
    expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('sugestão: resumo vazio, texto editável, Aprovar envia texto e destino; Descartar pede confirmação', () => {
    render(<MentorRunDialog run={run({ status: 'suggested', memoryId: null, proposal: { action: 'create', memoryId: null, text: 'Confira providers.', target: 'adversarial', centralId: null } })} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull()
    expect(within(screen.getByLabelText('Resumo da memória')).getByText(/Sem resumo/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Memória sugerida \(pode editar/), { target: { value: 'Confira os providers.' } })
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ id: 'r1', decision: 'approve', text: 'Confira os providers.', target: 'adversarial' }, expect.anything())
    fireEvent.click(screen.getByRole('button', { name: /Descartar/ }))
    expect(screen.getByText('Descartar a sugestão?')).toBeTruthy()
  })

  it('falha: erro em destaque no topo do corpo', () => {
    render(<MentorRunDialog run={run({ status: 'failed', error: 'Gemini fora do ar', proposal: null, memoryId: null })} onClose={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toContain('Gemini fora do ar')
    expect(screen.queryByRole('region', { name: 'Memória' })).toBeNull()
  })
})
