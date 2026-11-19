/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { pluginTestEntry, pluginTestRuntime, resetPluginTestRuntime } from '../../helpers/plugins'
import { cleanup, render } from '@testing-library/react'

/** Slot `task.sidebar` (OPE-172, rodada 4): cards de plugins na coluna lateral da tarefa, com a tarefa. */

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/plugins/hooks/usePlugins', async () => (await import('../../helpers/plugins')).pluginHooksMock())
vi.mock('@/features/plugins/client/PluginContribution', async () => (await import('../../helpers/plugins')).pluginContributionMock())
vi.mock('@/features/github/components/RepoIndexProvider', () => ({ useRepoIndex: () => new Map(), repoLabelOption: (repo: string) => ({ repo }) }))
vi.mock('@/features/github/components/shared', () => ({ GithubRepoLabel: () => null }))
vi.mock('@/features/tasks/components/TaskPriorityMenu', () => ({ TaskPriorityMenu: () => null }))
vi.mock('@/features/tasks/components/detail/TaskClientCard', () => ({ TaskClientCard: () => null }))
vi.mock('@/features/tasks/components/detail/TaskEstimateCard', () => ({ TaskEstimateCard: () => null }))

import { TaskDetailSidebar } from '@/features/tasks/components/detail/TaskDetailSidebar'

const task = { id: 't1', code: 'OPE-1', title: 'Tarefa', taskType: 'plugin', priority: 'medium', tags: [], project: { id: 'p1', repo: 'o/app' }, totalTimeLogged: 0, createdAt: '2026-11-19T12:00:00.000Z', updatedAt: '2026-11-19T12:00:00.000Z' } as never

afterEach(() => {
  cleanup()
  resetPluginTestRuntime()
})

describe('TaskDetailSidebar: slot task.sidebar', () => {
  it('monta o card do plugin abaixo dos cards da tarefa, com a tarefa nas props', () => {
    pluginTestRuntime.plugins = [pluginTestEntry('task.sidebar')]
    render(<TaskDetailSidebar task={task} updating={false} onUpdate={vi.fn()} />)
    const widget = document.querySelector('[data-plugin-slot="task.sidebar"] [data-plugin-contribution="relogio:Widget"]')
    expect(JSON.parse(widget?.getAttribute('data-props') ?? 'null')).toEqual({ task: { id: 't1', code: 'OPE-1', title: 'Tarefa', taskType: 'plugin', projectId: 'p1' } })
  })

  it('sem plugin no slot, nada a mais é renderizado', () => {
    render(<TaskDetailSidebar task={task} updating={false} onUpdate={vi.fn()} />)
    expect(document.querySelector('[data-plugin-slot="task.sidebar"]')).toBeNull()
  })
})
