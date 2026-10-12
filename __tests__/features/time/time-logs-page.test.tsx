/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeLogDto } from '@/features/time/types'
import type { ProjectRef } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}))

import { TimeLogsPage } from '@/features/time/components/TimeLogsPage'

/** Stub de `IntersectionObserver` (jsdom não implementa) com disparo manual da interseção. */
class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []
  readonly callback: IntersectionObserverCallback
  targets: Element[] = []

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    IntersectionObserverStub.instances.push(this)
  }

  observe(target: Element) {
    this.targets.push(target)
  }

  unobserve(target: Element) {
    this.targets = this.targets.filter((item) => item !== target)
  }

  disconnect() {
    this.targets = []
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  trigger(isIntersecting: boolean) {
    const entries = this.targets.map((target) => ({ target, isIntersecting })) as unknown as IntersectionObserverEntry[]
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

const ok = (data: unknown) => ({ data: { success: true, data } })

const PROJECT: ProjectRef = { id: 'a'.repeat(24), name: 'opex', repo: 'nandobfer/opex', sigla: 'OPX' }

function logFor(page: number): TimeLogDto {
  return {
    id: `${page}`.padEnd(24, '0'),
    taskId: `${page}`.padEnd(24, 'a'),
    workbenchId: `wb-${page}`,
    taskCode: `OPX-${page}`,
    taskTitle: `Tarefa ${page}`,
    stage: 'implementing',
    agent: 'build',
    model: 'openai/gpt',
    startTime: `2026-10-0${page}T10:00:00.000Z`,
    endTime: `2026-10-0${page}T10:30:00.000Z`,
    duration: 30,
    costUsd: 0.5,
    inputTokens: 120,
    outputTokens: 45,
    reasoningTokens: 10,
    description: 'Desenvolvimento agêntico · Implementando',
    active: false,
  }
}

interface LogParams {
  from?: string
  to?: string
  page?: number
  projects?: string
  types?: string
}

const pageFor = (page: number) => ({ logs: [logFor(page)], page, totalPages: 2, total: 2, totalMinutes: 60, totalCostUsd: 1 })
const emptyPage = { logs: [] as TimeLogDto[], page: 1, totalPages: 1, total: 0, totalMinutes: 0, totalCostUsd: 0 }

const logCalls = () => mocks.get.mock.calls.filter(([url]) => url === '/time/logs')
const lastLogParams = (): LogParams => (logCalls().at(-1)?.[1] as { params?: LogParams } | undefined)?.params ?? {}
const someLogCall = (predicate: (params: LogParams) => boolean) =>
  logCalls().some(([, config]) => predicate((config as { params?: LogParams } | undefined)?.params ?? {}))

function mockApi({ logs = pageFor, projects = [PROJECT] }: { logs?: (page: number) => unknown; projects?: readonly ProjectRef[] | 'error' } = {}) {
  mocks.get.mockImplementation(async (url: string, config?: { params?: LogParams }) => {
    if (url === '/time/logs') return ok(logs(config?.params?.page ?? 1))
    if (url === '/tasks/options') {
      if (projects === 'error') throw new Error('falhou')
      return ok({ projects })
    }
    return ok(null)
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimeLogsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  IntersectionObserverStub.instances = []
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  window.history.replaceState({}, '', '/')
  mockApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('TimeLogsPage — infinite scrolling', () => {
  it('carrega a próxima página ao chegar ao fim, sem botão manual', async () => {
    renderPage()
    await screen.findByText('Tarefa 1')
    expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull()

    await waitFor(() => expect(IntersectionObserverStub.instances.length).toBeGreaterThan(0))
    await act(async () => {
      IntersectionObserverStub.instances.at(-1)!.trigger(true)
    })

    await screen.findByText('Tarefa 2')
    expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull()
  })

  it('sem IntersectionObserver mostra o botão "Carregar mais" como fallback', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    renderPage()
    await screen.findByText('Tarefa 1')
    expect(screen.getByRole('button', { name: /Carregar mais/ })).toBeTruthy()
  })
})

describe('TimeLogsPage — filtros de repositório e tipo', () => {
  it('envia o recorte escolhido à API e grava na URL', async () => {
    renderPage()
    await screen.findByText('Tarefa 1')

    fireEvent.click(screen.getByRole('button', { name: 'Repositório' }))
    fireEvent.click(await screen.findByText('nandobfer/opex'))
    fireEvent.click(screen.getByRole('button', { name: 'Tipo' }))
    fireEvent.click(await screen.findByText('Nova Funcionalidade'))
    fireEvent.click(screen.getByText('Correção'))

    await waitFor(() => expect(new URLSearchParams(window.location.search).get('types')).toBe('feature,bugfix'))
    expect(someLogCall((params) => params.projects === PROJECT.id && params.types === 'feature,bugfix')).toBe(true)
    expect(new URLSearchParams(window.location.search).get('projects')).toBe(PROJECT.id)
  })

  it('mantém os filtros ao carregar a próxima página', async () => {
    renderPage()
    await screen.findByText('Tarefa 1')

    fireEvent.click(screen.getByRole('button', { name: 'Tipo' }))
    fireEvent.click(await screen.findByText('Nova Funcionalidade'))
    await waitFor(() => expect(lastLogParams().types).toBe('feature'))

    await waitFor(() => expect(IntersectionObserverStub.instances.length).toBeGreaterThan(0))
    await act(async () => {
      IntersectionObserverStub.instances.at(-1)!.trigger(true)
    })

    await screen.findByText('Tarefa 2')
    expect(lastLogParams()).toMatchObject({ types: 'feature', page: 2 })
  })

  it('restaura o recorte da URL ao abrir a página', async () => {
    window.history.replaceState({}, '', `/?projects=${PROJECT.id}&types=bugfix`)
    renderPage()
    await screen.findByText('Tarefa 1')

    await waitFor(() => expect(lastLogParams()).toMatchObject({ projects: PROJECT.id, types: 'bugfix' }))
  })

  it('"Limpar filtros" volta ao padrão e limpa a URL', async () => {
    window.history.replaceState({}, '', `/?projects=${PROJECT.id}&types=bugfix`)
    renderPage()
    await screen.findByText('Tarefa 1')
    await waitFor(() => expect(lastLogParams().projects).toBe(PROJECT.id))

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(lastLogParams().projects).toBeUndefined())
    expect(new URLSearchParams(window.location.search).get('projects')).toBeNull()
    expect(new URLSearchParams(window.location.search).get('types')).toBeNull()
  })

  it('sem resultados com filtros o vazio explica e oferece limpar', async () => {
    mockApi({ logs: () => emptyPage })
    window.history.replaceState({}, '', '/?types=bugfix')
    renderPage()

    expect(await screen.findByText('Nenhum apontamento com estes filtros')).toBeTruthy()
    const clearButtons = screen.getAllByRole('button', { name: 'Limpar filtros' })
    // Cartão de filtros + a ação do estado vazio.
    expect(clearButtons.length).toBeGreaterThan(1)
    fireEvent.click(clearButtons.at(-1)!)

    expect(await screen.findByText('Nenhum apontamento neste período')).toBeTruthy()
    expect(new URLSearchParams(window.location.search).get('types')).toBeNull()
  })

  it('falha ao carregar os repositórios avisa e oferece tentar novamente', async () => {
    mockApi({ projects: 'error' })
    renderPage()
    await screen.findByText('Tarefa 1')

    expect(await screen.findByText(/Não foi possível carregar os repositórios/)).toBeTruthy()
    const before = mocks.get.mock.calls.filter(([url]) => url === '/tasks/options').length
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(mocks.get.mock.calls.filter(([url]) => url === '/tasks/options').length).toBeGreaterThan(before))
  })
})
