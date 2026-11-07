/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** Aba Entradas (OPE-149): a entrada global aparece identificada, com o canal; o vazio cita as globais. */

const mocks = vi.hoisted(() => ({ data: [] as unknown[] }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/routine-agents/hooks/useRoutineRuns', () => ({
  useRoutineEntries: () => ({ data: mocks.data, isLoading: false, isError: false, refetch: vi.fn() }),
  useAddRoutineEntry: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { RoutineEntriesTab } from '@/features/routine-agents/components/page/RoutineEntriesTab'

afterEach(() => {
  cleanup()
  mocks.data = []
})

describe('aba Entradas', () => {
  it('mostra a entrada global com o rótulo "Todos os rotineiros" e o canal global', () => {
    mocks.data = [{ id: 'e1', target: 'global', channel: 'agentes/rotineiros/global', text: 'vale para todos', memoryId: 'm_1', createdAt: '2026-11-07T12:00:00.000Z' }]
    render(<RoutineEntriesTab agentId="a1" />)
    expect(screen.getByText('vale para todos')).toBeTruthy()
    expect(screen.getByText('Todos os rotineiros', { selector: 'span' }).className).toContain('text-primary')
    expect(screen.getByText('agentes/rotineiros/global')).toBeTruthy()
  })

  it('o estado vazio não sugere que as globais não existem', () => {
    render(<RoutineEntriesTab agentId="a1" />)
    expect(screen.getByText('Nenhuma entrada')).toBeTruthy()
    expect(screen.getByText(/entradas deste agente e as de/)).toBeTruthy()
  })
})
