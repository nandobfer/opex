/** @vitest-environment jsdom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

const mocks = vi.hoisted(() => ({
    refinement: vi.fn(),
    start: vi.fn(),
    action: vi.fn(),
    stream: vi.fn(),
}))

vi.mock('@/features/refinement/hooks/useRefinement', () => ({
    useRefinementRealtime: vi.fn(),
    useTaskRefinement: mocks.refinement,
    useStartRefinement: mocks.start,
    useRefinementAction: mocks.action,
}))
vi.mock('@/features/refinement/hooks/useRefinementStream', () => ({ useRefinementStream: mocks.stream }))
vi.mock('@/features/agentic/components/workbench/Timeline', () => ({ Timeline: () => <div data-testid="timeline" /> }))
vi.mock('@/features/refinement/components/RefinementRequests', () => ({ RefinementRequests: () => <div data-testid="requests" /> }))

import { RefinementPanel } from '@/features/refinement/components/RefinementPanel'

const startMutate = vi.fn()

const state = (overrides: { availability?: { available: boolean; reason: string | null }; refinement?: unknown }) => ({
    data: { refinement: overrides.refinement ?? null, availability: overrides.availability ?? { available: true, reason: null } },
    isLoading: false,
    isError: false,
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.refinement.mockReturnValue(state({}))
    mocks.start.mockReturnValue({ mutate: startMutate, isPending: false })
    mocks.action.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mocks.stream.mockReturnValue({ timeline: { loaded: true, items: [], reasoning: false }, connected: true })
})

afterEach(cleanup)

describe('RefinementPanel', () => {
    it('sem refinamento e disponível mostra o CTA e inicia ao clicar', () => {
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        const cta = screen.getByRole('button', { name: 'Refinar tarefa OPX-1' })
        fireEvent.click(cta)
        expect(startMutate).toHaveBeenCalledTimes(1)
    })

    it('indisponível mostra o motivo e não oferece o CTA', () => {
        mocks.refinement.mockReturnValue(state({ availability: { available: false, reason: 'Crie uma central de desenvolvimento para Opex' } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getAllByText(/central de desenvolvimento/).length).toBeGreaterThan(0)
        expect(screen.queryByRole('button', { name: /Refinar tarefa/ })).toBeNull()
    })

    it('com refinamento rodando mostra a saída, as perguntas e o botão Parar', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { runState: 'running', resolved: false, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByTestId('timeline')).not.toBeNull()
        expect(screen.getByTestId('requests')).not.toBeNull()
        expect(screen.getByRole('button', { name: /Parar/ })).not.toBeNull()
    })

    it('no turno de consolidação mostra "Consolidando a especificação técnica…"', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { runState: 'running', resolved: false, finalizing: true, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByText(/Consolidando a especificação técnica/)).not.toBeNull()
    })

    it('com intenção de iniciar (autoStart) inicia uma vez e avisa o pai', () => {
        const onAutoStarted = vi.fn()
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" autoStart onAutoStarted={onAutoStarted} />)
        expect(startMutate).toHaveBeenCalledTimes(1)
        expect(onAutoStarted).toHaveBeenCalledTimes(1)
    })

    it('esclarecido mostra o aviso de especificação salva', () => {
        mocks.refinement.mockReturnValue(state({ refinement: { runState: 'idle', resolved: true, sessionDirectory: '/repo/opex', pendingForms: [], pendingPermissions: [] } }))
        render(<RefinementPanel taskId="t1" taskCode="OPX-1" />)
        expect(screen.getByText(/esclarecida e salva na tarefa/)).not.toBeNull()
        expect(screen.queryByRole('button', { name: /Continuar/ })).toBeNull()
    })
})
