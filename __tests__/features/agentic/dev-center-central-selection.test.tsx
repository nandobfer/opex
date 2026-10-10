/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto } from '@/features/agentic/types'
import type { TaskDto } from '@/features/tasks/types'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  centrals: undefined as unknown,
  tasks: undefined as unknown,
}))

const TASK = 'a'.repeat(24)
const CENTRAL_KEY = 'opex:dev-center-central:v1'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/features/integrations/hooks/useScrollViewportHeight', () => ({ useScrollViewportHeight: () => undefined }))
vi.mock('@/features/agentic/components/central/CentralPage', () => ({ AGENTIC_SETTINGS_HREF: '/integracoes/ia?aba=desenvolvimento-agentico' }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({
  useAgenticRealtime: () => {},
  useCentrals: () => mocks.centrals,
}))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskList: () => mocks.tasks }))
vi.mock('@/features/agentic/components/workbench/WorkbenchPane', () => ({ WorkbenchPane: () => <div data-testid="workbench" /> }))
// A coluna de tarefas é reduzida ao essencial: mostra a central ativa e dispara a troca.
vi.mock('@/features/agentic/components/dev-center/TasksPane', () => ({
  TasksPane: ({ central, onSelectCentral }: { central: CentralDto; onSelectCentral: (id: string) => void }) => (
    <div>
      <span data-testid="active-central">{central.id}</span>
      <button type="button" onClick={() => onSelectCentral('c2')}>Trocar para c2</button>
    </div>
  ),
}))

import { DevCenterPage } from '@/features/agentic/components/dev-center/DevCenterPage'

const central = (id: string, projectId: string): CentralDto =>
  ({ id, projectId, projectName: `Projeto ${id}`, sigla: id.toUpperCase(), repo: null }) as unknown as CentralDto

const task = {
  id: TASK,
  code: 'OPE-42',
  columnId: 'doing',
  order: 1,
  title: 'Trocar de central com a mesa aberta',
  summary: null,
  tags: [],
  taskType: 'fix',
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'Projeto c1', repo: null, sigla: 'P1' },
  estimate: null,
  createdAt: null,
  updatedAt: null,
} as unknown as TaskDto

const activeCentral = () => screen.getByTestId('active-central').textContent
const stored = () => window.localStorage.getItem(CENTRAL_KEY)

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.localStorage.setItem(CENTRAL_KEY, JSON.stringify({ id: 'c1' }))
  mocks.centrals = { data: [central('c1', 'p1'), central('c2', 'p2')], isLoading: false, isError: false, error: null, refetch: vi.fn() }
  mocks.tasks = { data: { tasks: [task] } }
})

describe('troca de central na Central de desenvolvimento (OPE-42)', () => {
  it('troca de central com a mesa aberta mantém a escolha depois de limpar a tarefa da URL', () => {
    const { rerender } = render(<DevCenterPage taskId={TASK} />)
    // A tarefa (projeto p1) manda na central: a central efetiva é a c1.
    expect(activeCentral()).toBe('c1')

    fireEvent.click(screen.getByRole('button', { name: 'Trocar para c2' }))
    expect(mocks.replace).toHaveBeenCalledTimes(1)

    // A navegação (`router.replace`) é assíncrona: a URL limpa chega num render seguinte, com a
    // troca já gravada. Antes da correção, o efeito regravava a central da tarefa (c1) por cima.
    rerender(<DevCenterPage taskId={null} />)

    expect(activeCentral()).toBe('c2')
    expect(stored()).toBe(JSON.stringify({ id: 'c2' }))
  })

  it('sem tarefa aberta a troca de central continua funcionando', () => {
    render(<DevCenterPage taskId={null} />)
    expect(activeCentral()).toBe('c1')

    fireEvent.click(screen.getByRole('button', { name: 'Trocar para c2' }))

    expect(activeCentral()).toBe('c2')
    expect(stored()).toBe(JSON.stringify({ id: 'c2' }))
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
