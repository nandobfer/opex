/** @vitest-environment happy-dom */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { compactStepPosition, StageSteps } from '@/features/agentic/components/workbench/StageSteps'

/** A trilha completa (desktop); a forma compacta do celular é outro bloco (OPE-166). */
const trail = () => within(screen.getByRole('list', { name: 'Etapas da mesa' }))

describe('StageSteps · fluxo da mesa', () => {
  it('no fluxo Publicar prévia mostra o passo "Prévia"', () => {
    render(<StageSteps stage="preview" runState="idle" flow="preview" />)
    expect(trail().getByText('Prévia')).toBeTruthy()
    expect(trail().getByText('Pull Request')).toBeTruthy()
  })

  it('no fluxo PR automático a trilha pula a prévia', () => {
    render(<StageSteps stage="opening_pr" runState="running" flow="auto_pr" />)
    expect(screen.queryByText('Prévia')).toBeNull()
    expect(trail().getByText('Implementação')).toBeTruthy()
    expect(trail().getByText('Pull Request')).toBeTruthy()
  })

  it('Agente Adversário: passo "Revisão adversária" depois da Implementação', () => {
    const { rerender } = render(<StageSteps stage="adversarial_blocked" runState="idle" flow="preview" adversarial />)
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(steps.slice(1, 3)).toEqual(['Implementação', '3Revisão adversária'])
    expect(trail().getByText('Revisão adversária').closest('li')!.getAttribute('aria-current')).toBe('step')
    rerender(<StageSteps stage="implementing" runState="running" flow="preview" />)
    expect(screen.queryByText('Revisão adversária')).toBeNull()
  })
})

describe('StageSteps · celular (OPE-166)', () => {
  it('abaixo de lg mostra "Etapa N de M · Nome" numa linha e esconde a trilha completa', () => {
    render(<StageSteps stage="preview" runState="idle" flow="preview" />)
    const compact = screen.getByTestId('compact-stage-steps')
    expect(compact.className).toContain('lg:hidden')
    expect(compact.textContent).toBe('Etapa 3 de 5 · Prévia')
    expect(screen.getByRole('list', { name: 'Etapas da mesa' }).className).toContain('max-lg:hidden')
  })

  it('mesa concluída conta como o último passo; a posição nunca fica abaixo de 1', () => {
    expect(compactStepPosition(5, 4, true)).toEqual({ position: 5, progress: 1 })
    expect(compactStepPosition(5, -1, false)).toEqual({ position: 1, progress: 0.2 })
  })
})
