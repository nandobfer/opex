/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))

import { CentralsPane } from '@/features/agentic/components/dev-center/CentralsPane'
import { CollapsiblePane, PaneToggle } from '@/features/agentic/components/dev-center/CollapsiblePane'
import { DEFAULT_DEV_CENTER_LAYOUT, DEV_CENTER_LAYOUT_KEY, devCenterLayoutSchema } from '@/features/agentic/dev-center-layout'
import { useDevCenterLayout } from '@/features/agentic/hooks/useDevCenterLayout'
import type { CentralDto } from '@/features/agentic/types'

let wide = true
beforeEach(() => {
  window.localStorage.clear()
  wide = true
  window.matchMedia = vi.fn(() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
})
afterEach(() => vi.clearAllMocks())

describe('layout da Central de desenvolvimento', () => {
  it('padrão: tudo aberto; valor salvo inválido volta ao padrão', () => {
    expect(devCenterLayoutSchema.safeParse({ centralsCollapsed: 'sim' }).success).toBe(false)
    window.localStorage.setItem(DEV_CENTER_LAYOUT_KEY, '{"centralsCollapsed":"sim"}')
    const { result } = renderHook(() => useDevCenterLayout())
    expect(result.current.centralsCollapsed).toBe(DEFAULT_DEV_CENTER_LAYOUT.centralsCollapsed)
    expect(result.current.tasksCollapsed).toBe(false)
  })

  it('recolher fica salvo no navegador', () => {
    const { result } = renderHook(() => useDevCenterLayout())
    act(() => result.current.toggleTasks())
    expect(result.current.tasksCollapsed).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(DEV_CENTER_LAYOUT_KEY)!)).toEqual({ centralsCollapsed: false, tasksCollapsed: true })
  })

  it('telas estreitas (colunas empilhadas) ignoram o recolhido', () => {
    wide = false
    window.localStorage.setItem(DEV_CENTER_LAYOUT_KEY, JSON.stringify({ centralsCollapsed: true, tasksCollapsed: true }))
    const { result } = renderHook(() => useDevCenterLayout())
    expect(result.current.wide).toBe(false)
    expect(result.current.centralsCollapsed).toBe(false)
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

describe('CentralsPane recolhida', () => {
  const central = (id: string, projectName: string) => ({ id, projectId: id, projectName, runningWorkbenches: 0, config: { enabled: true } }) as unknown as CentralDto

  it('a faixa continua navegável entre as centrais e permite expandir', () => {
    const onToggle = vi.fn()
    render(<CentralsPane centrals={[central('c1', 'Portal'), central('c2', 'App')]} activeId="c1" collapsed wide onToggle={onToggle} />)
    const links = screen.getAllByRole('link', { name: /Portal|App/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/desenvolvimento/c1', '/desenvolvimento/c2'])
    expect(links[0]!.getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir lista de centrais' }))
    expect(onToggle).toHaveBeenCalled()
  })
})
