/** @vitest-environment jsdom */

import React, { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  params: {} as { taskId?: string },
  mounts: 0,
}))

vi.mock('next/navigation', () => ({ useParams: () => mocks.params }))
vi.mock('@/features/github/components/RepoIndexProvider', () => ({
  RepoIndexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
// Conta as montagens da central: trocar de tarefa não pode remontá-la.
vi.mock('@/features/agentic/components/dev-center/DevCenterPage', () => ({
  DevCenterPage: ({ taskId }: { taskId: string | null }) => {
    useEffect(() => {
      mocks.mounts += 1
    }, [])
    return <section data-testid="dev-center">{taskId ?? 'sem-tarefa'}</section>
  },
}))

import DesenvolvimentoLayout from '@/app/(app)/desenvolvimento/layout'
import DesenvolvimentoPage from '@/app/(app)/desenvolvimento/page'
import DesenvolvimentoTaskPage from '@/app/(app)/desenvolvimento/[taskId]/page'

const TASK_A = 'a'.repeat(24)
const TASK_B = 'b'.repeat(24)

beforeEach(() => {
  mocks.params = {}
  mocks.mounts = 0
})

describe('rota da Central de desenvolvimento', () => {
  it('trocar de tarefa não remonta a central (só muda a tarefa)', () => {
    mocks.params = { taskId: TASK_A }
    const { rerender } = render(<DesenvolvimentoLayout><DesenvolvimentoTaskPage /></DesenvolvimentoLayout>)
    const section = screen.getByTestId('dev-center')
    expect(section.textContent).toBe(TASK_A)

    mocks.params = { taskId: TASK_B }
    rerender(<DesenvolvimentoLayout><DesenvolvimentoTaskPage /></DesenvolvimentoLayout>)

    expect(screen.getByTestId('dev-center')).toBe(section)
    expect(section.textContent).toBe(TASK_B)
    expect(mocks.mounts).toBe(1)
  })

  it('abrir uma tarefa a partir de /desenvolvimento mantém a mesma central montada', () => {
    const { rerender } = render(<DesenvolvimentoLayout><DesenvolvimentoPage /></DesenvolvimentoLayout>)
    const section = screen.getByTestId('dev-center')
    expect(section.textContent).toBe('sem-tarefa')

    mocks.params = { taskId: TASK_A }
    // O Next troca o filho (outro arquivo de página), mas o layout continua montado.
    rerender(<DesenvolvimentoLayout><DesenvolvimentoTaskPage key="task" /></DesenvolvimentoLayout>)

    expect(screen.getByTestId('dev-center')).toBe(section)
    expect(section.textContent).toBe(TASK_A)
    expect(mocks.mounts).toBe(1)
  })
})
