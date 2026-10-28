/** @vitest-environment happy-dom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { TaskSummaryCard } from '@/features/tasks/components/detail/TaskSummaryCard'

describe('TaskSummaryCard', () => {
  it('renderiza o resumo com fonte discreta (text-xs e muted)', () => {
    render(<TaskSummaryCard summary="Implementa o resumo de 1 linha" />)
    const text = screen.getByText('Implementa o resumo de 1 linha')
    expect(text.className).toContain('text-xs')
    expect(text.className).toContain('text-muted-foreground')
  })

  it('não exibe o rótulo "Resumo (IA)"', () => {
    render(<TaskSummaryCard summary="Qualquer resumo" />)
    expect(screen.queryByText('Resumo (IA)')).toBeNull()
  })
})
