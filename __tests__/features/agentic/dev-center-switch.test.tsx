/** @vitest-environment happy-dom */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto, WorkbenchDto } from '@/features/agentic/types'

/**
 * OPE-188: alternar entre mesas já visitadas mostra o conteúdo na hora — a mesa vem do cache da query e
 * a saída do cache da timeline, sem o skeleton da mesa nem "Carregando a saída…". A releitura (stream)
 * fica pendurada aqui para provar que nada espera por ela.
 */

const mocks = vi.hoisted(() => ({ centrals: undefined as unknown }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/features/integrations/hooks/useScrollViewportHeight', () => ({ useScrollViewportHeight: () => undefined }))
vi.mock('@/features/agentic/components/central/CentralPage', () => ({ AGENTIC_SETTINGS_HREF: '/integracoes/ia?aba=desenvolvimento-agentico' }))
vi.mock('@/features/agentic/hooks/useAgentic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/agentic/hooks/useAgentic')>()),
  useAgenticRealtime: () => {},
  useCentrals: () => mocks.centrals,
}))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskList: () => ({ data: { tasks: [] } }), useTasksRealtime: () => {} }))
vi.mock('@/features/agentic/components/dev-center/TasksPane', () => ({ TasksPane: () => null }))
// A mesa real é grande: aqui ela é só o cabeçalho + a Saída da IA real (stream e Timeline de verdade).
vi.mock('@/features/agentic/components/workbench/WorkbenchView', async () => {
  const { useWorkbenchStream } = await import('@/features/agentic/hooks/useWorkbenchStream')
  const { Timeline } = await import('@/features/agentic/components/workbench/Timeline')
  return {
    WorkbenchView: ({ workbench }: { workbench: WorkbenchDto }) => {
      const { timeline } = useWorkbenchStream(workbench.id)
      return (
        <div>
          <h2>Mesa {workbench.id}</h2>
          <Timeline timeline={timeline} running={false} />
        </div>
      )
    },
  }
})

import { DevCenterPage } from '@/features/agentic/components/dev-center/DevCenterPage'
import { agenticKey } from '@/features/agentic/hooks/useAgentic'
import { clearTimelineCache, writeTimelineCache } from '@/features/agentic/timeline-cache'
import { withBasePath } from '@/lib/base-path'

const central = { id: 'c1', projectId: 'p1', projectName: 'Opex', sigla: 'OPE', repo: null } as unknown as CentralDto
const workbench = (id: string, taskId: string) => ({ id, taskId, centralId: 'c1', stage: 'planning' }) as unknown as WorkbenchDto
const eventsUrl = (id: string) => withBasePath(`/api/agentic/workbenches/${id}/events`)

beforeEach(() => {
  mocks.centrals = { data: [central], isLoading: false, isError: false }
  clearTimelineCache()
  // Releitura que nunca termina: a tela não pode depender dela para mostrar o que já conhece.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})
afterEach(() => vi.unstubAllGlobals())

describe('DevCenterPage — troca de mesa', () => {
  it('voltar a mesas já visitadas mostra mesa e saída na hora, sem skeleton nem "Carregando a saída…"', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } })
    client.setQueryData(agenticKey('workbench', 't1'), workbench('w1', 't1'))
    client.setQueryData(agenticKey('workbench', 't2'), workbench('w2', 't2'))
    writeTimelineCache(eventsUrl('w1'), { items: [{ kind: 'text', key: 'x1', text: 'Saída da mesa 1' }], reasoning: false, loaded: true })
    writeTimelineCache(eventsUrl('w2'), { items: [{ kind: 'text', key: 'x2', text: 'Saída da mesa 2' }], reasoning: false, loaded: true })

    const view = render(
      <QueryClientProvider client={client}>
        <DevCenterPage taskId="t1" />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Mesa w1' })).toBeTruthy()
    expect(screen.getByText('Saída da mesa 1')).toBeTruthy()

    view.rerender(
      <QueryClientProvider client={client}>
        <DevCenterPage taskId="t2" />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Mesa w2' })).toBeTruthy()
    expect(screen.getByText('Saída da mesa 2')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Mesa w1' })).toBeNull()
    expect(screen.queryByText(/Carregando a saída/)).toBeNull()
    expect(screen.queryByLabelText('Carregando a mesa')).toBeNull()
  })
})
