/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_UNIVERSE_LAYOUT } from '@engramind/client'
import { framerMotionMock } from '../../helpers/framer-motion'
import { flowItems, xyflowMock } from '../../helpers/xyflow'

/** OPE-142: a prévia da aba Visualização desenha o universo real da lib com memórias de exemplo e o layout em edição. */

vi.mock('framer-motion', () => ({ ...framerMotionMock(), useReducedMotion: () => true }))
vi.mock('@xyflow/react', () => xyflowMock())
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), api: net }))

import { UniverseLayoutPreview } from '@/features/engramind/components/integration/universe-layout/UniverseLayoutPreview'

const wrap = (config = DEFAULT_UNIVERSE_LAYOUT) => render(<QueryClientProvider client={new QueryClient()}><UniverseLayoutPreview config={config} /></QueryClientProvider>)
const memoryNodes = () => flowItems.nodes.filter((node) => node.type === 'memory') as unknown as { id: string; position: { x: number; y: number } }[]
const radii = () => memoryNodes().map((node) => Math.hypot(node.position.x, node.position.y))

afterEach(cleanup)

describe('prévia da aba Visualização', () => {
  it('desenha o universo do agente com 120 memórias de exemplo e não consulta nada na rede', () => {
    wrap()
    expect(memoryNodes()).toHaveLength(120)
    expect(Math.min(...radii())).toBeCloseTo(150, 0)
    expect(net.get).not.toHaveBeenCalled()
  })

  it('segue o layout em edição: outro raio inicial e espiral', () => {
    wrap({ ...DEFAULT_UNIVERSE_LAYOUT, firstRadius: 260 })
    expect(Math.min(...radii())).toBeCloseTo(260, 0)
    cleanup()
    wrap({ ...DEFAULT_UNIVERSE_LAYOUT, layout: 'spiral' })
    expect(new Set(radii().map((radius) => Math.round(radius))).size).toBeGreaterThan(60)
  })

  it('quantidade, canais e centro da prévia são controles locais', async () => {
    wrap()
    fireEvent.change(screen.getByLabelText('Memórias de exemplo'), { target: { value: '40' } })
    await waitFor(() => expect(memoryNodes()).toHaveLength(40))
    fireEvent.change(screen.getByLabelText('Memórias de exemplo'), { target: { value: '9999' } })
    await waitFor(() => expect(memoryNodes()).toHaveLength(500))
    fireEvent.change(screen.getByLabelText('Memórias de exemplo'), { target: { value: '120' } })
    await waitFor(() => expect(memoryNodes()).toHaveLength(120))
    fireEvent.click(screen.getByRole('radio', { name: 'Canal' }))
    await waitFor(() => expect(memoryNodes().length).toBeLessThan(120))
    expect(memoryNodes().length).toBeGreaterThan(0)
  })
})
