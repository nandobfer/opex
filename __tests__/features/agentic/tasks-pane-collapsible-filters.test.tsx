/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto } from '@/features/agentic/types'
import type { TaskBoardDto } from '@/features/tasks/board'
import type { TaskDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete } }))
// O DOM de teste mede o contêiner de rolagem como 0px; a virtualização devolveria nenhuma linha.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), size: estimateSize(), key: index })),
    measureElement: () => {},
  }),
}))

import { TasksPane } from '@/features/agentic/components/dev-center/TasksPane'
import { ALL_CENTRALS_ID } from '@/features/agentic/dev-center-central'
import { DEV_CENTER_FILTERS_KEY } from '@/features/agentic/dev-center-filters'

const ok = (data: unknown) => ({ data: { success: true, data } })
const central = { id: 'c1', projectId: 'p1', projectName: 'Opex', config: { enabled: true } } as unknown as CentralDto
const board: TaskBoardDto = {
  columns: [{ key: 'doing', name: 'Em andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null }],
  layout: ['doing'],
}
const task = {
  id: 'a'.repeat(24),
  code: 'OPE-41',
  columnId: 'doing',
  order: 1,
  title: 'Filtros recolhidos',
  summary: null,
  tags: [],
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'Opex', repo: 'nandobfer/opex', sigla: 'OPE' },
  estimate: null,
  createdAt: null,
  updatedAt: null,
} as TaskDto

async function renderPane(selected: CentralDto | null = null, onSelectCentral = vi.fn()) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/tasks') return ok({ tasks: [task], fetchedAt: new Date().toISOString() })
    if (url === '/tasks/columns') return ok(board)
    if (url.startsWith('/agentic/centrals/')) return ok([])
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TasksPane central={selected} centrals={[central]} activeTaskId={null} onSelectCentral={onSelectCentral} />
    </QueryClientProvider>,
  )
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/tasks', expect.anything()))
  return onSelectCentral
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('filtros recolhíveis da coluna Tarefas da Central de desenvolvimento', () => {
  it('começa recolhida: só o resumo, sem os filtros completos nem botão de limpar', async () => {
    await renderPane()
    const toggle = screen.getByRole('button', { name: 'Expandir filtros' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('switch', { name: /Só mesas ativas/ })).toBeNull()
    expect(screen.queryByLabelText('Buscar tarefas')).toBeNull()
    expect(screen.getByText('Nenhum filtro ativo · clique para filtrar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('expande pelo chevron com a busca abaixo dos demais filtros e recolhe de novo', async () => {
    await renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir filtros' }))
    const search = screen.getByLabelText('Buscar tarefas')
    const states = screen.getByRole('button', { name: 'Estado da mesa' })
    expect(states.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Nenhum filtro ativo · clique para filtrar')).toBeNull()

    const collapse = screen.getByRole('button', { name: 'Recolher filtros' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(collapse)
    expect(screen.queryByLabelText('Buscar tarefas')).toBeNull()
  })

  it('clicar no resumo recolhido também expande', async () => {
    await renderPane()
    fireEvent.click(screen.getByText('Nenhum filtro ativo · clique para filtrar'))
    expect(screen.getByLabelText('Buscar tarefas')).toBeTruthy()
  })

  it('mostra os filtros salvos como chips (no máximo 2 + "+N") e o × remove só aquele filtro', async () => {
    window.localStorage.setItem(DEV_CENTER_FILTERS_KEY, JSON.stringify({ activeOnly: true, search: 'OPE', columns: ['doing'], allColumns: false, states: ['planning'] }))
    await renderPane()
    expect(screen.getByTestId('filter-chip-activeOnly')).toBeTruthy()
    expect(screen.getByTestId('filter-chip-columns')).toBeTruthy()
    expect(screen.queryByTestId('filter-chip-states')).toBeNull()
    expect(screen.getByText('+2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Só mesas ativas' }))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DEV_CENTER_FILTERS_KEY)!)).toMatchObject({ activeOnly: false, states: ['planning'] }))
    // Remover um chip não expande a área.
    expect(screen.queryByLabelText('Buscar tarefas')).toBeNull()
  })

  it('com um projeto escolhido mostra o chip do projeto; o × volta para "Todos os projetos"', async () => {
    const onSelectCentral = await renderPane(central)
    expect(screen.getByTestId('filter-chip-central').textContent).toContain('Projeto: Opex')
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Projeto: Opex' }))
    expect(onSelectCentral).toHaveBeenCalledWith(ALL_CENTRALS_ID)
  })
})
