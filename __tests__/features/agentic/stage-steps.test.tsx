/** @vitest-environment jsdom */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { StageSteps } from '@/features/agentic/components/workbench/StageSteps'

describe('StageSteps · fluxo da mesa', () => {
  it('no fluxo Publicar prévia mostra o passo "Prévia"', () => {
    render(<StageSteps stage="preview" runState="idle" flow="preview" />)
    expect(screen.getByText('Prévia')).toBeTruthy()
    expect(screen.getByText('Pull Request')).toBeTruthy()
  })

  it('no fluxo PR automático a trilha pula a prévia', () => {
    render(<StageSteps stage="opening_pr" runState="running" flow="auto_pr" />)
    expect(screen.queryByText('Prévia')).toBeNull()
    expect(screen.getByText('Implementação')).toBeTruthy()
    expect(screen.getByText('Pull Request')).toBeTruthy()
  })

  it('Agente Adversário: passo "Revisão adversária" depois da Implementação', () => {
    const { rerender } = render(<StageSteps stage="adversarial_blocked" runState="idle" flow="preview" adversarial />)
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(steps.slice(1, 3)).toEqual(['Implementação', '3Revisão adversária'])
    expect(screen.getByText('Revisão adversária').closest('li')!.getAttribute('aria-current')).toBe('step')
    rerender(<StageSteps stage="implementing" runState="running" flow="preview" />)
    expect(screen.queryByText('Revisão adversária')).toBeNull()
  })
})
