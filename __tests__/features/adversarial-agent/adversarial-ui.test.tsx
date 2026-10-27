/** @vitest-environment jsdom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  review: null as unknown,
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/adversarial-agent/hooks/useAdversarial', () => ({
  useWorkbenchAdversarialReview: () => ({ data: mocks.review, isLoading: false }),
  useAdversarialRealtime: vi.fn(),
  useAdversarialWorkbenchAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useAdversarialReview: () => ({ data: null, isLoading: false, isError: false }),
}))

import { CriticalityCard } from '@/features/adversarial-agent/components/settings/CriticalityCard'
import { FlowCard } from '@/features/adversarial-agent/components/settings/FlowCard'
import { AdversarialActions } from '@/features/adversarial-agent/components/workbench/AdversarialActions'
import { AdversarialVerdictItem } from '@/features/adversarial-agent/components/workbench/AdversarialVerdictItem'
import { ReplyTargetProvider } from '@/components/agent-reply/ReplyTargetProvider'
import { DEFAULT_ADVERSARIAL_SETTINGS, type AdversarialSettings } from '@/features/adversarial-agent/schemas'
import type { WorkbenchDto } from '@/features/agentic/types'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function WithForm({ children, values = {} }: { children: (form: ReturnType<typeof useForm<AdversarialSettings>>) => React.ReactNode; values?: Partial<AdversarialSettings> }) {
  const form = useForm<AdversarialSettings>({ defaultValues: { ...DEFAULT_ADVERSARIAL_SETTINGS, ...values } })
  return <>{children(form)}</>
}

describe('aba do Agente Adversário', () => {
  it('criticidade: slider com os 5 níveis em texto; trocar o nível troca o que bloqueia', () => {
    render(<WithForm>{(form) => <CriticalityCard form={form} />}</WithForm>)
    for (const label of ['Liberal', 'Tolerante', 'Equilibrado', 'Rigoroso', 'Implacável']) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText(/Bloqueia \(a partir de Médio\)/)).toBeTruthy()
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Equilibrado')
    fireEvent.click(screen.getByText('Liberal'))
    expect(screen.getByText(/Bloqueia \(a partir de Crítico\)/)).toBeTruthy()
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Liberal')
  })

  it('rodadas: "Sem limite" avisa como o ciclo termina; confirmação esconde as rodadas', () => {
    render(<WithForm>{(form) => <FlowCard form={form} />}</WithForm>)
    expect(screen.getByLabelText('Máximo de rodadas')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Sem limite' }))
    expect(screen.getByText(/o ciclo só termina quando o adversário aprovar/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Pedir confirmação' }))
    expect(screen.queryByText('Rodadas de correção')).toBeNull()
  })
})

const workbench = (overrides: Partial<WorkbenchDto> = {}) => ({ id: 'w1', taskId: 't1', centralId: 'c1', stage: 'adversarial_blocked', runState: 'idle', sessionId: 'sess-1', slotQueue: null, agenticFlow: 'preview', ...overrides }) as WorkbenchDto

const finding = (id: string, blocking: boolean) => ({ id, severity: 'high', category: 'bug', title: `Problema ${id}`, file: 'src/a.ts', line: 2, evidence: 'x', scenario: 'y', suggestion: 'z', inDiff: true, carriedOver: false, introducedByFix: false, blocking, demotedReason: blocking ? null : 'Fora do código alterado nesta mesa' })

describe('mesa: decisões depois do bloqueio', () => {
  it('lista os achados, permite desmarcar e manda corrigir só os marcados com a orientação', () => {
    mocks.review = { round: 1, limitReached: false, findings: [finding('F1', true), finding('F2', true), finding('F3', false)] }
    render(
      <ReplyTargetProvider>
        <AdversarialActions workbench={workbench()} />
      </ReplyTargetProvider>,
    )
    expect(screen.getByText('Problema F3')).toBeTruthy()
    expect(screen.getByText(/Não bloqueia: Fora do código alterado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Corrigir \(2\)/ })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Corrigir F2'))
    fireEvent.change(screen.getByLabelText('Orientação ao implementador (opcional)'), { target: { value: 'F2 é intencional' } })
    fireEvent.click(screen.getByRole('button', { name: /Corrigir \(1\)/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'adversarial-fix', input: { text: 'F2 é intencional', excluded: ['F2'] } }, expect.anything())
  })

  it('revisão que falhou: só "Seguir mesmo assim" (com confirmação)', () => {
    render(<AdversarialActions workbench={workbench({ stage: 'adversarial_review', runState: 'failed' })} />)
    expect(screen.queryByRole('button', { name: /Corrigir/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir mesmo assim' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Seguir mesmo assim' }).at(-1)!)
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'adversarial-skip' }, expect.anything())
  })

  it('fora das etapas do adversário não aparece', () => {
    const { container } = render(<AdversarialActions workbench={workbench({ stage: 'preview' })} />)
    expect(container.textContent).toBe('')
  })

  it('veredito na saída da mesa: desfecho e achados', () => {
    render(<AdversarialVerdictItem reviewId="r1" round={2} level="Equilibrado" summary="Um bug" outcome="Bloqueou: corrigindo automaticamente" findings={[{ id: 'F1', severity: 'critical', title: 'Perde dados', file: 'a.ts', line: 1, blocking: true, demotedReason: null }]} />)
    expect(screen.getByText('Agente adversário · rodada 2')).toBeTruthy()
    expect(screen.getByText('Bloqueou: corrigindo automaticamente')).toBeTruthy()
    expect(screen.getByText('Perde dados')).toBeTruthy()
  })
})
