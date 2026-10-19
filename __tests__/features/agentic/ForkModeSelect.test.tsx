/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), discard: vi.fn(), openFork: vi.fn() }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/agentic/hooks/useForks', () => ({
  useForkAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useDiscardFork: () => ({ mutate: mocks.discard, isPending: false }),
  useOpenFork: () => ({ mutate: mocks.openFork, isPending: false }),
}))

import { ForkActionBar } from '@/features/agentic/components/workbench/ForkActionBar'
import { ForkComposer } from '@/features/agentic/components/workbench/ForkComposer'
import { ForkModeSelect } from '@/features/agentic/components/workbench/ForkModeSelect'
import type { ForkDto } from '@/features/agentic/types'

const fork = (patch: Partial<ForkDto> = {}): ForkDto => ({
  id: 'f1',
  workbenchId: 'w1',
  number: 3,
  parentForkId: null,
  parentNumber: null,
  status: 'active',
  runState: 'idle',
  error: null,
  origin: 'fork',
  mode: 'plan',
  readOnly: false,
  forkedFromStage: 'plan_review',
  summary: null,
  integration: null,
  pendingPermissions: [],
  pendingForms: [],
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  createdAt: '2026-10-16T12:00:00.000Z',
  updatedAt: '2026-10-16T12:00:00.000Z',
  closedAt: null,
  ...patch,
})

const radio = (name: RegExp) => screen.getByRole('radio', { name }) as HTMLButtonElement

beforeEach(() => vi.clearAllMocks())

describe('ForkModeSelect', () => {
  it('troca entre Plan e Build com o agente parado (sem disparar ao clicar no modo atual)', () => {
    const onChange = vi.fn()
    render(<ForkModeSelect fork={fork()} onChange={onChange} onLock={vi.fn()} />)
    expect(radio(/^Plan/).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radio(/^Plan/))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(radio(/^Build/))
    expect(onChange).toHaveBeenCalledWith('build')
  })

  it('agente respondendo ou fork fora de aberto: modo e trava bloqueados', () => {
    const { rerender } = render(<ForkModeSelect fork={fork({ runState: 'running' })} onChange={vi.fn()} onLock={vi.fn()} />)
    expect(radio(/^Build/).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Travar/ }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<ForkModeSelect fork={fork({ status: 'integrated' })} onChange={vi.fn()} onLock={vi.fn()} />)
    expect(radio(/^Build/).disabled).toBe(true)
  })

  it('travar pede confirmação; cancelar não trava', () => {
    const onLock = vi.fn()
    render(<ForkModeSelect fork={fork({ mode: 'build' })} onChange={vi.fn()} onLock={onLock} />)
    fireEvent.click(screen.getByRole('button', { name: /Travar/ }))
    expect(screen.getByText('Travar o Fork 3 como somente leitura?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onLock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Travar/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Travar$/ }))
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('travado: só o selo de somente leitura, sem troca de modo', () => {
    render(<ForkModeSelect fork={fork({ readOnly: true })} onChange={vi.fn()} onLock={vi.fn()} />)
    expect(screen.getByText(/Somente leitura \(travado\)/)).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button', { name: /Travar/ })).toBeNull()
  })
})

describe('modo na barra e na abertura do fork', () => {
  it('a barra do fork envia set-mode e lock', () => {
    render(<ForkActionBar workbenchId="w1" fork={fork()} />)
    fireEvent.click(radio(/^Build/))
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'set-mode', mode: 'build' })
    fireEvent.click(screen.getByRole('button', { name: /Travar/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Travar$/ }))
    expect(mocks.mutate).toHaveBeenLastCalledWith({ action: 'lock' })
  })

  it('fork concluído não mostra o seletor de modo', () => {
    render(<ForkActionBar workbenchId="w1" fork={fork({ status: 'integrated' })} extra={<span>extra</span>} />)
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('a caixa "Somente leitura" na abertura envia readOnly (desmarcada por padrão)', () => {
    const { unmount } = render(<ForkComposer workbenchId="w1" onCancel={vi.fn()} onOpened={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('O que você quer perguntar ou investigar no fork?'), { target: { value: 'Investigue X' } })
    fireEvent.click(screen.getByRole('button', { name: /Abrir fork/ }))
    expect(mocks.openFork).toHaveBeenLastCalledWith({ text: 'Investigue X', parentForkId: undefined, readOnly: false }, expect.anything())
    unmount()

    render(<ForkComposer workbenchId="w1" parent={{ id: 'f1', number: 1 }} onCancel={vi.fn()} onOpened={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('O que você quer perguntar ou investigar no fork?'), { target: { value: 'E o Y?' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Abrir fork/ }))
    expect(mocks.openFork).toHaveBeenLastCalledWith({ text: 'E o Y?', parentForkId: 'f1', readOnly: true }, expect.anything())
  })
})
