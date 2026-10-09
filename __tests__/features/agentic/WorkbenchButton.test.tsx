/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ centrals: vi.fn(), workbench: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: mocks.centrals, useWorkbenchByTask: mocks.workbench }))

import { WorkbenchButton } from '@/features/agentic/components/WorkbenchButton'
import { workbenchStageLabel, workbenchStageTone } from '@/features/agentic/components/WorkbenchStageBadge'
import { workbenchPath } from '@/features/agentic/constants'

const central = { id: 'c1', productId: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.centrals.mockReturnValue({ data: [central], isLoading: false })
  mocks.workbench.mockReturnValue({ data: null })
})

describe('WorkbenchButton', () => {
  it('sem central para o produto: bloqueado, só ícone', () => {
    render(<WorkbenchButton taskId="t1" productId="outro" />)
    const button = screen.getByRole('button', { name: 'Mesa de trabalho' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.textContent).toBe('')
  })

  it('sem mesa: link para a mesa com ícone neutro', () => {
    render(<WorkbenchButton taskId="t1" productId="p1" />)
    const link = screen.getByRole('link', { name: 'Mesa de trabalho' })
    expect(link.getAttribute('href')).toBe(workbenchPath('c1', 't1'))
    expect(link.className).not.toMatch(/amber|destructive/)
  })

  it('com mesa: o botão assume a cor da etapa, sem o chip no botão', () => {
    mocks.workbench.mockReturnValue({ data: { stage: 'pr_open', runState: 'idle' } })
    render(<WorkbenchButton taskId="t1" productId="p1" />)
    const link = screen.getByRole('link', { name: 'Mesa de trabalho' })
    expect(link.className).toContain('text-amber-300')
    expect(link.textContent).toBe('')
  })

  it('mesa com falha fica em destaque (destrutivo)', () => {
    mocks.workbench.mockReturnValue({ data: { stage: 'implementing', runState: 'failed' } })
    render(<WorkbenchButton taskId="t1" productId="p1" />)
    expect(screen.getByRole('link', { name: 'Mesa de trabalho' }).className).toContain('text-destructive')
  })

  it('a dica mostra o rótulo e o chip da etapa', async () => {
    mocks.workbench.mockReturnValue({ data: { stage: 'plan_review', runState: 'idle' } })
    render(<WorkbenchButton taskId="t1" productId="p1" />)
    fireEvent.focus(screen.getByRole('link', { name: 'Mesa de trabalho' }))
    expect((await screen.findAllByText('Plano pronto')).length).toBeGreaterThan(0)
  })
})

describe('tom e rótulo da etapa', () => {
  it('falha e interrupção sobrepõem a cor da etapa', () => {
    expect(workbenchStageTone('done', 'idle')).toBe('emerald')
    expect(workbenchStageTone('done', 'failed')).toBe('destructive')
    expect(workbenchStageTone('pr_open', 'interrupted')).toBe('muted')
    expect(workbenchStageLabel('plan_review', 'failed')).toBe('Plano pronto: falhou')
  })
})
