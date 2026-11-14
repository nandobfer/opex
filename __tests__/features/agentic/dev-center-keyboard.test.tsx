/** @vitest-environment happy-dom */

import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralDto } from '@/features/agentic/types'

/** Central de desenvolvimento no celular (OPE-166): a altura desconta o teclado virtual aberto. */

const mocks = vi.hoisted(() => ({ centrals: undefined as unknown }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/features/integrations/hooks/useScrollViewportHeight', () => ({ useScrollViewportHeight: () => 700 }))
vi.mock('@/features/agentic/components/central/CentralPage', () => ({ AGENTIC_SETTINGS_HREF: '/integracoes/ia' }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useAgenticRealtime: () => {}, useCentrals: () => mocks.centrals }))
vi.mock('@/features/tasks/hooks/useTasks', () => ({ useTaskList: () => ({ data: { tasks: [] } }), useTasksRealtime: () => {} }))
vi.mock('@/features/agentic/components/workbench/WorkbenchPane', () => ({ WorkbenchPane: () => <div data-testid="workbench" /> }))
vi.mock('@/features/agentic/components/dev-center/TasksPane', () => ({ TasksPane: () => <div data-testid="tasks-pane" /> }))

import { DevCenterPage } from '@/features/agentic/components/dev-center/DevCenterPage'
import { COMPACT_WORKBENCH_QUERY } from '@/features/agentic/hooks/useCompactWorkbench'

const TASK = 'a'.repeat(24)
const listeners: Array<() => void> = []
const viewport = { height: 800, offsetTop: 0, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn() }

function mockCompact(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({ matches: matches && query === COMPACT_WORKBENCH_QUERY, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
}
const sectionHeight = () => (screen.getByTestId('workbench').closest('section') as HTMLElement).style.getPropertyValue('--dev-center-height')

beforeEach(() => {
  listeners.length = 0
  viewport.height = 800
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  window.localStorage.clear()
  mocks.centrals = { data: [{ id: 'c1', projectId: 'p1', projectName: 'opex' } as unknown as CentralDto], isLoading: false, isError: false, error: null, refetch: vi.fn() }
})
afterEach(() => mockCompact(false))

describe('DevCenterPage · teclado virtual (OPE-166)', () => {
  it('celular com a mesa aberta: o teclado aberto encolhe a central; fechado, volta à altura da área visível', () => {
    mockCompact(true)
    render(<DevCenterPage taskId={TASK} />)
    expect(sectionHeight()).toBe('700px')
    viewport.height = 480
    act(() => listeners.forEach((fn) => fn()))
    expect(sectionHeight()).toBe('380px')
    viewport.height = 800
    act(() => listeners.forEach((fn) => fn()))
    expect(sectionHeight()).toBe('700px')
  })

  it('desktop: o teclado não muda a altura', () => {
    mockCompact(false)
    viewport.height = 480
    render(<DevCenterPage taskId={TASK} />)
    expect(sectionHeight()).toBe('700px')
  })
})
