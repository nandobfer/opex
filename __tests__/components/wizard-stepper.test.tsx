/** @vitest-environment happy-dom */

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

  it('sem `statuses`, não mostra estado nem barra de progresso (contrato antigo)', () => {
    render(<WizardStepper steps={STEPS} current={1} maxReachable={1} onStepClick={vi.fn()} />)
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Etapa 1: Segmento' }).hasAttribute('data-status')).toBe(false)
  })

  it('com `statuses`, cada etapa mostra o próprio estado, o progresso e o rótulo extra', () => {
    render(<WizardStepper steps={STEPS} current={1} maxReachable={1} onStepClick={vi.fn()} statuses={['done', 'failed', 'idle']} progress={[1, 0.45, 0]} badges={[null, 'Tentativa 3', null]} />)
    expect(screen.getByRole('button', { name: 'Etapa 1: Segmento (concluída)' }).getAttribute('data-status')).toBe('done')
    expect(screen.getByRole('button', { name: 'Etapa 2: Oferta (falhou)' }).getAttribute('data-status')).toBe('failed')
    expect(screen.getByRole('progressbar', { name: 'Progresso de Oferta' }).getAttribute('aria-valuenow')).toBe('45')
    expect(screen.getByText('Tentativa 3')).toBeTruthy()
  })
})
