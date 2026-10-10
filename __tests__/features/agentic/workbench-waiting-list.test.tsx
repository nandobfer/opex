/** @vitest-environment jsdom */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto, WorkbenchSummaryDto } from '@/features/agentic/types'
import type { TaskBoardDto } from '@/features/tasks/board'
import type { TaskDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete } }))
// O jsdom mede o contêiner de rolagem como 0px; a virtualização devolveria nenhuma linha.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), size: estimateSize(), key: index })),
  }),
}))

import { TasksPane } from '@/features/agentic/components/dev-center/TasksPane'

const TASK = 'a'.repeat(24)
const ok = (data: unknown) => ({ data: { success: true, data } })

const central = { id: 'c1', projectId: 'p1', projectName: 'Opex', config: { enabled: true } } as unknown as CentralDto

const board: TaskBoardDto = {
  columns: [{ key: 'doing', name: 'Em andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null }],
  layout: ['doing'],
}

const task = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: TASK,
  code: 'OPE-16',
  columnId: 'doing',
  order: 1,
  title: 'Warning na lista',
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'Opex', repo: 'nandobfer/opex', sigla: 'OPE' },
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

const workbench = (overrides: Partial<WorkbenchSummaryDto> = {}): WorkbenchSummaryDto => ({
  id: 'b'.repeat(24),
  taskId: TASK,
  taskCode: 'OPE-16',
  taskTitle: 'Warning na lista',
  stage: 'plan_review',
  runState: 'idle',
  buildQueuePosition: null,
  pendingPermissions: 0,
  pendingForms: 0,
  updatedAt: new Date().toISOString(),
  ...overrides,
})

async function renderPane(workbenches: WorkbenchSummaryDto[]) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/tasks') return ok({ tasks: [task()], fetchedAt: new Date().toISOString() })
    if (url === '/tasks/columns') return ok(board)
    if (url === '/agentic/centrals/c1/workbenches') return ok(workbenches)
    if (url === '/agentic/centrals/c1/queue') return ok([])
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <TasksPane central={central} centrals={[central]} activeTaskId={null} onSelectCentral={() => {}} />
    </QueryClientProvider>,
  )
  await screen.findAllByText('OPE-16')
  await waitFor(() => expect(client.getQueryData(['agentic', 'workbenches', 'c1'])).toBeDefined())
  return result
}

const pingCount = () => document.querySelectorAll('.animate-ping').length

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('warning na lista de mesas da Central de desenvolvimento', () => {
  it('mesa aguardando o usuário mostra o warning com o motivo', async () => {
    await renderPane([workbench()])
    expect(screen.getByRole('img', { name: 'Aguardando revisão do plano' })).toBeTruthy()
    expect(screen.getByText('Plano pronto')).toBeTruthy()
  })

  it('permissão pendente durante o turno mostra o warning e o chip não pulsa mais', async () => {
    await renderPane([workbench({ stage: 'implementing', runState: 'running', pendingPermissions: 1 })])
    expect(screen.getByRole('img', { name: 'Aguardando você permitir uma ação' })).toBeTruthy()
    expect(pingCount()).toBe(0)
  })

  it('agente executando não mostra warning e o chip pulsa', async () => {
    await renderPane([workbench({ stage: 'implementing', runState: 'running' })])
    expect(screen.queryByRole('img', { name: /Aguardando/ })).toBeNull()
    expect(pingCount()).toBeGreaterThan(0)
  })

  it('mesa na fila do build mostra a fila e nenhum warning', async () => {
    await renderPane([workbench({ stage: 'build_queued', runState: 'idle', buildQueuePosition: 1 })])
    expect(screen.getByText(/Na fila do build/)).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Aguardando/ })).toBeNull()
  })

  it('mesa concluída não gera warning', async () => {
    await renderPane([workbench({ stage: 'done', runState: 'idle' })])
    expect(screen.getByText('Concluída')).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Aguardando/ })).toBeNull()
  })
})
