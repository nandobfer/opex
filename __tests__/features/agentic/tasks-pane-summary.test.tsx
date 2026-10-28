/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const TASK = 'a'.repeat(24)
const ok = (data: unknown) => ({ data: { success: true, data } })

const central = { id: 'c1', projectId: 'p1', projectName: 'Opex', config: { enabled: true } } as unknown as CentralDto

const board: TaskBoardDto = {
  columns: [{ key: 'doing', name: 'Em andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null }],
  layout: ['doing'],
}

const SUMMARY = 'Resumo gerado por IA explicando do que trata a tarefa.'

const task = (overrides: Partial<TaskDto> = {}): TaskDto =>
  ({
    id: TASK,
    code: 'OPE-33',
    columnId: 'doing',
    order: 1,
    title: 'Summary na lista',
    summary: SUMMARY,
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

async function renderPane(taskOverrides: Partial<TaskDto> = {}, extra: TaskDto[] = []) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/tasks') return ok({ tasks: [task(taskOverrides), ...extra], fetchedAt: new Date().toISOString() })
    if (url === '/tasks/columns') return ok(board)
    if (url === '/agentic/centrals/c1/workbenches') return ok([])
    if (url === '/agentic/centrals/c1/queue') return ok([])
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <TasksPane central={central} centrals={[central]} activeTaskId={null} onSelectCentral={() => {}} />
    </QueryClientProvider>,
  )
  await screen.findByText('OPE-33')
  await waitFor(() => expect(client.getQueryData(['agentic', 'workbenches', 'c1'])).toBeDefined())
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('summary na lista da Central de desenvolvimento', () => {
  it('mostra o summary da tarefa abaixo do título, discreto e limitado a 2 linhas', async () => {
    await renderPane()
    const summary = screen.getByText(SUMMARY)
    const className = summary.getAttribute('class') ?? ''
    expect(className).toContain('line-clamp-2')
    expect(className).toContain('text-muted-foreground')
    // Texto completo disponível na dica do navegador.
    expect(summary.getAttribute('title')).toBe(SUMMARY)
  })

  it('tarefa sem summary não renderiza a linha de resumo', async () => {
    await renderPane({ summary: null })
    expect(screen.queryByText(SUMMARY)).toBeNull()
  })
})

describe('lista virtualizada da Central de desenvolvimento', () => {
  it('a altura medida fica presa ao id da tarefa, não à posição (filtrar não sobrepõe linhas)', async () => {
    await renderPane({}, [task({ id: 'b'.repeat(24), code: 'OPE-34', title: 'Outra tarefa', summary: null, order: 2 })])
    await screen.findByText('OPE-34')
    expect(mocks.getItemKey?.(0)).toBe(TASK)
    expect(mocks.getItemKey?.(1)).toBe('b'.repeat(24))
    // A busca deixa só a segunda tarefa: a posição 0 passa a ser dela, com a medida dela.
    fireEvent.change(screen.getByLabelText('Buscar tarefas'), { target: { value: 'OPE-34' } })
    await waitFor(() => expect(screen.queryByText('OPE-33')).toBeNull())
    expect(mocks.getItemKey?.(0)).toBe('b'.repeat(24))
  })
})
