/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { InProgressWorkbenchDto } from '@/features/agentic/types'

import { WorkbenchWaitingLink } from '@/features/agentic/components/WorkbenchWaitingLink'

const TASK = 'a'.repeat(24)

const item = (overrides: Partial<InProgressWorkbenchDto> = {}): Pick<InProgressWorkbenchDto, 'runState' | 'running' | 'waitingFor'> => ({
  runState: 'idle',
  running: false,
  waitingFor: 'Aguardando revisão do plano',
  ...overrides,
})

const link = (name = 'Abrir a mesa de OPX-1 — Aguardando revisão do plano') => screen.getByRole('link', { name })

describe('WorkbenchWaitingLink', () => {
  it('aponta para a mesa de trabalho (tarefa)', () => {
    render(<WorkbenchWaitingLink taskId={TASK} taskCode="OPX-1" item={item()} />)
    expect(link().getAttribute('href')).toBe(`/desenvolvimento/${TASK}`)
    expect(link().getAttribute('title')).toBe('Aguardando revisão do plano')
  })

  it('interrompe a propagação para não abrir a tarefa nem iniciar o arraste', () => {
    const onClick = vi.fn()
    const onPointerDown = vi.fn()
    render(
      <div onClick={onClick} onPointerDown={onPointerDown}>
        <WorkbenchWaitingLink taskId={TASK} taskCode="OPX-1" item={item()} />
      </div>,
    )
    fireEvent.click(link())
    fireEvent.pointerDown(link())
    expect(onClick).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
  })

  it('usa o tom de falha quando a etapa falhou e o tom de espera caso contrário', () => {
    const { unmount } = render(<WorkbenchWaitingLink taskId={TASK} taskCode="OPX-1" item={item()} />)
    expect(link().className).toContain('text-warning')
    unmount()
    render(<WorkbenchWaitingLink taskId={TASK} taskCode="OPX-1" item={item({ runState: 'failed', waitingFor: 'A etapa falhou — use Tentar novamente' })} />)
    expect(link('Abrir a mesa de OPX-1 — A etapa falhou — use Tentar novamente').className).toContain('text-destructive')
  })

  it('não renderiza enquanto o agente executa nem sem motivo de espera', () => {
    const { unmount } = render(<WorkbenchWaitingLink taskId={TASK} taskCode="OPX-1" item={item({ running: true, waitingFor: null, runState: 'running' })} />)
    expect(screen.queryByRole('link')).toBeNull()
    unmount()
    render(<WorkbenchWaitingLink taskId={TASK} taskCode="OPX-1" item={item({ waitingFor: null })} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
