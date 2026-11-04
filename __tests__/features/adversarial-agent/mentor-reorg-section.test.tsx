/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Seção Reorganização do Agente Mentor (OPE-132): histórico, confirmação do recorte e plano por item. */

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  start: vi.fn(),
  history: null as unknown,
  plan: null as unknown,
  settings: null as unknown,
  preview: null as unknown,
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/adversarial-agent/hooks/useMentor', () => ({ useMentorSettings: () => mocks.settings }))
vi.mock('@/features/adversarial-agent/hooks/useMentorReorg', () => ({
  useMentorReorgs: () => mocks.history,
  useMentorReorg: () => mocks.plan,
  useMentorReorgDecision: () => ({ mutate: mocks.mutate, isPending: false }),
  useMentorReorgRealtime: vi.fn(),
  useMentorReorgPreview: () => mocks.preview,
  useStartMentorReorg: () => ({ mutateAsync: mocks.start, isPending: false }),
}))

import { MentorReorgSection } from '@/features/adversarial-agent/components/mentor/reorg/MentorReorgSection'
import { MentorReorgPlan } from '@/features/adversarial-agent/components/mentor/reorg/MentorReorgPlan'
import { DEFAULT_MENTOR_SETTINGS } from '@/features/adversarial-agent/mentor/schemas'
import type { MentorReorgDto, MentorReorgItemDto, MentorReorgSummaryDto } from '@/features/adversarial-agent/mentor/types'

const summary = (overrides: Partial<MentorReorgSummaryDto> = {}): MentorReorgSummaryDto => ({
  id: 'r1',
  status: 'ready',
  total: 2,
  done: 2,
  costUsd: 0.04,
  durationMs: 5000,
  createdAt: new Date().toISOString(),
  finishedAt: null,
  ...overrides,
})

const item = (overrides: Partial<MentorReorgItemDto> = {}): MentorReorgItemDto => ({
  id: 'i1',
  origin: { target: 'adversarial', centralId: null, memoryId: 'm1', resumo: 'Providers', texto: 'Confira providers.', versao: 1, owner: false },
  action: 'move',
  target: 'developer-global',
  centralId: null,
  targetLabel: 'Agente desenvolvedor — globais',
  text: 'Confira se o provider está acima do componente.',
  mergeInto: null,
  mergeIntoResumo: null,
  reason: 'Vale em qualquer projeto',
  note: null,
  routerConfidence: 0.8,
  routerReason: null,
  sanitizerReason: null,
  moveBlocked: false,
  ownerMemory: false,
  status: 'pending',
  error: null,
  ...overrides,
})

const plan = (overrides: Partial<MentorReorgDto> = {}): MentorReorgDto => ({
  id: 'r1',
  status: 'ready',
  targets: ['adversarial', 'developer-global', 'developer-central'],
  centralIds: ['c1'],
  total: 2,
  done: 2,
  costUsd: 0.04,
  durationMs: 5000,
  error: null,
  items: [item(), item({ id: 'i2', origin: { target: 'developer-global', centralId: null, memoryId: 'm2', resumo: 'Testes', texto: 'Escreva testes.', versao: 1, owner: false }, action: 'keep', target: 'developer-global', text: null, reason: 'Já está boa' })],
  counts: { keep: 1, rewrite: 0, move: 1, merge: 0, pending: 2, applied: 0, failed: 0, discarded: 0 },
  createdAt: new Date().toISOString(),
  finishedAt: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.history = { data: { items: [summary()], centrals: [{ id: 'c1', projectName: 'App' }] }, isLoading: false, isError: false, refetch: vi.fn() }
  mocks.settings = { data: { settings: structuredClone(DEFAULT_MENTOR_SETTINGS), isDefault: true, availability: { available: true }, updatedAt: null } }
  mocks.plan = { data: plan(), isLoading: false, isError: false, refetch: vi.fn() }
  mocks.preview = { data: { memories: 3, calls: 6, averageCostUsdPerMemory: 0.01 }, isLoading: false, isError: false, refetch: vi.fn() }
  mocks.start.mockResolvedValue({ id: 'r1' })
})

afterEach(cleanup)

describe('seção Reorganização', () => {
  it('mostra o botão, o histórico e a estimativa antes de iniciar', () => {
    render(<MentorReorgSection />)
    expect(screen.getByText('Reorganização do acervo')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ver plano/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Reorganizar memórias/ }))
    expect(screen.getAllByText('Reorganizar memórias').length).toBeGreaterThan(1)
    expect(screen.getByText(/3 memórias · 6 chamadas de IA/)).toBeTruthy()
    expect(screen.getByText(/US\$ 0,01 por memória|US\$ 0.01 por memória/)).toBeTruthy()
  })

  it('abre o plano pelo histórico', () => {
    render(<MentorReorgSection />)
    fireEvent.click(screen.getByRole('button', { name: /Ver plano/ }))
    expect(screen.getByText('Plano de reorganização')).toBeTruthy()
    expect(screen.getByText('Providers')).toBeTruthy()
    expect(screen.getByText(/Vale em qualquer projeto/)).toBeTruthy()
  })
})

describe('plano de reorganização', () => {
  it('aprova e descarta item a item, com o texto e o destino propostos', () => {
    render(<MentorReorgPlan id="r1" onBack={vi.fn()} />)
    expect(screen.getByText('Providers')).toBeTruthy()
    expect(screen.getAllByText('Agente desenvolvedor — globais').length).toBeGreaterThan(0)
    expect(screen.getByText(/Confira se o provider está acima do componente/)).toBeTruthy()
    expect(screen.getByText(/Vale em qualquer projeto/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Aprovar/ })[0]!)
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', decision: 'apply', itemIds: ['i1'] }))
    fireEvent.click(screen.getAllByRole('button', { name: /Descartar$/ })[0]!)
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', decision: 'discard', itemIds: ['i1'] }))
  })

  it('fusão de memória do dono exige a confirmação explícita', () => {
    mocks.plan = {
      ...mocks.plan,
      data: plan({ items: [item({ action: 'merge', mergeInto: 'm2', mergeIntoResumo: 'Regra que fica', ownerMemory: true, text: 'Regra fundida' })] }),
    }
    render(<MentorReorgPlan id="r1" onBack={vi.fn()} />)
    const approve = screen.getByRole('button', { name: /^Aprovar$/ }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(approve.disabled).toBe(false)
    fireEvent.click(approve)
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ itemIds: ['i1'], overrides: { i1: { confirmOwner: true } } }))
  })

  it('aprovar tudo pede confirmação e aplica o plano inteiro', () => {
    render(<MentorReorgPlan id="r1" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Aprovar tudo/ }))
    expect(screen.getByText('Aplicar o plano de reorganização?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(mocks.mutate).toHaveBeenCalledWith({ id: 'r1', decision: 'apply' })
  })

  it('sinaliza o item sem escopo para mover', () => {
    mocks.plan = { ...mocks.plan, data: plan({ items: [item({ moveBlocked: true })] }) }
    render(<MentorReorgPlan id="r1" onBack={vi.fn()} />)
    expect(screen.getByText(/não alcança esta lista/)).toBeTruthy()
  })
})
