/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/features/tasks/types'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/time/components/TimerProvider', () => ({
  useTimer: () => ({ active: [], timerOf: () => undefined }),
}))

import { TaskCardView } from '@/features/tasks/components/TaskCard'

const task = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa com issue',
  taskType: 'feature',
  priority: 'high',
  archived: false,
  project: { id: 'p1', name: 'Portal', repo: 'o/portal', sigla: 'POR' },
  createdAt: null,
  updatedAt: null,
  issue: { url: 'https://github.com/sipal/app/issues/123', repo: 'sipal/app', number: 123, state: 'open', notice: null },
  ...overrides,
})

const issueLink = () => screen.queryByRole('link', { name: 'Abrir issue sipal/app#123 no GitHub' })

describe('TaskCardView: issue no rodapé', () => {
  it('mostra o botão da issue com #N no rodapé', () => {
    render(<TaskCardView task={task()} />)
    const link = issueLink()!
    expect(link.getAttribute('href')).toBe('https://github.com/sipal/app/issues/123')
    expect(link.textContent).toBe('#123')
    const header = screen.getByText('OPX-1').parentElement!
    expect(within(header).queryByRole('link')).toBeNull()
  })

  it('clicar na issue não abre a tarefa', () => {
    const onOpen = vi.fn()
    render(<TaskCardView task={task()} onOpen={onOpen} />)
    fireEvent.click(issueLink()!)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('sem issue vinculada ou durante o arraste, não mostra o botão', () => {
    const { unmount } = render(<TaskCardView task={task({ issue: null })} />)
    expect(screen.queryByRole('link')).toBeNull()
    unmount()
    render(<TaskCardView task={task()} dragging />)
    expect(issueLink()).toBeNull()
  })
})
