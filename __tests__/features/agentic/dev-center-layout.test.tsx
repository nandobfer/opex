/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { CollapsiblePane, PaneToggle } from '@/features/agentic/components/dev-center/CollapsiblePane'
import { DEFAULT_DEV_CENTER_LAYOUT, DEV_CENTER_LAYOUT_KEY, devCenterLayoutSchema } from '@/features/agentic/dev-center-layout'
import { useDevCenterLayout } from '@/features/agentic/hooks/useDevCenterLayout'

let wide = true
beforeEach(() => {
  window.localStorage.clear()
  wide = true
  window.matchMedia = vi.fn(() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
})
afterEach(() => vi.clearAllMocks())

describe('layout da Central de desenvolvimento', () => {
  it('padrão: coluna de tarefas aberta; valor salvo inválido volta ao padrão', () => {
    expect(devCenterLayoutSchema.safeParse({ tasksCollapsed: 'sim' }).success).toBe(false)
    window.localStorage.setItem(DEV_CENTER_LAYOUT_KEY, '{"tasksCollapsed":"sim"}')
    const { result } = renderHook(() => useDevCenterLayout())
    expect(result.current.tasksCollapsed).toBe(DEFAULT_DEV_CENTER_LAYOUT.tasksCollapsed)
  })

  it('recolher fica salvo no navegador', () => {
    const { result } = renderHook(() => useDevCenterLayout())
    act(() => result.current.toggleTasks())
    expect(result.current.tasksCollapsed).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(DEV_CENTER_LAYOUT_KEY)!)).toEqual({ tasksCollapsed: true })
  })

  it('telas estreitas (colunas empilhadas) ignoram o recolhido', () => {
    wide = false
    window.localStorage.setItem(DEV_CENTER_LAYOUT_KEY, JSON.stringify({ tasksCollapsed: true }))
    const { result } = renderHook(() => useDevCenterLayout())
    expect(result.current.wide).toBe(false)
    expect(result.current.tasksCollapsed).toBe(false)
  })
})

describe('CollapsiblePane', () => {
  it('recolhida mostra a faixa e mantém o conteúdo montado, escondido', () => {
    const { rerender } = render(
      <CollapsiblePane label="lista de tarefas" width={340} collapsed={false} wide rail={<span>faixa</span>}>
        <p>conteúdo</p>
      </CollapsiblePane>,
    )
    expect(screen.queryByText('faixa')).toBeNull()
    rerender(
      <CollapsiblePane label="lista de tarefas" width={340} collapsed wide rail={<span>faixa</span>}>
        <p>conteúdo</p>
      </CollapsiblePane>,
    )
    expect(screen.getByText('faixa')).toBeTruthy()
    expect(screen.getByText('conteúdo').parentElement!.classList.contains('hidden')).toBe(true)
  })

  it('PaneToggle informa o estado e alterna', () => {
    const onToggle = vi.fn()
    render(<PaneToggle label="lista de tarefas" collapsed={false} onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: 'Recolher lista de tarefas' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
