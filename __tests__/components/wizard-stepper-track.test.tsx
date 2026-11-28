/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ClipboardCheck, Rocket, Tag, Users } from 'lucide-react'

/**
 * Trilha do `WizardStepper` (OPE-215 v5): com `statuses`, verde até a última etapa concluída ou pulada e
 * roxa até a atual; sem `statuses`, uma barra só (contrato dos outros assistentes). O mock expõe o
 * `scaleX` animado em `data-scale`.
 */
vi.mock('framer-motion', () => {
  const motionTag = (tag: string) =>
    function Motion({ children, animate, ...props }: Record<string, unknown> & { children?: React.ReactNode; animate?: { scaleX?: number } }) {
      const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !['initial', 'transition', 'exit'].includes(key)))
      return React.createElement(tag, { ...domProps, 'data-scale': animate?.scaleX }, children)
    }
  return { motion: new Proxy({}, { get: (_, tag: string) => motionTag(tag) }), AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, useReducedMotion: () => true }
})

import { WizardStepper } from '@/components/wizard/WizardStepper'

const STEPS = [
  { id: 'a', label: 'Informações', icon: Users },
  { id: 'b', label: 'Provisionamento', icon: Tag },
  { id: 'c', label: 'Ambiente', icon: Rocket },
  { id: 'd', label: 'Concluído', icon: ClipboardCheck },
]

const scale = (testId: string) => Number(screen.getByTestId(testId).getAttribute('data-scale'))

afterEach(() => cleanup())

describe('trilha do WizardStepper', () => {
  it('verde até a última concluída e roxa até a atual', () => {
    render(<WizardStepper steps={STEPS} current={1} maxReachable={1} onStepClick={vi.fn()} statuses={['done', 'running', 'idle', 'idle']} trackIndex={1} />)
    expect(scale('wizard-track-resolved')).toBe(0.5 / 4)
    expect(scale('wizard-track')).toBe(1.5 / 4)
    expect(screen.getByTestId('wizard-track-resolved').className).toContain('bg-success')
  })

  it('etapa pulada conta como resolvida, com o rótulo "não se aplica"; concluído deixa a linha toda verde até o fim', () => {
    render(<WizardStepper steps={STEPS} current={3} maxReachable={3} onStepClick={vi.fn()} statuses={['done', 'done', 'skipped', 'done']} trackIndex={3} />)
    expect(scale('wizard-track-resolved')).toBe(3.5 / 4)
    expect(scale('wizard-track-resolved')).toBe(scale('wizard-track'))
    expect(screen.getByRole('button', { name: 'Etapa 3: Ambiente (não se aplica)' }).getAttribute('data-status')).toBe('skipped')
  })

  it('nenhuma concluída: sem verde', () => {
    render(<WizardStepper steps={STEPS} current={0} maxReachable={0} onStepClick={vi.fn()} statuses={['running', 'idle', 'idle', 'idle']} />)
    expect(scale('wizard-track-resolved')).toBe(0)
  })

  it('sem `statuses`, só a barra roxa até a atual (os outros assistentes não mudam)', () => {
    render(<WizardStepper steps={STEPS} current={2} maxReachable={2} onStepClick={vi.fn()} />)
    expect(screen.queryByTestId('wizard-track-resolved')).toBeNull()
    expect(scale('wizard-track')).toBe(2.5 / 4)
  })
})
