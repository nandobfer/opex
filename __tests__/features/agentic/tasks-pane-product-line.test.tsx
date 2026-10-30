/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto } from '@/features/agentic/types'
import type { TaskBoardDto } from '@/features/tasks/board'
import type { TaskDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), getItemKey: null as null | ((index: number) => string | number) }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete } }))
// O DOM de teste mede o contêiner de rolagem como 0px; a virtualização devolveria nenhuma linha.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize, getItemKey }: { count: number; estimateSize: () => number; getItemKey?: (index: number) => string | number }) => {
    mocks.getItemKey = getItemKey ?? null
    return {
      getTotalSize: () => count * estimateSize(),
      getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), size: estimateSize(), key: getItemKey?.(index) ?? index })),
      measureElement: () => {},
    }
  },
}))

import { TasksPane } from '@/features/agentic/components/dev-center/TasksPane'
import { NEUTRAL_PRODUCT_COLOR_CLASS } from '@/features/agentic/dev-center-product'

/** Linha do projeto colorida e dica da coluna nos cards da Central de desenvolvimento (OPE-100, port do MT-31). */

const TASK = 'a'.repeat(24)
const ok = (data: unknown) => ({ data: { success: true, data } })

const centralWith = (color: string | null) => ({ id: 'c1', projectId: 'p1', projectName: 'Opex', repo: 'nandobfer/opex', config: { enabled: true, color } }) as unknown as CentralDto

const board: TaskBoardDto = {
  columns: [{ key: 'doing', name: 'Em andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null }],
  layout: ['doing'],
}

const task = (overrides: Partial<TaskDto> = {}): TaskDto =>
  ({
    id: TASK,
    code: 'OPE-33',
    columnId: 'doing',
    order: 1,
    title: 'Linha do projeto',
    summary: null,
    tags: [],
    taskType: 'feature',
    priority: 'high',
    archived: false,
    project: { id: 'p1', name: 'Opex', repo: 'nandobfer/opex', sigla: 'OPE' },
    estimate: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }) as TaskDto

async function renderPane(color: string | null, overrides: Partial<TaskDto> = {}) {
  const central = centralWith(color)
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/tasks') return ok({ tasks: [task(overrides)], fetchedAt: new Date().toISOString() })
    if (url === '/tasks/columns') return ok(board)
    if (url === '/agentic/centrals/c1/workbenches') return ok([])
    if (url === '/agentic/centrals/c1/queue') return ok([])
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TasksPane central={central} centrals={[central]} activeTaskId={null} onSelectCentral={() => {}} />
    </QueryClientProvider>,
  )
  await screen.findByText('OPE-33')
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})
afterEach(() => cleanup())

describe('linha do projeto nos cards da Central de desenvolvimento', () => {
  it('mostra o repositório da central em negrito, na cor da central', async () => {
    await renderPane('emerald')
    const line = screen.getByTestId('task-product')
    expect(line.textContent).toBe('nandobfer/opex')
    expect(line.classList.contains('text-emerald-400')).toBe(true)
    expect(line.classList.contains('font-bold')).toBe(true)
  })

  it('central sem cor: linha neutra', async () => {
    await renderPane(null)
    const line = screen.getByTestId('task-product')
    expect(line.classList.contains(NEUTRAL_PRODUCT_COLOR_CLASS)).toBe(true)
    expect(line.classList.contains('text-emerald-400')).toBe(false)
  })

  it('a coluna aparece só no bullet (com o nome no rótulo acessível), não em texto', async () => {
    await renderPane('sky')
    const dot = screen.getByTestId('task-column-dot')
    expect(dot.getAttribute('aria-label')).toBe('Em andamento')
    expect(screen.queryByText('Em andamento')).toBeNull()
  })
})
