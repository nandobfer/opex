/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-104: etapa de importação da migração — migração concluída e falha com "Tentar novamente". */

vi.mock('framer-motion', () => framerMotionMock())
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/features/engramind/hooks/useMemoryMigration', () => ({ useMigrationImport: () => ({ mutate: mocks.mutate, isPending: false }) }))

import { ImportStep } from '@/features/engramind/components/integration/migration/ImportStep'
import type { MemoryMigrationDto } from '@/features/engramind/types'

const IDLE = { status: 'idle', error: null, startedAt: null, finishedAt: null, progress: null } as const
const state = (overrides: Partial<MemoryMigrationDto> = {}): MemoryMigrationDto =>
  ({
    legacyCount: 2,
    backup: null,
    steps: { backup: { ...IDLE, status: 'done' }, triage: { ...IDLE, status: 'done' }, compact: IDLE, import: IDLE },
    curator: null,
    items: [],
    report: null,
    budget: [],
    firstCompletedAt: null,
    lastImportAt: null,
    ...overrides,
  }) as MemoryMigrationDto

beforeEach(() => mocks.mutate.mockReset())
afterEach(cleanup)

describe('etapa de importação', () => {
  it('concluída: mostra a data e quantas foram importadas', () => {
    const items = [{ id: 'a1', review: { status: 'aprovada' }, imported: { engramindId: 'm_1', at: '2026-11-01T10:00:00.000Z', duplicate: false } }] as unknown as MemoryMigrationDto['items']
    render(<ImportStep state={state({ items, firstCompletedAt: '2026-11-01T10:00:00.000Z', lastImportAt: '2026-11-01T10:00:00.000Z', steps: { ...state().steps, import: { ...IDLE, status: 'done' } } })} />)
    expect(screen.getByTestId('migration-done').textContent).toMatch(/Migração concluída em 01\/11\/2026 .* 1 memória\(s\) importada\(s\)/)
  })

  it('falhou: mostra o erro e "Tentar novamente" reimporta', () => {
    render(<ImportStep state={state({ steps: { ...state().steps, import: { ...IDLE, status: 'failed', error: 'Engramind caiu no meio' } } })} />)
    expect(screen.getByRole('alert').textContent).toContain('Engramind caiu no meio')
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })
})
