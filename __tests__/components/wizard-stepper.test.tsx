/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Tag, Users, ClipboardCheck } from 'lucide-react'
import { framerMotionMock } from '../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { WizardStepper } from '@/components/wizard/WizardStepper'

const STEPS = [
  { id: 'a', label: 'Segmento', icon: Users },
  { id: 'b', label: 'Oferta', icon: Tag },
  { id: 'c', label: 'Confirmar', icon: ClipboardCheck },
]

afterEach(() => cleanup())

describe('WizardStepper', () => {
  it('marca a etapa atual e navega só até a maior etapa alcançada', () => {
    const onStepClick = vi.fn()
    render(<WizardStepper steps={STEPS} current={1} maxReachable={1} onStepClick={onStepClick} />)

    expect(screen.getByRole('button', { name: 'Etapa 2: Oferta' }).getAttribute('aria-current')).toBe('step')
    const locked = screen.getByRole('button', { name: 'Etapa 3: Confirmar' }) as HTMLButtonElement
    expect(locked.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Etapa 1: Segmento' }))
    expect(onStepClick).toHaveBeenCalledWith(0)
    fireEvent.click(locked)
    expect(onStepClick).toHaveBeenCalledTimes(1)
  })

  it('mostra o alerta com os campos pendentes da etapa e trava tudo quando desabilitado', () => {
    render(<WizardStepper steps={STEPS} current={0} maxReachable={2} pending={[['Nome da campanha', 'Segmento'], [], []]} disabled onStepClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Campos pendentes: Nome da campanha, Segmento' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Etapa 2: Oferta' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
