/** @vitest-environment jsdom */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeLogDto } from '@/features/time/types'

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

const responseFor = (page: number) => ok({ logs: [logFor(page)], page, totalPages: 2, total: 2, totalMinutes: 60, totalCostUsd: 1 })

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
  mocks.get.mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
    if (url === '/time/logs') return responseFor(config?.params?.page ?? 1)
    return ok(null)
  })
})

afterEach(() => vi.unstubAllGlobals())

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
