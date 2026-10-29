/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useSetWorkbenchStage: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }) }))

import { SetStageDialog } from '@/features/agentic/components/workbench/SetStageDialog'
import type { WorkbenchDto } from '@/features/agentic/types'

const workbench = (patch: Partial<WorkbenchDto> = {}) =>
  ({ id: 'w1', taskId: 't1', taskCode: 'MT-18', stage: 'plan_review', runState: 'idle', plans: [{ version: 1 }], previewUrl: null, pr: null, branch: null, slotQueue: null, deletionRequestedAt: null, ...patch }) as unknown as WorkbenchDto

const radio = (name: string) => screen.getAllByRole('radio').find((element) => element.textContent === name)!

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mutateAsync.mockResolvedValue({ id: 'w1', stage: 'done' })
})

describe('SetStageDialog', () => {
  it('abre em Concluída e conclui com o motivo informado', async () => {
    const onOpenChange = vi.fn()
    render(<SetStageDialog workbench={workbench()} open initialStage="done" onOpenChange={onOpenChange} />)
    expect(radio('Concluída').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('stage-effect').textContent).toContain('Ao concluir')
    const submit = screen.getByRole('button', { name: /Concluir mesa/ }) as HTMLButtonElement
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Já resolvido' } })
    await waitFor(() => expect(submit.disabled).toBe(false))
    fireEvent.click(submit)
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ stage: 'done', reason: 'Já resolvido' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('etapas sem pré-requisito ficam desativadas, com o motivo, e não envia sem motivo', async () => {
    render(<SetStageDialog workbench={workbench()} open initialStage="done" onOpenChange={vi.fn()} />)
    expect((radio('PR aberto') as HTMLButtonElement).disabled).toBe(true)
    expect((radio('Plano pronto') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('Etapas indisponíveis').textContent).toContain('A mesa não tem um Pull Request aberto')
    fireEvent.click(screen.getByRole('button', { name: /Concluir mesa/ }))
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('avisa que o turno em andamento será interrompido', () => {
    render(<SetStageDialog workbench={workbench({ stage: 'implementing', runState: 'running' })} open initialStage="done" onOpenChange={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('será interrompido')
  })
})
