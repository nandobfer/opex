/** @vitest-environment jsdom */

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
// O jsdom mede o contêiner de rolagem como 0px; a virtualização devolveria nenhuma linha.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * estimateSize(), size: estimateSize(), key: index })),
    measureElement: () => {},
  }),
}))

import { TasksPane } from '@/features/agentic/components/dev-center/TasksPane'
import { DEV_CENTER_FILTERS_KEY } from '@/features/agentic/dev-center-filters'

const TASK = 'a'.repeat(24)
const ok = (data: unknown) => ({ data: { success: true, data } })

// Sem `repo`: o seletor cai no nome do projeto ("Opex").
const central = { id: 'c1', projectId: 'p1', projectName: 'Opex', config: { enabled: true } } as unknown as CentralDto

const board: TaskBoardDto = {
  columns: [{ key: 'doing', name: 'Em andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null }],
  layout: ['doing'],
}

const task: TaskDto = {
  id: TASK,
  code: 'OPE-41',
  columnId: 'doing',
  order: 1,
  title: 'Layout da coluna de tarefas',
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

async function renderPane(selected: CentralDto | null = central) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/tasks') return ok({ tasks: [task], fetchedAt: new Date().toISOString() })
    if (url === '/tasks/columns') return ok(board)
    if (url === '/agentic/centrals/c1/workbenches') return ok([])
    if (url === '/agentic/centrals/c1/queue') return ok([])
    return ok(null)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <TasksPane central={selected} centrals={[central]} activeTaskId={null} onSelectCentral={() => {}} />
    </QueryClientProvider>,
  )
  await screen.findByText('OPE-41')
  await waitFor(() => expect(client.getQueryData(['agentic', 'workbenches', 'c1'])).toBeDefined())
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('cabeçalho da coluna de tarefas da Central de desenvolvimento', () => {
  it('renderiza o atalho de configurações sem TooltipProvider fornecido pela página', async () => {
    await renderPane()
    expect(screen.getByRole('link', { name: 'Configurar central selecionada' }).getAttribute('href')).toBe('/integracoes/ia/centrais/c1')
  })

  it('põe o título "Tarefas" acima do seletor da central', async () => {
    await renderPane()
    const heading = screen.getByRole('heading', { name: /Tarefas/ })
    const picker = screen.getByRole('button', { name: 'Opex' })
    expect(heading.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('engrenagem no fim da linha do título abre a central selecionada', async () => {
    await renderPane()
    const settings = screen.getByRole('link', { name: 'Configurar central selecionada' })
    const heading = screen.getByRole('heading', { name: /Tarefas/ })
    expect(settings.getAttribute('href')).toBe('/integracoes/ia/centrais/c1')
    expect(heading.parentElement?.contains(settings)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Restaurar filtros' })).toBeNull()
  })

  it('não mostra "Restaurar filtros" nem com filtros diferentes do padrão', async () => {
    window.localStorage.setItem(DEV_CENTER_FILTERS_KEY, JSON.stringify({ search: '', columns: ['doing'] }))
    await renderPane()
    expect(screen.queryByRole('button', { name: 'Restaurar filtros' })).toBeNull()
    // O filtro persistido aparece aplicado no seletor (a coluna escolhida ocupa a linha inteira).
    expect(screen.getByRole('button', { name: /Em andamento/ })).toBeTruthy()
  })

  it('mantém a busca por código/título e o filtro de colunas', async () => {
    await renderPane()
    const order = [
      screen.getByRole('checkbox', { name: /Só mesas ativas/ }),
      screen.getByRole('button', { name: 'Opex' }),
      screen.getByRole('button', { name: /Colunas|Em andamento|selecionados/ }),
      screen.getByRole('button', { name: 'Estado da mesa' }),
      screen.getByLabelText('Buscar tarefas'),
    ]
    for (let index = 1; index < order.length; index++) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('filtra pelo estado da mesa: "Sem mesa" mantém a tarefa sem mesa e "Planejando" a esconde', async () => {
    window.localStorage.setItem(DEV_CENTER_FILTERS_KEY, JSON.stringify({ search: '', columns: ['doing'], states: ['no_workbench'] }))
    await renderPane()
    expect(screen.getByText('OPE-41')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Sem mesa/ })).toBeTruthy()

    window.localStorage.setItem(DEV_CENTER_FILTERS_KEY, JSON.stringify({ search: '', columns: ['doing'], states: ['planning'] }))
    window.dispatchEvent(new StorageEvent('storage', { key: DEV_CENTER_FILTERS_KEY }))
    await waitFor(() => expect(screen.queryByText('OPE-41')).toBeNull())
    expect(screen.getByText('Nenhuma tarefa encontrada')).toBeTruthy()
  })

  it('"Só mesas ativas" começa desligada, esconde a tarefa sem mesa e fica salva no navegador', async () => {
    await renderPane()
    const toggle = screen.getByRole('checkbox', { name: /Só mesas ativas/ }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
    expect(screen.getByText('OPE-41')).toBeTruthy()

    fireEvent.click(toggle)
    await waitFor(() => expect(screen.queryByText('OPE-41')).toBeNull())
    expect(toggle.checked).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(DEV_CENTER_FILTERS_KEY)!)).toMatchObject({ activeOnly: true })

    fireEvent.click(toggle)
    expect(await screen.findByText('OPE-41')).toBeTruthy()
  })

  it('em "Todos os projetos" o seletor mostra a opção e a lista usa as tarefas de todas as centrais', async () => {
    await renderPane(null)
    expect(screen.getByRole('button', { name: 'Todos os projetos' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Tarefas de todos os projetos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Configurar centrais de desenvolvimento' }).getAttribute('href')).toBe('/integracoes/ia?aba=desenvolvimento-agentico&abaAgentic=centrais')
  })
})
