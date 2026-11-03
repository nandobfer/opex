/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Central de desenvolvimento em tempo real (OPE-124): a página assina pelo Pusher a lista de tarefas
 * (`tasks-updated`/`task-columns-updated`) além das mesas e da fila (`agentic-updated`), para que uma
 * tarefa que entra na fila do Opencode apareça sem recarregar. Hooks de tempo real reais; o resto mockado.
 */

type Handler = (payload?: unknown) => void

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  handlers: new Map<string, Handler[]>(),
  unbind: vi.fn(),
}))

vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))
vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/features/integrations/hooks/useScrollViewportHeight', () => ({ useScrollViewportHeight: () => undefined }))
vi.mock('@/features/agentic/components/central/CentralPage', () => ({ AGENTIC_SETTINGS_HREF: '/integracoes/ia?aba=desenvolvimento-agentico' }))
vi.mock('@/features/agentic/components/workbench/WorkbenchPane', () => ({ WorkbenchPane: () => null }))
vi.mock('@/features/agentic/components/dev-center/TasksPane', () => ({ TasksPane: () => null }))
vi.mock('@/features/agentic/hooks/useAgentic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/agentic/hooks/useAgentic')>()),
  useCentrals: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/tasks/hooks/useTasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tasks/hooks/useTasks')>()),
  useTaskList: () => ({ data: { tasks: [] } }),
}))

import { DevCenterPage } from '@/features/agentic/components/dev-center/DevCenterPage'
import { agenticKey, AGENTIC_QUERY_KEY } from '@/features/agentic/hooks/useAgentic'
import { taskDetailKey, TASKS_QUERY_KEY } from '@/features/tasks/hooks/useTasks'
import { AGENTIC_UPDATED_EVENT } from '@/features/agentic/constants'
import { TASK_COLUMNS_UPDATED_EVENT, TASKS_UPDATED_EVENT } from '@/features/tasks/constants'
import { appChannel } from '@/lib/pusher/channel-names'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({
    bind: (event: string, handler: Handler) => mocks.handlers.set(event, [...(mocks.handlers.get(event) ?? []), handler]),
    unbind: mocks.unbind,
  })
})
afterEach(() => cleanup())

function setup() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
  const view = render(
    <QueryClientProvider client={client}>
      <DevCenterPage taskId={null} />
    </QueryClientProvider>,
  )
  const emit = (event: string, payload?: unknown) => {
    for (const handler of mocks.handlers.get(event) ?? []) handler(payload)
  }
  const keys = () => invalidate.mock.calls.map(([filters]) => (filters as { queryKey?: unknown }).queryKey)
  return { invalidate, view, emit, keys }
}

describe('DevCenterPage em tempo real', () => {
  it('tarefa que entra na fila (tasks-updated) recarrega a lista de tarefas, o detalhe e a fila', () => {
    const { emit, keys } = setup()
    expect(mocks.acquire).toHaveBeenCalledWith(appChannel())
    emit(TASKS_UPDATED_EVENT, { ids: ['t1'] })
    expect(keys()).toEqual(expect.arrayContaining([[TASKS_QUERY_KEY, 'list'], taskDetailKey('t1'), agenticKey('queue')]))
  })

  it('mesa aberta, avançada ou excluída (agentic-updated) recarrega as consultas do desenvolvimento agêntico', () => {
    const { emit, keys } = setup()
    emit(AGENTIC_UPDATED_EVENT, { centralId: 'c1', workbenchId: 'w1', taskId: 't1' })
    expect(keys()).toEqual([[AGENTIC_QUERY_KEY]])
  })

  it('colunas do quadro alteradas recarregam o quadro e a lista', () => {
    const { emit, keys } = setup()
    emit(TASK_COLUMNS_UPDATED_EVENT)
    expect(keys()).toEqual(expect.arrayContaining([[TASKS_QUERY_KEY, 'board'], [TASKS_QUERY_KEY, 'list']]))
  })

  it('desmontar desfaz as assinaturas e libera o canal tantas vezes quanto foi adquirido', () => {
    const { view } = setup()
    const acquired = mocks.acquire.mock.calls.length
    view.unmount()
    expect(mocks.unbind).toHaveBeenCalledWith(TASKS_UPDATED_EVENT, expect.any(Function))
    expect(mocks.unbind).toHaveBeenCalledWith(AGENTIC_UPDATED_EVENT, expect.any(Function))
    expect(mocks.release).toHaveBeenCalledTimes(acquired)
  })

  it('sem Pusher configurado, não assina nada nem recarrega sozinho', () => {
    mocks.available.mockReturnValue(false)
    const { invalidate } = setup()
    expect(mocks.acquire).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })
})
