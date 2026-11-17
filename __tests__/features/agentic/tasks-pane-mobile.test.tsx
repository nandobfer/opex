/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto, WorkbenchSummaryDto } from '@/features/agentic/types'
import type { TaskBoardDto } from '@/features/tasks/board'
import type { TaskDto } from '@/features/tasks/types'

/**
 * Coluna Tarefas no celular (OPE-166, plano v2): abaixo de `lg` a busca fica à vista, filtros e quota abrem
 * em folhas de baixo, a linha mostra o motivo da espera e a coluna em texto e, ao voltar da mesa, a lista
 * rola até a tarefa que estava aberta. Sem `matchMedia` (desktop) nada muda.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), scrollToIndex: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete } }))
// O DOM de teste mede o contêiner de rolagem como 0px; a virtualização devolveria nenhuma linha.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), size: estimateSize(), key: index })),
    measureElement: () => {},
    scrollToIndex: mocks.scrollToIndex,
  }),
}))

import { TasksPane } from '@/features/agentic/components/dev-center/TasksPane'
import { COMPACT_WORKBENCH_QUERY } from '@/features/agentic/hooks/useCompactWorkbench'
import { TasksPaneMobileSkeleton } from '@/features/agentic/components/dev-center/mobile/TasksPaneMobileSkeleton'

const ok = (data: unknown) => ({ data: { success: true, data } })
const central = { id: 'c1', projectId: 'p1', projectName: 'Opex', config: { enabled: true } } as unknown as CentralDto

const board: TaskBoardDto = {
  columns: [{ key: 'doing', name: 'Em andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null }],
  layout: ['doing'],
}

const makeTask = (id: string, code: string): TaskDto =>
  ({
    id,
    code,
    columnId: 'doing',
    order: 1,
    title: `Tarefa ${code}`,
    summary: null,
    tags: [],
    taskType: 'feature',
    priority: 'high',
    archived: false,
    project: { id: 'p1', name: 'Opex', repo: 'nandobfer/opex', sigla: 'OPE' },
    estimate: null,
    createdAt: null,
    updatedAt: null,
  }) as TaskDto

const T1 = 'a'.repeat(24)
const T2 = 'b'.repeat(24)
const tasks = [makeTask(T1, 'OPE-1'), makeTask(T2, 'OPE-2')]

const waiting: WorkbenchSummaryDto = { id: 'w1', taskId: T1, taskCode: 'OPE-1', taskTitle: 'Tarefa OPE-1', stage: 'plan_review', runState: 'idle', buildQueuePosition: null, slotQueue: null, pendingPermissions: 0, pendingForms: 0, forksDonePrompt: false, updatedAt: new Date().toISOString() }

function mockCompact(matches: boolean) {
  if (!matches) {
    // Sem `matchMedia` (SSR e desktop nos testes) vale o desktop.
    Reflect.deleteProperty(window, 'matchMedia')
    return
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({ matches: query === COMPACT_WORKBENCH_QUERY, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
}

async function renderPane(activeTaskId: string | null = null) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/tasks') return ok({ tasks, fetchedAt: new Date().toISOString() })
    if (url === '/tasks/columns') return ok(board)
    if (url === '/agentic/centrals/c1/workbenches') return ok([waiting])
    if (url === '/agentic/centrals/c1/queue') return ok([])
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (active: string | null) => (
    <QueryClientProvider client={client}>
      <TasksPane central={central} centrals={[central]} activeTaskId={active} onSelectCentral={() => {}} />
    </QueryClientProvider>
  )
  const result = render(ui(activeTaskId))
  await screen.findByText('OPE-1')
  await waitFor(() => expect(client.getQueryData(['agentic', 'workbenches', 'c1'])).toBeDefined())
  return { ...result, rerenderActive: (active: string | null) => result.rerender(ui(active)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockCompact(true)
})

describe('TasksPane no celular (OPE-166, plano v2)', () => {
  it('a busca fica à vista sem expandir nada, e filtros e quota saem do topo', async () => {
    await renderPane()
    expect(screen.getByTestId('tasks-mobile-header')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Buscar tarefas' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Expandir filtros' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Quota do OpenCode' })).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'OPE-2' } })
    await waitFor(() => expect(screen.queryByText('OPE-1')).toBeNull())
    expect(screen.getByText('OPE-2')).toBeTruthy()
    // A busca não vira chip nem conta no botão Filtros (tem campo próprio): só o projeto escolhido conta.
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toBeTruthy()
    expect(screen.queryByTestId('filter-chip-search')).toBeNull()
  })

  it('o botão Filtros abre a folha com os mesmos filtros; o filtro ligado conta no selo e vira chip', async () => {
    await renderPane()
    expect(screen.queryByTestId('filter-chip-activeOnly')).toBeNull()
    // O projeto escolhido já é um filtro fora do padrão.
    expect(screen.getByTestId('filter-chip-central')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Filtros (1 ativo)' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Filtros' }))
    expect(sheet.getByText('Só mesas ativas')).toBeTruthy()
    expect(sheet.getByText('Estado da mesa')).toBeTruthy()
    expect(sheet.getByText('Opex')).toBeTruthy()

    fireEvent.click(sheet.getByRole('checkbox', { name: /Só mesas ativas/ }))
    fireEvent.click(await sheet.findByRole('button', { name: 'Ver 1 tarefa' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Filtros (2 ativos)' })).toBeTruthy()
    expect(screen.getByTestId('filter-chip-activeOnly')).toBeTruthy()
  })

  it('o botão da quota abre a folha com o painel da quota', async () => {
    await renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Quota do OpenCode' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Quota do OpenCode' }))
    expect(sheet.getByRole('region', { name: 'Quota do OpenCode' })).toBeTruthy()
  })

  it('a linha mostra em texto o motivo da espera e o nome da coluna (no toque não há dica)', async () => {
    await renderPane()
    expect(screen.getByTestId('task-waiting-reason').textContent).toContain('Aguardando revisão do plano')
    expect(screen.getAllByTestId('task-column-label')[0]!.textContent).toBe('· Em andamento')
  })

  it('a coluna e o skeleton sangram até a borda da tela: largura automática no celular para a margem negativa alargar', async () => {
    await renderPane()
    const card = screen.getByTestId('tasks-pane')
    for (const name of ['max-lg:w-auto', 'max-md:-mx-4', 'md:max-lg:-mx-6', 'lg:w-[340px]']) expect(card.classList.contains(name)).toBe(true)
    render(<TasksPaneMobileSkeleton />)
    const skeleton = screen.getByTestId('tasks-pane-mobile-skeleton')
    for (const name of ['max-lg:w-auto', 'max-md:-mx-4', 'md:max-lg:-mx-6']) expect(skeleton.classList.contains(name)).toBe(true)
  })

  it('ao voltar da mesa, a lista rola até a tarefa que estava aberta', async () => {
    const { rerenderActive } = await renderPane(T2)
    expect(mocks.scrollToIndex).not.toHaveBeenCalled()
    rerenderActive(null)
    await waitFor(() => expect(mocks.scrollToIndex).toHaveBeenCalledWith(1, expect.objectContaining({ align: 'center' })))
  })
})

describe('TasksPane no desktop (OPE-166: nada muda em >= lg)', () => {
  beforeEach(() => mockCompact(false))

  it('mantém os filtros recolhíveis e a quota no topo, sem o cabeçalho do celular nem textos extras na linha', async () => {
    const { rerenderActive } = await renderPane(T2)
    expect(screen.queryByTestId('tasks-mobile-header')).toBeNull()
    expect(screen.getByRole('button', { name: 'Expandir filtros' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Quota do OpenCode' })).toBeTruthy()
    expect(screen.queryByTestId('task-waiting-reason')).toBeNull()
    expect(screen.queryByTestId('task-column-label')).toBeNull()
    rerenderActive(null)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(mocks.scrollToIndex).not.toHaveBeenCalled()
  })
})
